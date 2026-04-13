/**
 * Content generation background job (F2-014)
 *
 * Handles async content generation triggered by the simplified flow.
 * Runs brainstorm → research → production → review pipeline.
 */

import { inngest } from './client.js';
import { getRouteForStage, STAGE_COSTS } from '../lib/ai/router.js';
import { checkCredits, debitCredits } from '../lib/credits.js';
import { createServiceClient } from '../lib/supabase/index.js';

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

    // Step 1: Check credits
    const totalCost = STAGE_COSTS.brainstorm + STAGE_COSTS.research + STAGE_COSTS.production + STAGE_COSTS.review;
    await step.run('check-credits', async () => {
      await checkCredits(orgId, userId, totalCost);
    });

    // Step 2: Brainstorm
    const brainstormResult = await step.run('brainstorm', async () => {
      const { provider } = getRouteForStage('brainstorm', tier);
      const result = await provider.generateContent({
        agentType: 'brainstorm',
        input: { topic, channelId },
        schema: null,
      });
      await debitCredits(orgId, userId, 'brainstorm', 'text', STAGE_COSTS.brainstorm, { channelId, topic });
      return result;
    });

    // Step 3: Research
    const researchResult = await step.run('research', async () => {
      const { provider } = getRouteForStage('research', tier);
      const result = await provider.generateContent({
        agentType: 'research',
        input: { topic, brainstormData: brainstormResult },
        schema: null,
      });
      await debitCredits(orgId, userId, 'research', 'text', STAGE_COSTS.research, { channelId, topic });
      return result;
    });

    // Step 4: Production (per format)
    const productionResults: Record<string, unknown> = {};
    for (const format of formats) {
      productionResults[format] = await step.run(`production-${format}`, async () => {
        const { provider } = getRouteForStage('production', tier);
        const result = await provider.generateContent({
          agentType: 'production',
          input: { format, researchData: researchResult, brainstormData: brainstormResult },
          schema: null,
        });
        await debitCredits(orgId, userId, `production-${format}`, 'text', STAGE_COSTS.production, { channelId, format });
        return result;
      });
    }

    // Step 5: Review
    await step.run('review', async () => {
      const { provider } = getRouteForStage('review', tier);
      const result = await provider.generateContent({
        agentType: 'review',
        input: { productionResults },
        schema: null,
      });
      await debitCredits(orgId, userId, 'review', 'text', STAGE_COSTS.review, { channelId });
      return result;
    });

    // Step 6: Save results
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
  },
);
