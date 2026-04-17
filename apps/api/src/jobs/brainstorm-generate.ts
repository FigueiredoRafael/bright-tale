/**
 * F2-036 — Async brainstorm generation with progress events.
 *
 * Triggered by POST /brainstorm/sessions (which only enqueues + returns sessionId).
 * Each step emits a job_event consumed by the SSE endpoint so the frontend modal
 * can show live progress ("Calling Ollama…", "Parsing output…", "Saving…").
 */
import { inngest } from './client.js';
import { STAGE_COSTS, generateWithFallback } from '../lib/ai/router.js';
import { loadAgentPrompt } from '../lib/ai/promptLoader.js';
import { debitCredits } from '../lib/credits.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { emitJobEvent } from './emitter.js';
import { logUsage } from '../lib/ai/usage-log.js';

interface BrainstormGenerateEvent {
  name: 'brainstorm/generate';
  data: {
    sessionId: string;
    orgId: string;
    userId: string;
    channelId: string | null;
    inputMode: 'blind' | 'fine_tuned' | 'reference_guided';
    inputJson: Record<string, unknown>;
    modelTier: string;
    provider?: 'gemini' | 'openai' | 'anthropic' | 'ollama';
    model?: string;
    targetCount?: number;
  };
}

interface RawIdea {
  idea_id?: string;
  title?: string;
  angle?: string;
  core_tension?: string;
  target_audience?: string;
  search_intent?: string;
  primary_keyword?: { term?: string; difficulty?: string; monthly_volume_estimate?: string };
  scroll_stopper?: string;
  curiosity_gap?: string;
  monetization?: string | { affiliate_angle?: string; product_fit?: string; sponsor_appeal?: string };
  repurpose_potential?: { blog_angle?: string; video_angle?: string; shorts_hooks?: string[]; podcast_angle?: string };
  repurposing?: string[];
  risk_flags?: string[];
  verdict?: string;
  verdict_rationale?: string;
}

function normalizeIdeas(raw: unknown): RawIdea[] {
  function looksLikeIdea(item: unknown): boolean {
    if (!item || typeof item !== 'object') return false;
    const o = item as Record<string, unknown>;
    return typeof o.title === 'string' || typeof o.idea_id === 'string' || typeof o.angle === 'string';
  }
  function find(node: unknown, depth = 0): RawIdea[] | null {
    if (depth > 6) return null;
    if (Array.isArray(node)) {
      if (node.length > 0 && node.some(looksLikeIdea)) return node as RawIdea[];
      return null;
    }
    if (node && typeof node === 'object') {
      for (const v of Object.values(node as Record<string, unknown>)) {
        const found = find(v, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  return find(raw) ?? [];
}

export const brainstormGenerate = inngest.createFunction(
  {
    id: 'brainstorm-generate',
    retries: 0,
    triggers: [{ event: 'brainstorm/generate' }],
  },
  async ({ event, step }: { event: BrainstormGenerateEvent; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    const { sessionId, orgId, userId, channelId, inputJson, modelTier, provider, model, targetCount } = event.data;
    const sb = createServiceClient();

    try {
      await step.run('emit-loading-prompt', async () => {
        await emitJobEvent(sessionId, 'brainstorm', 'loading_prompt', 'Carregando agente brainstorm…');
      });

      const systemPrompt = (await step.run('load-prompt', async () => {
        return (await loadAgentPrompt('brainstorm')) ?? null;
      })) as string | null;

      await step.run('emit-calling-provider', async () => {
        const label = provider ? `${provider}${model ? ` (${model})` : ''}` : modelTier;
        await emitJobEvent(sessionId, 'brainstorm', 'calling_provider', `Conversando com ${label}…`, { provider, model });
      });

      const channelContext = (await step.run('load-channel', async () => {
        if (!channelId) return null;
        const { data } = await sb
          .from('channels')
          .select('name, niche, language, tone, presentation_style')
          .eq('id', channelId as string)
          .maybeSingle();
        return data;
      })) as Record<string, unknown> | null;

      const result = (await step.run('call-provider', async () => {
        const call = await generateWithFallback(
          'brainstorm',
          modelTier,
          {
            agentType: 'brainstorm',
            input: { ...inputJson, channel: channelContext },
            schema: null,
            systemPrompt: systemPrompt ?? undefined,
          },
          {
            provider,
            model,
            logContext: {
              userId,
              orgId,
              channelId,
              sessionId,
              sessionType: 'brainstorm',
            },
          },
        );
        await logUsage({
          orgId, userId, channelId,
          stage: 'brainstorm',
          sessionId, sessionType: 'brainstorm',
          provider: call.providerName, model: call.model,
          usage: call.usage,
        });
        return call.result;
      })) as unknown;

      await step.run('emit-parsing', async () => {
        await emitJobEvent(sessionId, 'brainstorm', 'parsing_output', 'Processando resposta da IA…');
      });

      const ideas = normalizeIdeas(result);

      if (ideas.length === 0) {
        throw new Error('AI returned a response but no ideas could be parsed from the output. Try a different model or re-run.');
      }

      // Extract recommendation from AI output
      let recommendation: { pick?: string; rationale?: string } | null = null;
      if (result && typeof result === 'object' && 'recommendation' in (result as Record<string, unknown>)) {
        recommendation = (result as Record<string, unknown>).recommendation as { pick?: string; rationale?: string } | null;
      }

      // F2-037: enforce target_count at the job level as a safety net in
      // case the model ignored the prompt directive.
      const capped = typeof targetCount === 'number' ? ideas.slice(0, targetCount) : ideas;

      await step.run('emit-saving', async () => {
        await emitJobEvent(sessionId, 'brainstorm', 'saving', `Salvando ${capped.length} ideias em draft…`, { count: capped.length });
      });

      const persisted = await step.run('persist-ideas', async () => {
        // F2-037: stage ideas in brainstorm_drafts instead of idea_archives.
        // The user picks which to keep via POST /drafts/save.
        const draftRows = capped.map((idea, i) => ({
          session_id: sessionId,
          org_id: orgId,
          user_id: userId,
          channel_id: channelId,
          title: idea.title ?? `Untitled ${i + 1}`,
          core_tension: idea.core_tension ?? '',
          target_audience: idea.target_audience ?? '',
          verdict:
            idea.verdict === 'viable' || idea.verdict === 'weak' || idea.verdict === 'experimental'
              ? idea.verdict
              : 'experimental',
          discovery_data: JSON.stringify({
            angle: idea.angle,
            search_intent: idea.search_intent,
            primary_keyword: idea.primary_keyword,
            scroll_stopper: idea.scroll_stopper,
            curiosity_gap: idea.curiosity_gap,
            monetization: idea.monetization,
            repurpose_potential: idea.repurpose_potential,
            repurposing: idea.repurposing,
            risk_flags: idea.risk_flags,
            verdict_rationale: idea.verdict_rationale,
          }),
          position: i,
        }));

        if (draftRows.length > 0) {
          // Clear any previous drafts from this session (shouldn't happen with
          // idempotent inngest, but defensive) then insert fresh ones.
          await sb.from('brainstorm_drafts').delete().eq('session_id', sessionId);
          await (sb.from('brainstorm_drafts') as unknown as {
            insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>;
          }).insert(draftRows);
        }

        await (sb.from('brainstorm_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({ status: 'completed', ...(recommendation ? { recommendation_json: recommendation } : {}) })
          .eq('id', sessionId);

        const charge = provider === 'ollama' ? 0 : STAGE_COSTS.brainstorm;
        if (charge > 0) {
          await debitCredits(orgId, userId, 'brainstorm', 'text', charge, {
            channelId,
            mode: event.data.inputMode,
            provider,
          });
        }

        return draftRows.length;
      });

      await emitJobEvent(
        sessionId,
        'brainstorm',
        'completed',
        `${persisted} ideias geradas — revise e escolha quais salvar.`,
        { ideaCount: persisted },
      );

      return { success: true, ideas: persisted };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      await (sb.from('brainstorm_sessions') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ status: 'failed', error_message: message.slice(0, 500) })
        .eq('id', sessionId);

      await emitJobEvent(sessionId, 'brainstorm', 'failed', message.slice(0, 200), { error: message });
      throw err;
    }
  },
);
