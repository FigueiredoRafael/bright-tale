/**
 * M-006 — Support chatbot (gpt-4o-mini streaming SSE)
 * M-008 — Support escalation queue (admin)
 *
 * The `support_threads` and `support_messages` tables are new and not yet
 * in the auto-generated database.ts types. All Supabase queries for these
 * tables are cast via `as unknown as` until `npm run db:types` is re-run.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OpenAI } from 'openai';
import type { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions';
import { authenticateWithUser, authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { ApiError } from '../lib/api/errors.js';
import { sendError } from '../lib/api/fastify-errors.js';

// ---------------------------------------------------------------------------
// Supabase typed helpers for tables not yet in generated types
// ---------------------------------------------------------------------------

interface SupportThreadRow {
  id: string;
  user_id: string;
  status: string;
  priority: string | null;
  escalation_summary: string | null;
  assigned_to: string | null;
  user_rating: number | null;
  rating_comment: string | null;
  rated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SupportMessageRow {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  created_at: string;
}

interface SupabaseQueryBuilder<T> {
  select(cols: string): SupabaseQueryBuilder<T>;
  insert(data: Partial<T> | Partial<T>[]): SupabaseQueryBuilder<T>;
  update(data: Partial<Record<string, unknown>>): SupabaseQueryBuilder<T>;
  eq(col: string, val: string): SupabaseQueryBuilder<T>;
  neq(col: string, val: string): SupabaseQueryBuilder<T>;
  in(col: string, vals: string[]): SupabaseQueryBuilder<T>;
  order(col: string, opts?: { ascending: boolean }): SupabaseQueryBuilder<T>;
  limit(n: number): SupabaseQueryBuilder<T>;
  single(): Promise<{ data: T | null; error: unknown }>;
  maybeSingle(): Promise<{ data: T | null; error: unknown }>;
  then(resolve: (val: { data: T[] | null; error: unknown }) => void): void;
}

type UntypedSupabase = {
  from: (table: string) => SupabaseQueryBuilder<Record<string, unknown>>;
};

function supportThreads(sb: ReturnType<typeof createServiceClient>) {
  return (sb as unknown as UntypedSupabase).from('support_threads') as unknown as SupabaseQueryBuilder<SupportThreadRow>;
}

function supportMessages(sb: ReturnType<typeof createServiceClient>) {
  return (sb as unknown as UntypedSupabase).from('support_messages') as unknown as SupabaseQueryBuilder<SupportMessageRow>;
}

// ---------------------------------------------------------------------------
// System prompt (pt-BR, embedded per spec)
// ---------------------------------------------------------------------------
const SUPPORT_SYSTEM_PROMPT = `Você é o assistente de suporte da BrightTale, uma plataforma de criação de conteúdo com IA.

Você resolve:
- Dúvidas sobre planos e funcionalidades
- Solicitações de reembolso (use a tool request_refund)
- Cancelamentos (use a tool cancel_subscription com save flow)
- Mudanças de plano
- Reset de senha (oriente a usar "Esqueci a senha" no login)

Seja direto, empático e resolva o problema na primeira resposta quando possível.
Responda sempre em português do Brasil.
Se não conseguir resolver em 7 mensagens, use a tool escalate.`;

// ---------------------------------------------------------------------------
// OpenAI tool definitions
// ---------------------------------------------------------------------------
const supportTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'lookup_user_plan',
      description: 'Retorna as informações do plano atual do usuário (nome do plano, créditos, etc). Não requer parâmetros.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_refund',
      description: 'Solicita um reembolso para o usuário. Marca como pendente para revisão administrativa.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Motivo do reembolso solicitado pelo usuário.' },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_subscription',
      description: 'Cancela a assinatura do usuário. Se save_flow_offer=true, ofereça um desconto antes de cancelar.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Motivo do cancelamento.' },
          save_flow_offer: { type: 'boolean', description: 'Se true, oferece desconto antes de efetivar o cancelamento.' },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate',
      description: 'Escala o ticket para um agente humano quando o assistente não consegue resolver.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Resumo do problema do usuário para o agente humano.' },
          priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], description: 'Prioridade: P0=crítico, P1=alto, P2=médio, P3=baixo.' },
        },
        required: ['summary', 'priority'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const chatBodySchema = z.object({
  threadId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

const patchThreadBodySchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface OrgContext {
  id: string;
  plan: string;
  credits_total: number;
  credits_used: number;
  credits_addon: number;
}

async function getOrgForUser(userId: string): Promise<OrgContext | null> {
  const sb = createServiceClient();
  const { data: membership } = await sb
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!membership) return null;

  const { data: org } = await sb
    .from('organizations')
    .select('id, plan, credits_total, credits_used, credits_addon')
    .eq('id', (membership as unknown as { org_id: string }).org_id)
    .single();

  if (!org) return null;

  const orgRow = org as unknown as {
    id: string;
    plan: string | null;
    credits_total: number | null;
    credits_used: number | null;
    credits_addon: number | null;
  };

  return {
    id: orgRow.id,
    plan: orgRow.plan ?? 'free',
    credits_total: orgRow.credits_total ?? 0,
    credits_used: orgRow.credits_used ?? 0,
    credits_addon: orgRow.credits_addon ?? 0,
  };
}

async function assertManager(userId: string): Promise<boolean> {
  const sb = createServiceClient();
  const { data } = await sb
    .from('managers')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  return data != null;
}

// ---------------------------------------------------------------------------
// Tool executor — implements each tool's side-effects
// ---------------------------------------------------------------------------
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  threadId: string,
  orgContext: OrgContext | null,
): Promise<string> {
  const sb = createServiceClient();

  if (toolName === 'lookup_user_plan') {
    if (!orgContext) {
      return JSON.stringify({ error: 'Nenhuma organização encontrada para este usuário.' });
    }
    const remaining = Math.max(0, orgContext.credits_total - orgContext.credits_used) + orgContext.credits_addon;
    return JSON.stringify({
      plan: orgContext.plan,
      credits_total: orgContext.credits_total,
      credits_used: orgContext.credits_used,
      credits_addon: orgContext.credits_addon,
      credits_remaining: remaining,
    });
  }

  if (toolName === 'request_refund') {
    const reason = typeof toolInput.reason === 'string' ? toolInput.reason : 'Sem motivo informado';
    await supportThreads(sb)
      .update({
        status: 'escalated',
        priority: 'P1',
        escalation_summary: `Solicitação de reembolso: ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId);
    return JSON.stringify({
      success: true,
      message: 'Solicitação de reembolso registrada e encaminhada para revisão administrativa.',
      reason,
    });
  }

  if (toolName === 'cancel_subscription') {
    const reason = typeof toolInput.reason === 'string' ? toolInput.reason : 'Sem motivo informado';
    const saveFlowOffer = toolInput.save_flow_offer === true;

    if (saveFlowOffer) {
      return JSON.stringify({
        success: true,
        save_flow: true,
        message: 'Ofereça ao usuário um desconto de 30% por 3 meses antes de efetivar o cancelamento.',
        coupon_code: 'SAVE30',
      });
    }

    await supportThreads(sb)
      .update({
        status: 'escalated',
        priority: 'P2',
        escalation_summary: `Cancelamento solicitado: ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId);

    return JSON.stringify({
      success: true,
      message: 'Cancelamento registrado e encaminhado para processamento. A assinatura será cancelada ao final do período vigente.',
      reason,
    });
  }

  if (toolName === 'escalate') {
    const summary = typeof toolInput.summary === 'string' ? toolInput.summary : '';
    const priority = typeof toolInput.priority === 'string' ? toolInput.priority : 'P2';

    await supportThreads(sb)
      .update({
        status: 'escalated',
        priority,
        escalation_summary: summary,
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId);

    return JSON.stringify({
      success: true,
      message: 'Ticket escalado para agente humano. Você receberá uma resposta em breve.',
      priority,
    });
  }

  return JSON.stringify({ error: `Tool desconhecida: ${toolName}` });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
export async function supportRoutes(fastify: FastifyInstance): Promise<void> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // ── POST /support/chat ────────────────────────────────────────────────────
  fastify.post('/chat', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    let body: z.infer<typeof chatBodySchema>;
    try {
      body = chatBodySchema.parse(request.body);
    } catch (err) {
      return sendError(reply, err);
    }

    const sb = createServiceClient();
    let threadId = body.threadId;

    // Create or load thread
    if (!threadId) {
      const { data: newThread, error: threadErr } = await supportThreads(sb)
        .insert({ user_id: request.userId, status: 'open' })
        .select('id')
        .single();

      if (threadErr || !newThread) {
        throw new ApiError(500, 'Failed to create support thread', 'THREAD_CREATE_ERROR');
      }
      threadId = newThread.id;
    } else {
      const { data: thread } = await supportThreads(sb)
        .select('id, user_id')
        .eq('id', threadId)
        .maybeSingle();

      if (!thread || thread.user_id !== request.userId) {
        return reply.status(404).send({
          data: null,
          error: { code: 'NOT_FOUND', message: 'Thread not found' },
        });
      }
    }

    // Check if thread is in human-agent mode (skip AI)
    const { data: currentThread } = await supportThreads(sb)
      .select('status')
      .eq('id', threadId)
      .maybeSingle();

    const isHumanMode = currentThread?.status === 'escalated' || currentThread?.status === 'in_progress';

    // Save user message
    await supportMessages(sb).insert({
      thread_id: threadId,
      role: 'user',
      content: body.message,
    });

    // Update thread timestamp so admin sees it at top of queue
    // (user_unread_count is incremented by a DB trigger on support_messages INSERT)
    await supportThreads(sb)
      .update({ updated_at: new Date().toISOString() } as unknown as Partial<SupportThreadRow>)
      .eq('id', threadId);

    // Human mode: just save the message and notify via SSE, no AI
    if (isHumanMode) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Thread-Id': threadId,
      });
      reply.raw.write(`data: ${JSON.stringify({ threadId, human_mode: true })}\n\n`);
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
      return;
    }

    // Load conversation history
    const { data: messages } = await (supportMessages(sb)
      .select('role, content')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true }) as unknown as Promise<{
        data: Pick<SupportMessageRow, 'role' | 'content'>[] | null;
        error: unknown;
      }>);

    const conversationMessages: ChatCompletionMessageParam[] = (messages ?? []).map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }));

    // Load org context for tool use
    const orgContext = await getOrgForUser(request.userId);

    // Check auto-escalation threshold (>= 7 messages triggers escalation)
    const messageCount = conversationMessages.length;
    const shouldAutoEscalate = messageCount >= 7;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Thread-Id': threadId,
    });

    // Send thread ID as first event so client can persist it
    reply.raw.write(`data: ${JSON.stringify({ threadId })}\n\n`);

    try {
      let fullResponse = '';

      // Agentic loop: handle tool calls
      const loopMessages: ChatCompletionMessageParam[] = [
        { role: 'system', content: SUPPORT_SYSTEM_PROMPT },
        ...conversationMessages,
      ];
      let continueLoop = true;

      while (continueLoop) {
        const stream = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 1024,
          messages: loopMessages,
          tools: supportTools,
          tool_choice: 'auto',
          stream: true,
        });

        let assistantContent = '';
        const toolCallsMap = new Map<number, { id: string; name: string; args: string }>();

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            assistantContent += delta.content;
            reply.raw.write(`data: ${JSON.stringify({ text: delta.content })}\n\n`);
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallsMap.has(idx)) {
                toolCallsMap.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' });
              }
              const entry = toolCallsMap.get(idx)!;
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.name = tc.function.name;
              if (tc.function?.arguments) entry.args += tc.function.arguments;
            }
          }

          if (chunk.choices[0]?.finish_reason === 'stop') continueLoop = false;
        }

        const toolCalls = [...toolCallsMap.values()];

        if (toolCalls.length > 0) {
          loopMessages.push({
            role: 'assistant',
            content: assistantContent || null,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.args },
            })),
          });

          for (const tc of toolCalls) {
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(tc.args); } catch { /* ignore */ }

            const result = await executeTool(tc.name, input, threadId, orgContext);
            loopMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
          }
        } else {
          continueLoop = false;
          if (assistantContent) fullResponse = assistantContent;
        }
      }

      // Save final assistant response
      if (fullResponse.trim()) {
        await supportMessages(sb).insert({
          thread_id: threadId,
          role: 'assistant',
          content: fullResponse,
        });
      }

      // Auto-escalate if too many messages
      if (shouldAutoEscalate) {
        await supportThreads(sb)
          .update({
            status: 'escalated',
            priority: 'P2',
            escalation_summary: 'Auto-escalado após 7+ mensagens sem resolução.',
            updated_at: new Date().toISOString(),
          })
          .eq('id', threadId)
          .eq('status', 'open');
      }

      reply.raw.write(`data: ${JSON.stringify({ done: true, threadId })}\n\n`);
      reply.raw.write('data: [DONE]\n\n');
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ error: 'Erro interno ao processar mensagem.' })}\n\n`);
      fastify.log.error({ err, threadId }, '[support] chat stream error');
    } finally {
      reply.raw.end();
    }
  });

  // ── GET /support/threads/:threadId/messages ───────────────────────────────
  fastify.get(
    '/threads/:threadId/messages',
    { preHandler: [authenticateWithUser] },
    async (request, reply) => {
      if (!request.userId) {
        return reply.status(401).send({
          data: null,
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        });
      }

      const { threadId } = request.params as { threadId: string };
      const sb = createServiceClient();

      const { data: thread } = await supportThreads(sb)
        .select('id, user_id, status, priority, created_at')
        .eq('id', threadId)
        .maybeSingle();

      if (!thread || thread.user_id !== request.userId) {
        return reply.status(404).send({
          data: null,
          error: { code: 'NOT_FOUND', message: 'Thread not found' },
        });
      }

      const { data: messages, error: msgErr } = await (supportMessages(sb)
        .select('id, role, content, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true }) as unknown as Promise<{
          data: SupportMessageRow[] | null;
          error: unknown;
        }>);

      if (msgErr) {
        throw new ApiError(500, 'Failed to load messages', 'MESSAGES_FETCH_ERROR');
      }

      return reply.send({
        data: {
          thread,
          messages: messages ?? [],
        },
        error: null,
      });
    },
  );

  // ── GET /support/admin/threads ─────────────────────────────────────────────
  fastify.get(
    '/admin/threads',
    { preHandler: [authenticate] },
    async (request, reply) => {
      if (!request.userId) {
        return reply.status(401).send({
          data: null,
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        });
      }

      const isManager = await assertManager(request.userId);
      if (!isManager) {
        return reply.status(403).send({
          data: null,
          error: { code: 'FORBIDDEN', message: 'Manager role required' },
        });
      }

      const sb = createServiceClient();

      const { data: threads, error } = await (supportThreads(sb)
        .select('*')
        .in('status', ['escalated', 'open'])
        .order('created_at', { ascending: true }) as unknown as Promise<{
          data: SupportThreadRow[] | null;
          error: unknown;
        }>);

      if (error) {
        throw new ApiError(500, 'Failed to fetch support threads', 'THREADS_FETCH_ERROR');
      }

      const threadList = threads ?? [];

      if (threadList.length === 0) {
        return reply.send({ data: { threads: [] }, error: null });
      }

      // Fetch last message per thread and message counts
      const threadIds = threadList.map((t) => t.id);
      const { data: messages } = await (supportMessages(sb)
        .select('thread_id, content, created_at')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: false }) as unknown as Promise<{
          data: Pick<SupportMessageRow, 'thread_id' | 'content' | 'created_at'>[] | null;
          error: unknown;
        }>);

      const lastMsgMap = new Map<string, string>();
      const msgCountMap = new Map<string, number>();

      for (const msg of messages ?? []) {
        if (!lastMsgMap.has(msg.thread_id)) {
          lastMsgMap.set(msg.thread_id, msg.content);
        }
        msgCountMap.set(msg.thread_id, (msgCountMap.get(msg.thread_id) ?? 0) + 1);
      }

      const enriched = threadList.map((t) => ({
        ...t,
        last_message: lastMsgMap.get(t.id) ?? null,
        message_count: msgCountMap.get(t.id) ?? 0,
      }));

      // Sort by priority ASC (P0 first), then created_at ASC
      const pOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
      enriched.sort((a, b) => {
        const pa = a.priority ? (pOrder[a.priority] ?? 99) : 99;
        const pb = b.priority ? (pOrder[b.priority] ?? 99) : 99;
        if (pa !== pb) return pa - pb;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      return reply.send({ data: { threads: enriched }, error: null });
    },
  );

  // ── PATCH /support/admin/threads/:id ─────────────────────────────────────
  fastify.patch(
    '/admin/threads/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      if (!request.userId) {
        return reply.status(401).send({
          data: null,
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        });
      }

      const isManager = await assertManager(request.userId);
      if (!isManager) {
        return reply.status(403).send({
          data: null,
          error: { code: 'FORBIDDEN', message: 'Manager role required' },
        });
      }

      const { id } = request.params as { id: string };

      let body: z.infer<typeof patchThreadBodySchema>;
      try {
        body = patchThreadBodySchema.parse(request.body);
      } catch (err) {
        return sendError(reply, err);
      }

      const sb = createServiceClient();

      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (body.status !== undefined) update.status = body.status;
      if (body.priority !== undefined) update.priority = body.priority;
      if (body.assignedTo !== undefined) update.assigned_to = body.assignedTo;

      const { data: updated, error: updateErr } = await supportThreads(sb)
        .update(update)
        .eq('id', id)
        .single();

      if (updateErr) {
        throw new ApiError(500, 'Failed to update thread', 'THREAD_UPDATE_ERROR');
      }
      if (!updated) {
        throw new ApiError(404, 'Thread not found', 'NOT_FOUND');
      }

      // Notify user via broadcast when thread is resolved/closed
      if (body.status === 'resolved' || body.status === 'closed') {
        await supportMessages(sb).insert({
          thread_id: id,
          role: 'system',
          content: `thread_${body.status}`,
          agent_user_id: request.userId,
        } as unknown as Partial<SupportMessageRow>);
      }

      return reply.send({ data: { thread: updated }, error: null });
    },
  );

  // ── GET /support/threads ──────────────────────────────────────────────────
  // Returns the authenticated user's own threads (most recent first).
  fastify.get('/threads', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const sb = createServiceClient();

    const { data: threads, error } = await (supportThreads(sb)
      .select('id, status, priority, escalation_summary, created_at, updated_at, user_rating')
      .eq('user_id', request.userId)
      .order('updated_at', { ascending: false })
      .limit(20) as unknown as Promise<{ data: SupportThreadRow[] | null; error: unknown }>);

    if (error) throw new ApiError(500, 'Failed to fetch threads', 'THREADS_FETCH_ERROR');

    if (!threads || threads.length === 0) {
      return reply.send({ data: { threads: [] }, error: null });
    }

    const threadIds = threads.map((t) => t.id);
    const { data: messages } = await (supportMessages(sb)
      .select('thread_id, content, created_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false }) as unknown as Promise<{
        data: Pick<SupportMessageRow, 'thread_id' | 'content' | 'created_at'>[] | null;
        error: unknown;
      }>);

    const lastMsgMap = new Map<string, string>();
    const msgCountMap = new Map<string, number>();
    for (const m of messages ?? []) {
      if (!lastMsgMap.has(m.thread_id)) lastMsgMap.set(m.thread_id, m.content);
      msgCountMap.set(m.thread_id, (msgCountMap.get(m.thread_id) ?? 0) + 1);
    }

    return reply.send({
      data: {
        threads: threads.map((t) => ({
          ...t,
          last_message: lastMsgMap.get(t.id) ?? null,
          message_count: msgCountMap.get(t.id) ?? 0,
        })),
      },
      error: null,
    });
  });

  // ── POST /support/threads/:threadId/rate ─────────────────────────────────
  fastify.post(
    '/threads/:threadId/rate',
    { preHandler: [authenticateWithUser] },
    async (request, reply) => {
      if (!request.userId) {
        return reply.status(401).send({ data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const { threadId } = request.params as { threadId: string };
      const body = z.object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(500).optional(),
      }).parse(request.body);

      const sb = createServiceClient();

      const { data: thread } = await (supportThreads(sb)
        .select('id, user_id, status, user_rating')
        .eq('id', threadId)
        .eq('user_id', request.userId)
        .maybeSingle() as unknown as Promise<{ data: SupportThreadRow | null }>);

      if (!thread) throw new ApiError(404, 'Thread not found', 'NOT_FOUND');
      if (thread.status !== 'resolved' && thread.status !== 'closed') {
        throw new ApiError(400, 'Thread must be resolved to rate', 'INVALID_STATE');
      }
      if (thread.user_rating !== null) {
        throw new ApiError(409, 'Thread already rated', 'ALREADY_RATED');
      }

      await supportThreads(sb)
        .update({
          user_rating: body.rating,
          rating_comment: body.comment ?? null,
          rated_at: new Date().toISOString(),
        } as unknown as Partial<SupportThreadRow>)
        .eq('id', threadId);

      return reply.send({ data: { ok: true }, error: null });
    },
  );

  // ── POST /support/threads/:threadId/human-reply ───────────────────────────
  // Admin sends a message as human_agent. Used by the admin drawer.
  fastify.post(
    '/threads/:threadId/human-reply',
    { preHandler: [authenticate] },
    async (request, reply) => {
      if (!request.userId) {
        return reply.status(401).send({ data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const isManager = await assertManager(request.userId);
      if (!isManager) {
        return reply.status(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Manager role required' } });
      }

      const { threadId } = request.params as { threadId: string };
      const body = z.object({ content: z.string().min(1).max(4000) }).parse(request.body);
      const sb = createServiceClient();

      const { data: thread } = await supportThreads(sb)
        .select('id, user_id, status')
        .eq('id', threadId)
        .maybeSingle();

      if (!thread) throw new ApiError(404, 'Thread not found', 'NOT_FOUND');

      await supportMessages(sb).insert({
        thread_id: threadId,
        role: 'human_agent',
        content: body.content,
        agent_user_id: request.userId,
      } as unknown as Partial<SupportMessageRow>);

      // Mark thread as in_progress if it was escalated/open
      await supportThreads(sb)
        .update({ status: 'in_progress', updated_at: new Date().toISOString() } as unknown as Partial<SupportThreadRow>)
        .eq('id', threadId);

      return reply.send({ data: { ok: true, userId: thread.user_id }, error: null });
    },
  );
}
