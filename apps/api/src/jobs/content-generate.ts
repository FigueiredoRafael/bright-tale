/**
 * Content generation background job (F2-014)
 *
 * Handles async content generation triggered by the simplified flow.
 * Runs brainstorm → research → production → review pipeline.
 */

import { inngest } from './client.js';
import { STAGE_COSTS, generateWithFallback } from '../lib/ai/router.js';
import { loadAgentPrompt } from '../lib/ai/promptLoader.js';
import { checkCredits, debitCredits } from '../lib/credits.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { buildBrainstormMessage } from '../lib/ai/prompts/brainstorm.js';
import { buildResearchMessage } from '../lib/ai/prompts/research.js';
import { buildCanonicalCoreMessage, buildProduceMessage } from '../lib/ai/prompts/production.js';
import { buildReviewMessage } from '../lib/ai/prompts/review.js';
import { assertNotAborted, JobAborted } from '../lib/ai/abortable.js';

interface ContentGenerateEvent {
  name: 'content/generate';
  data: {
    orgId: string;
    userId: string;
    channelId: string;
    topic: string;
    formats: string[];
    modelTier?: string;
  };
}

export const contentGenerate = inngest.createFunction(
  {
    id: 'content-generate',
    retries: 3,
    triggers: [{ event: 'content/generate' }],
  },
  async ({ event, step }: { event: ContentGenerateEvent; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    const { orgId, userId, channelId, topic, formats, modelTier } = event.data;
    const sb = createServiceClient();
    const tier = modelTier ?? 'standard';

    try {
      // Step 1: Check credits
    const totalCost = STAGE_COSTS.brainstorm + STAGE_COSTS.research + STAGE_COSTS.production + STAGE_COSTS.review;
    await step.run('check-credits', async () => {
      await checkCredits(orgId, userId, totalCost);
    });

    // Note: content-generate does not have a projectId upfront, so we pass undefined
    // to assertNotAborted. Projects are created after all generation is complete.
    await assertNotAborted(undefined, undefined, sb);

    // Step 2: Brainstorm
    const brainstormResult = await step.run('brainstorm', async () => {
      const systemPrompt = (await loadAgentPrompt('brainstorm')) ?? '';
      const userMessage = buildBrainstormMessage({ topic });
      const { result } = await generateWithFallback('brainstorm', tier, {
        agentType: 'brainstorm',
        systemPrompt,
        userMessage,
        schema: null,
      }, {
        logContext: {
          userId,
          orgId,
          channelId,
          sessionId: undefined,
          sessionType: 'brainstorm',
        },
      });
      await debitCredits(orgId, userId, 'brainstorm', 'text', STAGE_COSTS.brainstorm, { channelId, topic });
      return result;
    });

    await assertNotAborted(undefined, undefined, sb);

    // Step 3: Research
    const researchResult = await step.run('research', async () => {
      const systemPrompt = (await loadAgentPrompt('research')) ?? '';
      const userMessage = buildResearchMessage({ ideaTitle: topic });
      const { result } = await generateWithFallback('research', tier, {
        agentType: 'research',
        systemPrompt,
        userMessage,
        schema: null,
      }, {
        logContext: {
          userId,
          orgId,
          channelId,
          sessionId: undefined,
          sessionType: 'research',
        },
      });
      await debitCredits(orgId, userId, 'research', 'text', STAGE_COSTS.research, { channelId, topic });
      return result;
    });

    await assertNotAborted(undefined, undefined, sb);

    // Step 4: Production — canonical core first, then per-format output
    const canonicalCore = await step.run('canonical-core', async () => {
      const systemPrompt =
        (await loadAgentPrompt('content-core')) ?? (await loadAgentPrompt('production')) ?? '';
      const userMessage = buildCanonicalCoreMessage({
        type: 'blog',
        title: topic ?? 'Untitled',
        researchCards: Array.isArray(researchResult) ? researchResult : undefined,
      });
      const { result } = await generateWithFallback('production', tier, {
        agentType: 'production',
        systemPrompt,
        userMessage,
        schema: null,
      }, {
        logContext: {
          userId,
          orgId,
          channelId,
          sessionId: undefined,
          sessionType: 'production',
        },
      });
      return result;
    });

    const productionResults: Record<string, unknown> = {};
    for (const format of formats) {
      await assertNotAborted(undefined, undefined, sb);

      productionResults[format] = await step.run(`production-${format}`, async () => {
        const systemPrompt =
          (await loadAgentPrompt(format)) ?? (await loadAgentPrompt('production')) ?? '';
        const userMessage = buildProduceMessage({
          type: format,
          title: topic ?? 'Untitled',
          canonicalCore,
        });
        const { result } = await generateWithFallback('production', tier, {
          agentType: 'production',
          systemPrompt,
          userMessage,
          schema: null,
        }, {
          logContext: {
            userId,
            orgId,
            channelId,
            sessionId: undefined,
            sessionType: 'production',
          },
        });
        await debitCredits(orgId, userId, `production-${format}`, 'text', STAGE_COSTS.production, { channelId, format });
        return result;
      });
    }

    // Step 5: Review
    await assertNotAborted(undefined, undefined, sb);

    await step.run('review', async () => {
      const systemPrompt = (await loadAgentPrompt('review')) ?? '';
      const userMessage = buildReviewMessage({
        type: 'blog',
        title: topic ?? 'Untitled',
        draftJson: productionResults,
      });
      const { result } = await generateWithFallback('review', tier, {
        agentType: 'review',
        systemPrompt,
        userMessage,
        schema: null,
      }, {
        logContext: {
          userId,
          orgId,
          channelId,
          sessionId: undefined,
          sessionType: 'brainstorm',
        },
      });
      await debitCredits(orgId, userId, 'review', 'text', STAGE_COSTS.review, { channelId });
      return result;
    });

    // Step 6: Save results
    await assertNotAborted(undefined, undefined, sb);

    await step.run('save-results', async () => {
      // Use rpc-style insert to avoid strict type checking on new columns
      const { data: project } = await (sb.from('projects') as unknown as { insert: (row: Record<string, unknown>) => { select: () => { single: () => Promise<{ data: { id: string } | null }> } } })
        .insert({ title: topic, channel_id: channelId, org_id: orgId, user_id: userId, status: 'active', current_stage: 'review' })
        .select()
        .single();

      if (!project) return;

      for (const format of formats) {
        if (format === 'blog') {
          await sb.from('blog_drafts').insert({
            title: topic, project_id: project.id, status: 'draft', user_id: userId,
            full_draft: '', meta_description: '', slug: topic.toLowerCase().replace(/\s+/g, '-'),
          });
        } else if (format === 'video') {
          await sb.from('video_drafts').insert({
            title: topic, project_id: project.id, status: 'draft', user_id: userId,
            title_options: [topic],
          });
        }
      }
    });

    return { success: true, formats, topic };
    } catch (err) {
      if (err instanceof JobAborted) {
        // content-generate doesn't have a session to mark paused yet;
        // the job was aborted before any project was created
        return;
      }
      throw err;
    }
  },
);
