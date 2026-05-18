import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { createServiceClient } from '../lib/supabase/index.js'
import { ApiError } from '../lib/api/errors.js'
import { MODULE_SLUGS } from '@brighttale/shared/schemas/module-ai-assignments'
import { PERSONA_WIZARD_SYSTEM_PROMPT, PERSONA_WIZARD_OPENING } from '../lib/chat-modules/persona-wizard.js'

const MODULE_SYSTEM_PROMPTS: Record<string, string> = {
  persona_wizard: PERSONA_WIZARD_SYSTEM_PROMPT,
}

const MODULE_OPENINGS: Record<string, string> = {
  persona_wizard: PERSONA_WIZARD_OPENING,
}

const turnSchema = z.object({
  moduleId:  z.enum(MODULE_SLUGS),
  messages:  z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string(),
  })),
})

/**
 * Looks up the module AI assignment for the given module, falling back to null
 * (which means the caller uses the global active provider).
 */
async function getModuleAssignment(moduleId: string): Promise<{ provider: string; model: string } | null> {
  try {
    const sb = createServiceClient()
    const { data } = await sb
      .from('module_ai_assignments')
      .select('provider, model')
      .eq('module_slug', moduleId as any)
      .maybeSingle()
    return (data as { provider: string; model: string } | null) ?? null
  } catch {
    return null
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  // Try direct parse
  try { return JSON.parse(trimmed) } catch { /* fall through */ }
  // Try extracting first JSON block
  const match = trimmed.match(/\{[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) } catch { /* fall through */ }
  }
  return null
}

/** Direct provider call using env-var keys, bypasses the DB allow-list.
 *  Providers parse the JSON response internally and return the object directly. */
async function callWithEnvKey(systemPrompt: string, userMessage: string): Promise<unknown> {
  const input = { agentType: 'brainstorm' as any, systemPrompt, userMessage }
  if (process.env.OPENAI_API_KEY) {
    const { OpenAIProvider } = await import('../lib/ai/providers/openai.js')
    return new OpenAIProvider(process.env.OPENAI_API_KEY, { model: 'gpt-4o-mini' }).generateContent(input)
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const { AnthropicProvider } = await import('../lib/ai/providers/anthropic.js')
    return new AnthropicProvider(process.env.ANTHROPIC_API_KEY, { model: 'claude-haiku-4-5-20251001' }).generateContent(input)
  }
  const geminiKey = process.env.GOOGLE_AI_KEY ?? process.env.GEMINI_API_KEY
  if (geminiKey) {
    const { GeminiProvider } = await import('../lib/ai/providers/gemini.js')
    return new GeminiProvider(geminiKey, { model: 'gemini-2.5-flash' }).generateContent(input)
  }
  throw new ApiError(500, 'No AI provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_KEY in apps/api/.env.local', 'NO_AI_PROVIDER')
}

export async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // POST /api/chat/opening — return the opening message for a module (no AI call)
  app.post('/opening', async (req, reply) => {
    const { moduleId } = z.object({ moduleId: z.enum(MODULE_SLUGS) }).parse(req.body)
    const raw = MODULE_OPENINGS[moduleId]
    if (!raw) throw new ApiError(400, `No opening defined for module ${moduleId}`, 'NO_MODULE_OPENING')
    const parsed = extractJson(raw) as { message: string; done: boolean }
    return reply.send({ data: parsed, error: null })
  })

  // POST /api/chat/turn — single conversational turn
  app.post('/turn', async (req, reply) => {
    const parse = turnSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ data: null, error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
    }

    const { moduleId, messages } = parse.data
    const systemPrompt = MODULE_SYSTEM_PROMPTS[moduleId]
    if (!systemPrompt) throw new ApiError(400, `Unknown module: ${moduleId}`, 'UNKNOWN_MODULE')

    const assignment = await getModuleAssignment(moduleId)

    // Build the user message as the full conversation history for the AI.
    const conversationBlock = messages
      .map(m => `[${m.role === 'user' ? 'USUÁRIO' : 'ASSISTENTE'}]: ${m.content}`)
      .join('\n\n')

    const userMessage = messages.length === 0
      ? 'Começar conversa.'
      : `${conversationBlock}\n\n[SISTEMA]: Continue a conversa respondendo à última mensagem do usuário. Retorne APENAS JSON válido.`

    // Resolve provider: module assignment takes priority, then env-var fallback.
    // We bypass the stage router here because chat modules need a direct provider
    // regardless of which DB providers are toggled on.
    let parsed: unknown
    if (assignment) {
      const { generateWithFallback } = await import('../lib/ai/router.js')
      const call = await generateWithFallback(
        'brainstorm', 'standard',
        { agentType: 'brainstorm' as any, systemPrompt, userMessage },
        {
          provider: assignment.provider as any,
          model: assignment.model,
          allowFallback: false,
          logContext: { userId: req.userId ?? '', orgId: undefined, channelId: undefined, sessionId: undefined, sessionType: `chat:${moduleId}` },
        },
      )
      const raw = call.result
      const text = (typeof raw === 'string' ? raw : (raw as { content?: string })?.content ?? '').trim()
      if (!text) throw new ApiError(500, 'AI returned empty response', 'CHAT_EMPTY_RESPONSE')
      parsed = extractJson(text)
    } else {
      // Direct env-var fallback — providers parse JSON internally and return the object.
      parsed = await callWithEnvKey(systemPrompt, userMessage)
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ApiError(500, 'AI returned invalid JSON', 'CHAT_INVALID_JSON')
    }

    return reply.send({ data: parsed, error: null })
  })
}
