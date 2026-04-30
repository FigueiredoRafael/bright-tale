/**
 * F2-036 — Async research generation with progress events.
 * Mirrors brainstorm-generate pattern.
 */
import { inngest } from './client.js';
import { generateWithFallback } from '../lib/ai/router.js';

import { debitCredits } from '../lib/credits.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { emitJobEvent } from './emitter.js';
import { logUsage } from '../lib/ai/usage-log.js';
import { buildResearchMessage } from '../lib/ai/prompts/research.js';
import { assertNotAborted, JobAborted } from '../lib/ai/abortable.js';
import { resolveTools, buildToolExecutor } from '../lib/ai/tools/index.js';
import { loadAgentConfig, resolveProviderOverride } from '../lib/ai/promptLoader.js';
import type { ResearchInput } from '../lib/ai/prompts/research.js';

const LEVEL_COSTS: Record<'surface' | 'medium' | 'deep', number> = {
  surface: 60,
  medium: 100,
  deep: 180,
};

interface ResearchGenerateEvent {
  name: 'research/generate';
  data: {
    sessionId: string;
    orgId: string;
    userId: string;
    channelId: string | null;
    ideaId: string | null;
    level: 'surface' | 'medium' | 'deep';
    inputJson: Record<string, unknown>;
    modelTier: string;
    provider?: 'gemini' | 'openai' | 'anthropic' | 'ollama';
    model?: string;
  };
}

/**
 * Extract the full BC_RESEARCH_OUTPUT findings object so all sections
 * (sources, statistics, expert_quotes, counterarguments) are preserved.
 * Unwraps the BC_RESEARCH_OUTPUT wrapper key if present.
 * Falls back to a legacy flat-array normalizer for old-style model output.
 */
function extractFindings(raw: unknown): { findings: Record<string, unknown>; cardCount: number } {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const top = raw as Record<string, unknown>;
    // Unwrap wrapper key if model returned { BC_RESEARCH_OUTPUT: { ... } }
    const inner = (top.BC_RESEARCH_OUTPUT && typeof top.BC_RESEARCH_OUTPUT === 'object' && !Array.isArray(top.BC_RESEARCH_OUTPUT))
      ? top.BC_RESEARCH_OUTPUT as Record<string, unknown>
      : top;
    const count = (['sources', 'statistics', 'expert_quotes', 'counterarguments'] as const)
      .reduce((n, k) => n + (Array.isArray(inner[k]) ? (inner[k] as unknown[]).length : 0), 0);
    return { findings: inner, cardCount: count };
  }
  // Legacy: flat array output (small local models)
  if (Array.isArray(raw)) {
    return { findings: { sources: raw }, cardCount: (raw as unknown[]).length };
  }
  return { findings: {}, cardCount: 0 };
}

export const researchGenerate = inngest.createFunction(
  {
    id: 'research-generate',
    retries: 0,
    triggers: [{ event: 'research/generate' }],
  },
  async ({ event, step }: { event: ResearchGenerateEvent; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    const { sessionId, orgId, userId, channelId, ideaId, level, inputJson, modelTier, provider, model } = event.data;
    const sb = createServiceClient();

    // Load projectId from research_sessions if available
    const { data: session } = await sb
      .from('research_sessions')
      .select('project_id')
      .eq('id', sessionId)
      .maybeSingle();
    const projectId = session?.project_id ?? undefined;

    try {
      await assertNotAborted(projectId, undefined, sb);

      await step.run('emit-loading-prompt', async () => {
        await emitJobEvent(sessionId, 'research', 'loading_prompt', 'Carregando agente research…');
      });

      await assertNotAborted(projectId, undefined, sb);

      const agentConfig = (await step.run('load-prompt', async () => {
        const config = await loadAgentConfig('research');
        return {
          instructions: `${config.instructions}\n\nLevel directive: ${(inputJson as { instruction?: string }).instruction ?? ''}`.trim(),
          tools: config.tools,
          recommended_provider: config.recommended_provider,
          recommended_model: config.recommended_model,
        };
      })) as Awaited<ReturnType<typeof loadAgentConfig>>;
      const systemPrompt = agentConfig.instructions;
      const { provider: resolvedProvider, model: resolvedModel } = resolveProviderOverride(provider, model, agentConfig);

      await assertNotAborted(projectId, undefined, sb);

      await step.run('emit-calling-provider', async () => {
        const label = resolvedProvider ? `${resolvedProvider}${resolvedModel ? ` (${resolvedModel})` : ''}` : modelTier;
        await emitJobEvent(sessionId, 'research', 'calling_provider', `Pesquisando com ${label}…`, { provider: resolvedProvider, model: resolvedModel, level });
      });

      await assertNotAborted(projectId, undefined, sb);

      const channelContext = (await step.run('load-channel', async () => {
        if (!channelId) return null;
        const { data } = await sb
          .from('channels')
          .select('name, niche, language, tone, presentation_style')
          .eq('id', channelId as string)
          .maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      await assertNotAborted(projectId, undefined, sb);

      const result = (await step.run('call-provider', async () => {
        const userMessage = buildResearchMessage({
          ideaId: (inputJson.ideaId as string) ?? undefined,
          ideaTitle: (inputJson.topic as string) ?? undefined,
          coreTension: undefined,
          targetAudience: undefined,
          level: (inputJson.level as string) ?? undefined,
          instruction: (inputJson.instruction as string) ?? undefined,
          channel: channelContext as ResearchInput['channel'],
        });

        const enabledTools = resolveTools(agentConfig.tools).filter(
          () => resolvedProvider !== 'ollama',
        );
        const call = await generateWithFallback(
          'research',
          modelTier,
          {
            agentType: 'research',
            systemPrompt: systemPrompt ?? '',
            userMessage,
            tools: enabledTools.length > 0 ? enabledTools : undefined,
            toolExecutor: enabledTools.length > 0 ? buildToolExecutor(enabledTools) : undefined,
          },
          {
            provider: resolvedProvider,
            model: resolvedModel,
            logContext: {
              userId,
              orgId,
              channelId,
              sessionId,
              sessionType: 'research',
            },
          },
        );
        await logUsage({
          orgId, userId, channelId,
          stage: 'research', subStage: level,
          sessionId, sessionType: 'research',
          provider: call.providerName, model: call.model,
          usage: call.usage,
        });
        return call.result;
      })) as unknown;

      await assertNotAborted(projectId, undefined, sb);

      await step.run('emit-parsing', async () => {
        await emitJobEvent(sessionId, 'research', 'parsing_output', 'Organizando fontes e citações…');
      });

      const { findings, cardCount } = extractFindings(result);

      await assertNotAborted(projectId, undefined, sb);

      await step.run('emit-saving', async () => {
        await emitJobEvent(sessionId, 'research', 'saving', `Salvando ${cardCount} cards de pesquisa…`, { count: cardCount });
      });

      await assertNotAborted(projectId, undefined, sb);

      await step.run('persist', async () => {
        await (sb.from('research_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({ status: 'completed', cards_json: findings })
          .eq('id', sessionId);

        const charge = provider === 'ollama' ? 0 : LEVEL_COSTS[level];
        if (charge > 0) {
          await debitCredits(orgId, userId, `research-${level}`, 'text', charge, {
            channelId,
            ideaId,
            provider,
          });
        }
      });

      await emitJobEvent(
        sessionId,
        'research',
        'completed',
        `${cardCount} cards de pesquisa gerados!`,
        { cardCount },
      );

      return { success: true, cards: cardCount };
    } catch (err) {
      if (err instanceof JobAborted) {
        // research_sessions.status does not support 'paused' status yet,
        // so we only emit the abort event (no database update)
        await emitJobEvent(sessionId, 'research', 'aborted', 'Sessão cancelada pelo usuário');
        return;
      }

      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      await (sb.from('research_sessions') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ status: 'failed', error_message: message.slice(0, 500) })
        .eq('id', sessionId);

      await emitJobEvent(sessionId, 'research', 'failed', message.slice(0, 200), { error: message });
      throw err;
    }
  },
);
