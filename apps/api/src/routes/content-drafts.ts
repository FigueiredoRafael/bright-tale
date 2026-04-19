/**
 * F2-020/F2-021/F2-022 — Content drafts pipeline.
 * - POST /                        create a draft (type: blog|video|shorts|podcast|engagement)
 * - POST /:id/canonical-core      run agent-3a, store canonical_core_json
 * - PATCH /:id/production-settings save blog settings before produce
 * - POST /:id/produce             run agent-3b-{type}, store draft_json (status stays 'draft')
 * - POST /:id/review              run agent-4, score + verdict (manual trigger)
 * - POST /:id/revise              accept user edits after review_verdict='revision_required'
 * - PATCH /:id                    manual edits (title, draft_json, status…)
 * - GET /:id                      read
 * - GET /                         list with optional ?channel_id, ?type
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate.js";
import { createServiceClient } from "../lib/supabase/index.js";
import { sendError } from "../lib/api/fastify-errors.js";
import { ApiError } from "../lib/api/errors.js";
import { generateWithFallback } from "../lib/ai/router.js";
import { loadAgentPrompt } from "../lib/ai/promptLoader.js";
import { buildChannelContext } from "../lib/ai/channelContext.js";
import { checkCredits, debitCredits } from "../lib/credits.js";
import {
  blogProductionSettingsSchema,
  reviseSchema,
} from "@brighttale/shared/schemas/pipeline";
import { inngest } from "../jobs/client.js";
import { emitJobEvent } from "../jobs/emitter.js";
import { buildCanonicalCoreMessage, buildProduceMessage, buildReproduceMessage } from "../lib/ai/prompts/production.js";
import { buildReviewMessage } from "../lib/ai/prompts/review.js";
import { loadIdeaContext, type IdeaContext } from "../lib/ai/loadIdeaContext.js";
import { logAiUsage } from "../lib/axiom.js";

const FORMAT_COSTS: Record<string, number> = {
  blog: 200,
  video: 200,
  shorts: 100,
  podcast: 150,
};
const CANONICAL_CORE_COST = 80;
const REVIEW_COST = 20;

const createSchema = z.object({
  channelId: z.string().uuid().optional(),
  ideaId: z.string().optional(),
  researchSessionId: z.string().uuid().optional(),
  projectId: z.string().optional(),
  type: z.enum(["blog", "video", "shorts", "podcast", "engagement"]),
  title: z.string().optional(),
  modelTier: z.string().default("standard"),
  productionParams: z.record(z.unknown()).optional(),
});

const providerOverrideSchema = z.object({
  provider: z.enum(["gemini", "openai", "anthropic", "ollama", "manual"]).optional(),
  model: z.string().optional(),
  modelTier: z.string().optional(),
  productionParams: z.record(z.unknown()).optional(),
});

const updateSchema = z.object({
  title: z.string().optional(),
  canonicalCoreJson: z.record(z.unknown()).optional(),
  draftJson: z.record(z.unknown()).optional(),
  reviewFeedbackJson: z.record(z.unknown()).optional(),
  reviewScore: z.number().min(0).max(100).optional(),
  reviewVerdict: z.enum(['pending', 'approved', 'revision_required', 'rejected']).optional(),
  iterationCount: z.number().int().min(0).optional(),
  status: z
    .enum([
      "draft",
      "in_review",
      "approved",
      "scheduled",
      "published",
      "failed",
    ])
    .optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  publishedUrl: z.string().url().nullable().optional(),
});

async function getOrgId(userId: string): Promise<string> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (!data) throw new ApiError(404, "No organization found", "NOT_FOUND");
  return data.org_id;
}

async function loadDraft(id: string) {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("content_drafts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "Draft not found", "NOT_FOUND");
  return data;
}

/**
 * Build BC_ASSETS_INPUT from a draft row. Shared between the data-only
 * /asset-prompts route and the LLM-powered /generate-asset-prompts route.
 */
async function buildAssetsInput(
  draft: Record<string, unknown>,
): Promise<{
  title: string;
  content_type: string;
  sections: Array<{ slot: string; section_title: string; key_points: string[] }>;
  channel_context: Record<string, unknown>;
  idea_context: IdeaContext | null;
}> {
  const sb = createServiceClient();
  const draftJson = (draft.draft_json ?? {}) as Record<string, unknown>;
  const coreJson = (draft.canonical_core_json ?? {}) as Record<string, unknown>;
  const contentType = (draft.type as string) ?? "blog";

  let outline: Array<{ h2: string; key_points: string[] }> = [];
  const blogData = draftJson.blog as Record<string, unknown> | undefined;
  if (blogData?.outline && Array.isArray(blogData.outline)) {
    outline = (blogData.outline as Array<Record<string, unknown>>).map((s) => ({
      h2: (s.h2 as string) ?? (s.heading as string) ?? "",
      key_points: Array.isArray(s.key_points) ? (s.key_points as string[]) : [],
    }));
  } else if (coreJson.argument_chain && Array.isArray(coreJson.argument_chain)) {
    outline = (coreJson.argument_chain as Array<Record<string, unknown>>).map((s) => ({
      h2: (s.claim as string) ?? (s.section as string) ?? "",
      key_points: Array.isArray(s.evidence) ? (s.evidence as string[]) : [],
    }));
  }

  const sections = [
    {
      slot: "featured",
      section_title: (draft.title as string) ?? "Untitled",
      key_points: [] as string[],
    },
    ...outline.map((s, i) => ({
      slot: `section_${i + 1}`,
      section_title: s.h2,
      key_points: s.key_points,
    })),
  ];

  let channelContext: Record<string, unknown> = {};
  if (draft.channel_id) {
    const { data: channel } = await sb
      .from("channels")
      .select("niche, niche_tags, tone, language, market, region")
      .eq("id", draft.channel_id as string)
      .maybeSingle();
    if (channel) {
      channelContext = {
        niche: channel.niche ?? "",
        niche_tags: channel.niche_tags ?? [],
        tone: channel.tone ?? "",
        language: channel.language ?? "English",
        market: channel.market ?? "global",
        region: channel.region ?? "",
      };
    }
  }

  const idea = draft.idea_id
    ? await loadIdeaContext(draft.idea_id as string)
    : null;

  return {
    title: (draft.title as string) ?? "Untitled",
    content_type: contentType,
    sections,
    channel_context: channelContext,
    idea_context: idea,
  };
}

export async function contentDraftsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * POST / — create draft scaffold.
   */
  fastify.post("/", { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId)
        throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
      const body = createSchema.parse(request.body);
      const orgId = await getOrgId(request.userId);
      const sb = createServiceClient();

      // Resolve ideaId — UI may pass idea_archives.id (UUID) OR idea_archives.idea_id (slug).
      // content_drafts.idea_id FK references idea_archives.id, so slugs need translating.
      let resolvedIdeaId: string | null = null;
      if (body.ideaId) {
        const column = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.ideaId) ? "id" : "idea_id";
        const { data: match } = await sb
          .from("idea_archives")
          .select("id")
          .eq(column, body.ideaId)
          .maybeSingle();
        resolvedIdeaId = (match as { id: string } | null)?.id ?? null;
      }

      const { data, error } = await (
        sb.from("content_drafts") as unknown as {
          insert: (row: Record<string, unknown>) => {
            select: () => {
              single: () => Promise<{ data: unknown; error: unknown }>;
            };
          };
        }
      )
        .insert({
          org_id: orgId,
          user_id: request.userId,
          channel_id: body.channelId ?? null,
          idea_id: resolvedIdeaId,
          research_session_id: body.researchSessionId ?? null,
          project_id: body.projectId ?? null,
          type: body.type,
          title: body.title ?? null,
          status: "draft",
          production_params: body.productionParams ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return reply.send({ data, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET / — list drafts (filter by channel + type).
   */
  fastify.get("/", { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, "http://localhost");
      const channelId = url.searchParams.get("channel_id");
      const type = url.searchParams.get("type");

      let q = sb
        .from("content_drafts")
        .select("*")
        .order("updated_at", { ascending: false });
      if (channelId) q = q.eq("channel_id", channelId);
      if (type) q = q.eq("type", type);

      const { data, error } = await q;
      if (error) throw error;
      return reply.send({ data: { drafts: data ?? [] }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id
   */
  fastify.get(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const draft = await loadDraft(id);
        return reply.send({ data: draft, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * PATCH /:id — manual edit.
   */
  fastify.patch(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        const { id } = request.params as { id: string };
        const body = updateSchema.parse(request.body);

        const update: Record<string, unknown> = {};
        if (body.title !== undefined) update.title = body.title;
        if (body.canonicalCoreJson !== undefined)
          update.canonical_core_json = body.canonicalCoreJson;
        if (body.draftJson !== undefined) update.draft_json = body.draftJson;
        if (body.reviewFeedbackJson !== undefined)
          update.review_feedback_json = body.reviewFeedbackJson;
        if (body.reviewScore !== undefined)
          update.review_score = body.reviewScore;
        if (body.reviewVerdict !== undefined)
          update.review_verdict = body.reviewVerdict;
        if (body.iterationCount !== undefined)
          update.iteration_count = body.iterationCount;
        if (body.status !== undefined) update.status = body.status;
        if (body.scheduledAt !== undefined)
          update.scheduled_at = body.scheduledAt;
        if (body.publishedAt !== undefined)
          update.published_at = body.publishedAt;
        if (body.publishedUrl !== undefined)
          update.published_url = body.publishedUrl;

        const { data, error } = await (
          sb.from("content_drafts") as unknown as {
            update: (row: Record<string, unknown>) => {
              eq: (
                col: string,
                val: string,
              ) => {
                select: () => {
                  single: () => Promise<{ data: unknown; error: unknown }>;
                };
              };
            };
          }
        )
          .update(update)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return reply.send({ data, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:id/generate — F2-036. Enqueue full production pipeline (canonical-core + produce)
   * as one Inngest job. Returns 202 immediately. Stream progress via /:id/events.
   */
  fastify.post(
    "/:id/generate",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const override = providerOverrideSchema.parse(request.body ?? {});
        const draft = (await loadDraft(id)) as Record<string, unknown>;
        const orgId = await getOrgId(request.userId);
        const type =
          (draft.type as "blog" | "video" | "shorts" | "podcast") ?? "blog";
        // Local Ollama runs cost us nothing → no internal credit charge.
        const totalCost =
          override.provider === "ollama"
            ? 0
            : (FORMAT_COSTS[type] ?? 200) + CANONICAL_CORE_COST;

        if (totalCost > 0) await checkCredits(orgId, request.userId, totalCost);
        await emitJobEvent(id, "production", "queued", "Iniciando…");

        // Override params from this call take precedence over the ones saved on
        // the draft. If new params come in, persist so future "Refazer" without
        // params remembers the latest choice.
        const params =
          override.productionParams ??
          (draft.production_params as Record<string, unknown> | null) ??
          null;
        if (override.productionParams) {
          const sb = createServiceClient();
          await (
            sb.from("content_drafts") as unknown as {
              update: (row: Record<string, unknown>) => {
                eq: (col: string, val: string) => Promise<unknown>;
              };
            }
          )
            .update({ production_params: override.productionParams })
            .eq("id", id);
        }

        await inngest.send({
          name: "production/generate",
          data: {
            draftId: id,
            orgId,
            userId: request.userId,
            type,
            modelTier:
              override.modelTier ?? (draft.model_tier as string) ?? "standard",
            provider: override.provider,
            model: override.model,
            productionParams: params,
          },
        });

        return reply.status(202).send({
          data: { draftId: id, status: "queued" },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * GET /:id/events — SSE stream of production progress events.
   */
  fastify.get(
    "/:id/events",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const sb = createServiceClient();

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // Accept ?since=<iso> so the modal can ignore stale events from prior runs.
      const sinceParam = (request.query as { since?: string })?.since;
      let lastCreatedAt = sinceParam ?? "1970-01-01T00:00:00Z";
      let closed = false;
      request.raw.on("close", () => {
        closed = true;
      });

      const poll = async (): Promise<void> => {
        while (!closed) {
          const { data: events } = (await sb
            .from("job_events")
            .select("*")
            .eq("session_id", id)
            .gt("created_at", lastCreatedAt)
            .order("created_at", { ascending: true })) as unknown as {
            data: Array<{
              id: string;
              stage: string;
              message: string;
              metadata: unknown;
              created_at: string;
            }> | null;
          };

          if (events && events.length > 0) {
            for (const ev of events) {
              reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
              lastCreatedAt = ev.created_at;
              if (ev.stage === "completed" || ev.stage === "failed") {
                reply.raw.end();
                return;
              }
            }
          } else {
            reply.raw.write(": ping\n\n");
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
      };

      void poll().catch((err) => {
        fastify.log.error({ err }, "SSE poll failed");
        reply.raw.end();
      });

      return reply;
    },
  );

  /**
   * POST /:id/canonical-core — F2-020. Run agent-3a using research + brainstorm context.
   */
  fastify.post(
    "/:id/canonical-core",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const sb = createServiceClient();
        const { id } = request.params as { id: string };
        const override = providerOverrideSchema.parse(request.body ?? {});
        const draft = (await loadDraft(id)) as Record<string, unknown>;
        const orgId = await getOrgId(request.userId);

        // Manual provider short-circuits the LLM call: build the prompt
        // synchronously, emit the full payload to Axiom, persist the draft in
        // awaiting_manual state, and return early. The user pastes the output
        // produced externally via POST /:id/manual-output.
        if (override.provider === 'manual') {
          // Pull research approved cards if linked
          let approvedCards: unknown = null;
          if (draft.research_session_id) {
            const { data: rs } = await sb
              .from("research_sessions")
              .select("approved_cards_json, cards_json, level, focus_tags")
              .eq("id", draft.research_session_id as string)
              .maybeSingle();
            approvedCards = rs?.approved_cards_json ?? rs?.cards_json ?? null;
          }

          let systemPrompt =
            (await loadAgentPrompt("content-core")) ??
            (await loadAgentPrompt("production")) ??
            undefined;

          // Inject channel context into system prompt
          const channelContextStr = await buildChannelContext(
            draft.channel_id as string | null | undefined,
          );
          if (channelContextStr && systemPrompt) {
            systemPrompt = `${systemPrompt}\n\n${channelContextStr}`;
          }

          // Load channel data for builder
          const channelData = draft.channel_id
            ? await (async () => {
                const { data } = await (
                  createServiceClient() as any
                )
                  .from("channels")
                  .select("name, niche, language, tone, presentation_style")
                  .eq("id", draft.channel_id as string)
                  .maybeSingle();
                return data;
              })()
            : null;

          const idea = draft.idea_id
            ? await loadIdeaContext(draft.idea_id as string)
            : null;

          const userMessage = buildCanonicalCoreMessage({
            type: draft.type as string,
            title: draft.title as string,
            ideaId: draft.idea_id as string | undefined,
            idea,
            researchCards: approvedCards as unknown[] | undefined,
            channel: channelData as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
          });

          // Update draft to awaiting_manual status
          const { data: manualDraft, error: manualInsertErr } = await (
            sb.from("content_drafts") as unknown as {
              update: (row: Record<string, unknown>) => {
                eq: (col: string, val: string) => {
                  select: () => {
                    single: () => Promise<{ data: unknown; error: unknown }>;
                  };
                };
              };
            }
          )
            .update({ status: 'awaiting_manual' })
            .eq("id", id)
            .select()
            .single();
          if (manualInsertErr || !manualDraft) {
            throw manualInsertErr ?? new ApiError(500, 'Failed to update draft', 'DB_ERROR');
          }

          // Combine system + user message so the operator can copy ONE prompt
          // from Axiom and paste it into ChatGPT/Claude without reassembling.
          const combinedPrompt = systemPrompt
            ? `${systemPrompt}\n\n${userMessage}`
            : userMessage;

          logAiUsage({
            userId: request.userId,
            orgId,
            action: 'manual.awaiting',
            provider: 'manual',
            model: 'manual',
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            durationMs: 0,
            status: 'awaiting_manual',
            metadata: {
              draftId: id,
              stage: 'draft.core',
              channelId: (draft.channel_id as string) ?? null,
              prompt: combinedPrompt,
              input: { type: draft.type, title: draft.title },
            },
          });

          return reply.status(202).send({
            data: { draftId: id, status: 'awaiting_manual' },
            error: null,
          });
        }

        await checkCredits(orgId, request.userId, CANONICAL_CORE_COST);

        // Pull research approved cards if linked
        let approvedCards: unknown = null;
        if (draft.research_session_id) {
          const { data: rs } = await sb
            .from("research_sessions")
            .select("approved_cards_json, cards_json, level, focus_tags")
            .eq("id", draft.research_session_id as string)
            .maybeSingle();
          approvedCards = rs?.approved_cards_json ?? rs?.cards_json ?? null;
        }

        let systemPrompt =
          (await loadAgentPrompt("content-core")) ??
          (await loadAgentPrompt("production")) ??
          undefined;

        // Inject channel context into system prompt
        const channelContextStr = await buildChannelContext(
          draft.channel_id as string | null | undefined,
        );
        if (channelContextStr && systemPrompt) {
          systemPrompt = `${systemPrompt}\n\n${channelContextStr}`;
        }

        // Load channel data for builder
        const channelData = draft.channel_id
          ? await (async () => {
              const { data } = await (
                createServiceClient() as any
              )
                .from("channels")
                .select("name, niche, language, tone, presentation_style")
                .eq("id", draft.channel_id as string)
                .maybeSingle();
              return data;
            })()
          : null;

        const idea = draft.idea_id
          ? await loadIdeaContext(draft.idea_id as string)
          : null;

        const userMessage = buildCanonicalCoreMessage({
          type: draft.type as string,
          title: draft.title as string,
          ideaId: draft.idea_id as string | undefined,
          idea,
          researchCards: approvedCards as unknown[] | undefined,
          channel: channelData as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
        });

        const { result } = await generateWithFallback(
          "production",
          override.modelTier ?? (draft.model_tier as string) ?? "standard",
          {
            agentType: "production",
            systemPrompt: systemPrompt ?? '',
            userMessage,
          },
          {
            provider: override.provider,
            model: override.model,
            logContext: {
              userId: request.userId!,
              orgId,
              projectId: (draft.project_id as string) ?? undefined,
              channelId: (draft.channel_id as string) ?? undefined,
              sessionId: id,
              sessionType: 'production',
            },
          },
        );

        const { data: updated, error } = await (
          sb.from("content_drafts") as unknown as {
            update: (row: Record<string, unknown>) => {
              eq: (
                col: string,
                val: string,
              ) => {
                select: () => {
                  single: () => Promise<{ data: unknown; error: unknown }>;
                };
              };
            };
          }
        )
          .update({
            canonical_core_json: draft.idea_id && result && typeof result === 'object' && !Array.isArray(result)
              ? { ...(result as Record<string, unknown>), idea_id: draft.idea_id }
              : result,
            status: "draft",
          })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;

        await debitCredits(
          orgId,
          request.userId,
          "canonical-core",
          "text",
          CANONICAL_CORE_COST,
          {
            draftId: id,
            type: draft.type,
          },
        );

        return reply.send({ data: updated, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * PATCH /:id/production-settings — Save blog settings before produce.
   */
  fastify.patch(
    "/:id/production-settings",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        const { id } = request.params as { id: string };
        const settings = blogProductionSettingsSchema.parse(request.body);

        const { data, error } = await (
          sb.from("content_drafts") as unknown as {
            update: (row: Record<string, unknown>) => {
              eq: (
                col: string,
                val: string,
              ) => {
                select: () => {
                  single: () => Promise<{ data: unknown; error: unknown }>;
                };
              };
            };
          }
        )
          .update({ production_settings_json: settings })
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return reply.send({ data, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:id/produce — F2-021/F2-022. Run agent-3b-{type} using canonical core.
   * Status stays 'draft' — user manually triggers review when ready.
   */
  fastify.post(
    "/:id/produce",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const sb = createServiceClient();
        const { id } = request.params as { id: string };
        const override = providerOverrideSchema.parse(request.body ?? {});
        const draft = (await loadDraft(id)) as Record<string, unknown>;
        const orgId = await getOrgId(request.userId);

        const type = (draft.type as string) ?? "blog";
        const cost = FORMAT_COSTS[type] ?? 200;

        // Manual provider short-circuits the LLM call: build the prompt
        // synchronously, emit the full payload to Axiom, persist the draft in
        // awaiting_manual state, and return early. The user pastes the output
        // produced externally via POST /:id/manual-output.
        if (override.provider === 'manual') {
          let systemPrompt =
            (await loadAgentPrompt(type)) ??
            (await loadAgentPrompt("production")) ??
            undefined;

          // Inject production settings into system prompt for blog
          const settings = draft.production_settings_json as Record<
            string,
            unknown
          > | null;
          if (settings && systemPrompt) {
            const settingsContext: string[] = [];
            if (settings.wordCountTarget)
              settingsContext.push(
                `Target word count: ${settings.wordCountTarget}`,
              );
            if (settings.writingStyle)
              settingsContext.push(`Writing style: ${settings.writingStyle}`);
            if (settings.tone) settingsContext.push(`Tone: ${settings.tone}`);
            if (Array.isArray(settings.keywords) && settings.keywords.length > 0)
              settingsContext.push(
                `Keywords to include: ${settings.keywords.join(", ")}`,
              );
            if (
              Array.isArray(settings.categories) &&
              settings.categories.length > 0
            )
              settingsContext.push(
                `WordPress categories: ${settings.categories.join(", ")}`,
              );
            if (Array.isArray(settings.tags) && settings.tags.length > 0)
              settingsContext.push(`WordPress tags: ${settings.tags.join(", ")}`);
            if (settingsContext.length > 0) {
              systemPrompt = `${systemPrompt}\n\n## Production Settings\n${settingsContext.join("\n")}`;
            }
          }

          // Inject channel context into system prompt
          const channelContextStr = await buildChannelContext(
            draft.channel_id as string | null | undefined,
          );
          if (channelContextStr && systemPrompt) {
            systemPrompt = `${systemPrompt}\n\n${channelContextStr}`;
          }

          // Load channel data for builder
          const channelData = draft.channel_id
            ? await (async () => {
                const { data } = await (
                  createServiceClient() as any
                )
                  .from("channels")
                  .select("name, niche, language, tone, presentation_style")
                  .eq("id", draft.channel_id as string)
                  .maybeSingle();
                return data;
              })()
            : null;

          const idea = draft.idea_id
            ? await loadIdeaContext(draft.idea_id as string)
            : null;

          const userMessage = buildProduceMessage({
            type: type as string,
            title: draft.title as string,
            canonicalCore: draft.canonical_core_json,
            idea,
            productionParams: (draft.production_params as Record<string, unknown> | null) ?? undefined,
            channel: channelData as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
          });

          // Update draft to awaiting_manual status
          const { data: manualDraft, error: manualInsertErr } = await (
            sb.from("content_drafts") as unknown as {
              update: (row: Record<string, unknown>) => {
                eq: (col: string, val: string) => {
                  select: () => {
                    single: () => Promise<{ data: unknown; error: unknown }>;
                  };
                };
              };
            }
          )
            .update({ status: 'awaiting_manual' })
            .eq("id", id)
            .select()
            .single();
          if (manualInsertErr || !manualDraft) {
            throw manualInsertErr ?? new ApiError(500, 'Failed to update draft', 'DB_ERROR');
          }

          // Combine system + user message so the operator can copy ONE prompt
          // from Axiom and paste it into ChatGPT/Claude without reassembling.
          const combinedPrompt = systemPrompt
            ? `${systemPrompt}\n\n${userMessage}`
            : userMessage;

          logAiUsage({
            userId: request.userId,
            orgId,
            action: 'manual.awaiting',
            provider: 'manual',
            model: 'manual',
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            durationMs: 0,
            status: 'awaiting_manual',
            metadata: {
              draftId: id,
              stage: `draft.${type}`,
              channelId: (draft.channel_id as string) ?? null,
              prompt: combinedPrompt,
              input: { type, title: draft.title },
            },
          });

          return reply.status(202).send({
            data: { draftId: id, status: 'awaiting_manual' },
            error: null,
          });
        }

        await checkCredits(orgId, request.userId, cost);

        // Blog production settings are optional — use defaults if not set
        // Users can set via PATCH /:id/production-settings before producing

        let systemPrompt =
          (await loadAgentPrompt(type)) ??
          (await loadAgentPrompt("production")) ??
          undefined;

        // Inject production settings into system prompt for blog
        const settings = draft.production_settings_json as Record<
          string,
          unknown
        > | null;
        if (settings && systemPrompt) {
          const settingsContext: string[] = [];
          if (settings.wordCountTarget)
            settingsContext.push(
              `Target word count: ${settings.wordCountTarget}`,
            );
          if (settings.writingStyle)
            settingsContext.push(`Writing style: ${settings.writingStyle}`);
          if (settings.tone) settingsContext.push(`Tone: ${settings.tone}`);
          if (Array.isArray(settings.keywords) && settings.keywords.length > 0)
            settingsContext.push(
              `Keywords to include: ${settings.keywords.join(", ")}`,
            );
          if (
            Array.isArray(settings.categories) &&
            settings.categories.length > 0
          )
            settingsContext.push(
              `WordPress categories: ${settings.categories.join(", ")}`,
            );
          if (Array.isArray(settings.tags) && settings.tags.length > 0)
            settingsContext.push(`WordPress tags: ${settings.tags.join(", ")}`);
          if (settingsContext.length > 0) {
            systemPrompt = `${systemPrompt}\n\n## Production Settings\n${settingsContext.join("\n")}`;
          }
        }

        // Inject channel context into system prompt
        const channelContextStr = await buildChannelContext(
          draft.channel_id as string | null | undefined,
        );
        if (channelContextStr && systemPrompt) {
          systemPrompt = `${systemPrompt}\n\n${channelContextStr}`;
        }

        // Load channel data for builder
        const channelData = draft.channel_id
          ? await (async () => {
              const { data } = await (
                createServiceClient() as any
              )
                .from("channels")
                .select("name, niche, language, tone, presentation_style")
                .eq("id", draft.channel_id as string)
                .maybeSingle();
              return data;
            })()
          : null;

        const idea = draft.idea_id
          ? await loadIdeaContext(draft.idea_id as string)
          : null;

        const userMessage = buildProduceMessage({
          type: type as string,
          title: draft.title as string,
          canonicalCore: draft.canonical_core_json,
          idea,
          productionParams: (draft.production_params as Record<string, unknown> | null) ?? undefined,
          channel: channelData as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
        });

        const { result } = await generateWithFallback(
          "production",
          override.modelTier ?? (draft.model_tier as string) ?? "standard",
          {
            agentType: "production",
            systemPrompt: systemPrompt ?? '',
            userMessage,
          },
          {
            provider: override.provider,
            model: override.model,
            logContext: {
              userId: request.userId!,
              orgId,
              projectId: (draft.project_id as string) ?? undefined,
              channelId: (draft.channel_id as string) ?? undefined,
              sessionId: id,
              sessionType: 'production',
            },
          },
        );

        // Status stays 'draft' — user manually triggers review when ready
        const { data: updated, error } = await (
          sb.from("content_drafts") as unknown as {
            update: (row: Record<string, unknown>) => {
              eq: (
                col: string,
                val: string,
              ) => {
                select: () => {
                  single: () => Promise<{ data: unknown; error: unknown }>;
                };
              };
            };
          }
        )
          .update({ draft_json: result, status: "draft" })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;

        await debitCredits(
          orgId,
          request.userId,
          `production-${type}`,
          "text",
          cost,
          {
            draftId: id,
            type,
          },
        );

        return reply.send({ data: updated, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:id/cancel — Cancel a draft in `awaiting_manual` status.
   */
  fastify.post(
    "/:id/cancel",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId) throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const sb = createServiceClient();

        const { data: draft } = await sb
          .from("content_drafts")
          .select("id, status, user_id")
          .eq("id", id)
          .maybeSingle();

        if (!draft) throw new ApiError(404, "Draft not found", "NOT_FOUND");
        if ((draft as Record<string, unknown>).user_id !== request.userId) {
          throw new ApiError(403, "Forbidden", "FORBIDDEN");
        }
        if (
          (draft as Record<string, unknown>).status !== "running" &&
          (draft as Record<string, unknown>).status !== "awaiting_manual"
        ) {
          return reply.send({
            data: { status: (draft as Record<string, unknown>).status },
            error: null,
          });
        }

        await (
          sb.from("content_drafts") as unknown as {
            update: (row: Record<string, unknown>) => {
              eq: (col: string, val: string) => Promise<unknown>;
            };
          }
        )
          .update({ status: "failed", error_message: "Cancelled by user" })
          .eq("id", id);

        return reply.send({ data: { status: "cancelled" }, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:id/manual-output — Submit the output produced externally
   * for a draft in `awaiting_manual` status. Persists the canonical core or
   * typed content, flips the draft to `draft`, and emits a `manual.completed`
   * Axiom event.
   */
  fastify.post(
    "/:id/manual-output",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId) throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const body = z.object({
          phase: z.enum(["core", "blog", "video", "shorts", "podcast"]),
          output: z.unknown(),
        }).parse(request.body);
        const sb = createServiceClient();

        const { data: draft, error: fetchErr } = await sb
          .from("content_drafts")
          .select("id, status, channel_id, project_id, org_id, user_id, type, title")
          .eq("id", id)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!draft) throw new ApiError(404, "Draft not found", "NOT_FOUND");
        const row = draft as Record<string, unknown>;
        if (row.user_id !== request.userId) throw new ApiError(403, "Forbidden", "FORBIDDEN");
        if (row.status !== "awaiting_manual") {
          throw new ApiError(409, `Draft is not awaiting manual output (status=${row.status})`, "CONFLICT");
        }

        if (!body.output) {
          throw new ApiError(400, "Output is required", "INVALID_OUTPUT");
        }

        // Determine which field to persist based on phase
        const updateData: Record<string, unknown> = { status: "draft" };
        if (body.phase === "core") {
          updateData.canonical_core_json = body.output;
        } else {
          // For typed content (blog, video, shorts, podcast), persist to draft_json
          updateData.draft_json = body.output;
        }

        // Update draft with the output and flip status to draft
        const { error: updErr } = await (
          sb.from("content_drafts") as unknown as {
            update: (row: Record<string, unknown>) => {
              eq: (col: string, val: string) => Promise<{ error: unknown }>;
            };
          }
        )
          .update(updateData)
          .eq("id", id);
        if (updErr) {
          throw new ApiError(
            500,
            `Failed to mark draft as draft: ${String((updErr as { message?: string })?.message ?? updErr)}`,
            "DB_ERROR",
          );
        }

        logAiUsage({
          userId: request.userId,
          orgId: (row.org_id as string) ?? null,
          action: "manual.completed",
          provider: "manual",
          model: "manual",
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          durationMs: 0,
          status: "success",
          metadata: {
            draftId: id,
            stage: `draft.${body.phase}`,
            output: body.output,
          },
        });

        // Return the updated draft
        const { data: updated } = await sb
          .from("content_drafts")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        return reply.send({
          data: updated ?? row,
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:id/review — Run agent-4 review. Manual trigger only.
   * Requires status = 'in_review'. User sets this via PATCH first.
   */
  fastify.post(
    "/:id/review",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const sb = createServiceClient();
        const { id } = request.params as { id: string };
        const override = providerOverrideSchema.parse(request.body ?? {});
        const draft = (await loadDraft(id)) as Record<string, unknown>;
        const orgId = await getOrgId(request.userId);

        if (draft.status !== "in_review") {
          throw new ApiError(
            400,
            "Draft must be in_review status. Use PATCH to set status first.",
            "INVALID_STATUS",
          );
        }

        // Manual provider short-circuits the LLM call: build the prompt
        // synchronously, emit the full payload to Axiom, persist the draft in
        // awaiting_manual state, and return early. The user pastes the output
        // produced externally via POST /:id/manual-review-output.
        if (override.provider === 'manual') {
          let systemPrompt = (await loadAgentPrompt("review")) ?? undefined;

          // Inject channel context into system prompt
          const channelContextStr = await buildChannelContext(
            draft.channel_id as string | null | undefined,
          );
          if (channelContextStr && systemPrompt) {
            systemPrompt = `${systemPrompt}\n\n${channelContextStr}`;
          }

          // Load channel data for builder
          const channelData = draft.channel_id
            ? await (async () => {
                const { data } = await (
                  createServiceClient() as any
                )
                  .from("channels")
                  .select("name, niche, language, tone, presentation_style")
                  .eq("id", draft.channel_id as string)
                  .maybeSingle();
                return data;
              })()
            : null;

          let ideaData: IdeaContext | null = null;
          if (draft.idea_id) {
            ideaData = await loadIdeaContext(draft.idea_id as string);
          }

          let researchData: unknown = null;
          if (draft.research_session_id) {
            const { data: rs } = await sb
              .from("research_sessions")
              .select("approved_cards_json, cards_json")
              .eq("id", draft.research_session_id as string)
              .maybeSingle();
            researchData = rs?.approved_cards_json ?? rs?.cards_json ?? null;
          }

          const userMessage = buildReviewMessage({
            type: draft.type as string,
            title: draft.title as string,
            draftJson: draft.draft_json,
            canonicalCore: draft.canonical_core_json,
            idea: ideaData,
            research: researchData,
            contentTypesRequested: [draft.type as string],
            channel: channelData as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
          });

          // Update draft to awaiting_manual status
          const { data: manualDraft, error: manualInsertErr } = await (
            sb.from("content_drafts") as unknown as {
              update: (row: Record<string, unknown>) => {
                eq: (col: string, val: string) => {
                  select: () => {
                    single: () => Promise<{ data: unknown; error: unknown }>;
                  };
                };
              };
            }
          )
            .update({ status: 'awaiting_manual' })
            .eq("id", id)
            .select()
            .single();
          if (manualInsertErr || !manualDraft) {
            throw manualInsertErr ?? new ApiError(500, 'Failed to update draft', 'DB_ERROR');
          }

          // Combine system + user message so the operator can copy ONE prompt
          // from Axiom and paste it into ChatGPT/Claude without reassembling.
          const combinedPrompt = systemPrompt
            ? `${systemPrompt}\n\n${userMessage}`
            : userMessage;

          logAiUsage({
            userId: request.userId,
            orgId,
            action: 'manual.awaiting',
            provider: 'manual',
            model: 'manual',
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            durationMs: 0,
            status: 'awaiting_manual',
            metadata: {
              draftId: id,
              stage: 'review',
              channelId: (draft.channel_id as string) ?? null,
              prompt: combinedPrompt,
              input: { type: draft.type, title: draft.title },
            },
          });

          return reply.status(202).send({
            data: { draftId: id, status: 'awaiting_manual' },
            error: null,
          });
        }

        await checkCredits(orgId, request.userId, REVIEW_COST);

        // Build review input from draft context
        let ideaData: IdeaContext | null = null;
        if (draft.idea_id) {
          ideaData = await loadIdeaContext(draft.idea_id as string);
        }

        let researchData: unknown = null;
        if (draft.research_session_id) {
          const { data: rs } = await sb
            .from("research_sessions")
            .select("approved_cards_json, cards_json")
            .eq("id", draft.research_session_id as string)
            .maybeSingle();
          researchData = rs?.approved_cards_json ?? rs?.cards_json ?? null;
        }

        let systemPrompt = (await loadAgentPrompt("review")) ?? undefined;

        // Inject channel context into system prompt
        const channelContextStr = await buildChannelContext(
          draft.channel_id as string | null | undefined,
        );
        if (channelContextStr && systemPrompt) {
          systemPrompt = `${systemPrompt}\n\n${channelContextStr}`;
        }

        // Load channel data for builder
        const channelData = draft.channel_id
          ? await (async () => {
              const { data } = await (
                createServiceClient() as any
              )
                .from("channels")
                .select("name, niche, language, tone, presentation_style")
                .eq("id", draft.channel_id as string)
                .maybeSingle();
              return data;
            })()
          : null;

        let result: Record<string, unknown>;
        try {
          const userMessage = buildReviewMessage({
            type: draft.type as string,
            title: draft.title as string,
            draftJson: draft.draft_json,
            canonicalCore: draft.canonical_core_json,
            idea: ideaData,
            research: researchData,
            contentTypesRequested: [draft.type as string],
            channel: channelData as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
          });

          const response = await generateWithFallback(
            "review",
            (draft.model_tier as string) ?? "standard",
            {
              agentType: "review",
              systemPrompt: systemPrompt ?? '',
              userMessage,
            },
            {
              logContext: {
                userId: request.userId!,
                orgId,
                projectId: (draft.project_id as string) ?? undefined,
                channelId: (draft.channel_id as string) ?? undefined,
                sessionId: id,
                sessionType: 'review',
              },
            },
          );
          result = response.result as Record<string, unknown>;
        } catch (agentError) {
          // On agent failure: mark failed, don't debit credits
          await (
            sb.from("content_drafts") as unknown as {
              update: (row: Record<string, unknown>) => {
                eq: (col: string, val: string) => Promise<{ error: unknown }>;
              };
            }
          )
            .update({
              status: "failed",
              review_feedback_json: { error: String(agentError) },
            })
            .eq("id", id);
          throw agentError;
        }

        // Extract verdict and score from agent response
        const overallVerdict =
          (result.overall_verdict as string) ?? "revision_required";
        const draftType = draft.type as string;
        const formatReview = result[`${draftType}_review`] as
          | Record<string, unknown>
          | undefined;
        const reviewScore = (formatReview?.score as number) ?? null;
        const iterationCount = ((draft.iteration_count as number) ?? 0) + 1;

        // Determine status based on agent verdict
        let newStatus: string;
        let newVerdict: string;
        let approvedAt: string | null = null;

        if (overallVerdict === "approved") {
          newStatus = "approved";
          newVerdict = "approved";
          approvedAt = new Date().toISOString();
        } else if (overallVerdict === "rejected") {
          newStatus = "failed";
          newVerdict = "rejected";
        } else {
          newStatus = "in_review";
          newVerdict = "revision_required";
        }

        // Store review data
        const updateData: Record<string, unknown> = {
          review_feedback_json: result,
          review_score: reviewScore,
          review_verdict: newVerdict,
          iteration_count: iterationCount,
          status: newStatus,
        };
        if (approvedAt) updateData.approved_at = approvedAt;

        const { data: updated, error } = await (
          sb.from("content_drafts") as unknown as {
            update: (row: Record<string, unknown>) => {
              eq: (
                col: string,
                val: string,
              ) => {
                select: () => {
                  single: () => Promise<{ data: unknown; error: unknown }>;
                };
              };
            };
          }
        )
          .update(updateData)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;

        // Log review iteration
        await (
          sb.from("review_iterations" as never) as unknown as {
            insert: (
              row: Record<string, unknown>,
            ) => Promise<{ error: unknown }>;
          }
        ).insert({
          draft_id: id,
          iteration: iterationCount,
          score: reviewScore,
          verdict: newVerdict,
          feedback_json: result,
        });

        // Debit credits only on successful agent call
        await debitCredits(
          orgId,
          request.userId,
          "review",
          "text",
          REVIEW_COST,
          {
            draftId: id,
            type: draftType,
            iteration: iterationCount,
          },
        );

        return reply.send({
          data: { draft: updated, review: result },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:id/manual-review-output — Submit the review feedback produced externally
   * for a draft in `awaiting_manual` status. Persists the review feedback, updates
   * verdict and score, and transitions status appropriately (approved/in_review/failed).
   */
  fastify.post(
    "/:id/manual-review-output",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId) throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const body = z.record(z.unknown())
          .refine(
            (data) => {
              // At least one verdict field must be present
              const hasOverallVerdict = typeof data.overall_verdict === 'string';
              const hasBlogReview = data.blog_review && typeof data.blog_review === 'object';
              const hasVideoReview = data.video_review && typeof data.video_review === 'object';
              const hasShortsReview = data.shorts_review && typeof data.shorts_review === 'object';
              const hasPodcastReview = data.podcast_review && typeof data.podcast_review === 'object';
              return hasOverallVerdict || hasBlogReview || hasVideoReview || hasShortsReview || hasPodcastReview;
            },
            { message: 'Review output must contain verdict and/or format-specific review data' }
          )
          .parse(request.body);

        const sb = createServiceClient();

        const { data: draft, error: fetchErr } = await sb
          .from("content_drafts")
          .select("id, status, channel_id, project_id, org_id, user_id, type, title, iteration_count")
          .eq("id", id)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!draft) throw new ApiError(404, "Draft not found", "NOT_FOUND");
        const row = draft as Record<string, unknown>;
        if (row.user_id !== request.userId) throw new ApiError(403, "Forbidden", "FORBIDDEN");
        if (row.status !== "awaiting_manual") {
          throw new ApiError(409, `Draft is not awaiting manual review (status=${row.status})`, "CONFLICT");
        }

        // Extract verdict and score from the review output, matching AI review logic
        const draftType = row.type as string;
        const formatReview = body[`${draftType}_review` as keyof typeof body] as
          | Record<string, unknown>
          | undefined;

        let reviewScore: number | null = null;
        let reviewVerdict = "revision_required";

        if (formatReview && typeof formatReview.score === 'number') {
          reviewScore = formatReview.score;
        }

        const overallVerdict = body.overall_verdict ? String(body.overall_verdict) : null;
        if (formatReview && typeof formatReview.verdict === 'string') {
          reviewVerdict = String(formatReview.verdict).toLowerCase().replace(/\s+/g, '_');
        }
        if (overallVerdict) {
          reviewVerdict = overallVerdict.toLowerCase().replace(/\s+/g, '_');
        }

        // Determine status based on verdict
        let newStatus: string;
        let approvedAt: string | null = null;

        if (reviewVerdict === "approved" || (reviewScore !== null && reviewScore >= 90)) {
          newStatus = "approved";
          reviewVerdict = "approved";
          approvedAt = new Date().toISOString();
        } else if (reviewVerdict === "rejected") {
          newStatus = "failed";
        } else {
          newStatus = "in_review";
          reviewVerdict = "revision_required";
        }

        const iterationCount = ((row.iteration_count as number) ?? 0) + 1;

        // Store review data
        const updateData: Record<string, unknown> = {
          review_feedback_json: body,
          review_score: reviewScore,
          review_verdict: reviewVerdict,
          iteration_count: iterationCount,
          status: newStatus,
        };
        if (approvedAt) updateData.approved_at = approvedAt;

        const { data: updated, error } = await (
          sb.from("content_drafts") as unknown as {
            update: (row: Record<string, unknown>) => {
              eq: (
                col: string,
                val: string,
              ) => {
                select: () => {
                  single: () => Promise<{ data: unknown; error: unknown }>;
                };
              };
            };
          }
        )
          .update(updateData)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;

        // Log review iteration
        await (
          sb.from("review_iterations" as never) as unknown as {
            insert: (
              row: Record<string, unknown>,
            ) => Promise<{ error: unknown }>;
          }
        ).insert({
          draft_id: id,
          iteration: iterationCount,
          score: reviewScore,
          verdict: reviewVerdict,
          feedback_json: body,
        });

        logAiUsage({
          userId: request.userId,
          orgId: (row.org_id as string) ?? null,
          action: "manual.completed",
          provider: "manual",
          model: "manual",
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          durationMs: 0,
          status: "success",
          metadata: {
            draftId: id,
            stage: 'review',
            output: body,
          },
        });

        // Return the updated draft
        return reply.send({
          data: updated ?? row,
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:id/revise — Accept user edits after review returns revision_required.
   */
  fastify.post(
    "/:id/revise",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        const { id } = request.params as { id: string };
        const draft = (await loadDraft(id)) as Record<string, unknown>;
        const body = reviseSchema.parse(request.body);

        const verdict = draft.review_verdict as string;
        if (verdict !== "revision_required" && verdict !== "rejected") {
          throw new ApiError(
            400,
            "Draft must have review_verdict of revision_required or rejected to revise.",
            "INVALID_VERDICT",
          );
        }

        const { data, error } = await (
          sb.from("content_drafts") as unknown as {
            update: (row: Record<string, unknown>) => {
              eq: (
                col: string,
                val: string,
              ) => {
                select: () => {
                  single: () => Promise<{ data: unknown; error: unknown }>;
                };
              };
            };
          }
        )
          .update({
            draft_json: body.draftJson,
            status: "in_review",
          })
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return reply.send({ data, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:id/asset-prompts — Extract section data from draft + channel context
   * for building BC_ASSETS_INPUT. Pure data extraction, no AI call.
   */
  fastify.post(
    "/:id/asset-prompts",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const draft = await loadDraft(id);
        const input = await buildAssetsInput(draft as Record<string, unknown>);
        return reply.send({ data: input, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:id/images — F2-042. Generate a hero image for this draft using the
   * configured image provider. Stored as base64 in the draft's draft_json.images[].
   * Body: { prompt?: string, slot?: "hero" | "inline", aspectRatio?: string }.
   * If prompt is omitted, derives from the draft title + meta_description.
   */
  fastify.post(
    "/:id/images",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const body = z
          .object({
            prompt: z.string().optional(),
            slot: z.enum(["hero", "inline"]).default("hero"),
            aspectRatio: z.string().default("16:9"),
          })
          .parse(request.body ?? {});

        const draft = (await loadDraft(id)) as Record<string, unknown>;
        const { getImageProvider } = await import("../lib/ai/imageIndex.js");
        const provider = await getImageProvider();

        // Derive prompt from draft content if not given.
        let prompt = body.prompt;
        if (!prompt) {
          const title = (draft.title as string) ?? "artigo sobre tema geral";
          const dj = draft.draft_json as Record<string, unknown> | null;
          const meta =
            (dj?.meta_description as string | undefined) ??
            (dj?.hook as string | undefined) ??
            "";
          prompt = `Editorial illustration for article: "${title}". ${meta}. Clean modern style, high contrast, no text overlays.`;
        }

        const images = await provider.generateImages({
          prompt,
          numImages: 1,
          aspectRatio: body.aspectRatio,
        });
        if (!images[0])
          throw new ApiError(
            500,
            "Image generation returned no results",
            "GEN_FAILED",
          );

        const img = images[0];
        const imageEntry = {
          slot: body.slot,
          prompt,
          aspectRatio: body.aspectRatio,
          mimeType: img.mimeType,
          dataUrl: `data:${img.mimeType};base64,${img.base64}`,
          createdAt: new Date().toISOString(),
        };

        // Append to draft_json.images
        const sb = createServiceClient();
        const existing =
          (draft.draft_json as { images?: unknown[] } | null) ?? {};
        const images_arr = (existing as { images?: unknown[] }).images ?? [];
        const newDraftJson = {
          ...(existing as object),
          images: [...images_arr, imageEntry],
        };
        const { error: updateErr } = await (
          sb.from("content_drafts") as unknown as {
            update: (row: Record<string, unknown>) => {
              eq: (c: string, v: string) => Promise<{ error: unknown }>;
            };
          }
        )
          .update({ draft_json: newDraftJson })
          .eq("id", id);
        if (updateErr) throw updateErr;

        return reply.send({
          data: { image: imageEntry, count: images_arr.length + 1 },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:id/reproduce — Re-run production agent with review feedback context.
   * Used in the revision loop: review gives feedback → reproduce fixes issues.
   */
  fastify.post(
    "/:id/reproduce",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const sb = createServiceClient();
        const { id } = request.params as { id: string };
        const draft = (await loadDraft(id)) as Record<string, unknown>;
        const orgId = await getOrgId(request.userId);

        if (!draft.review_feedback_json) {
          throw new ApiError(
            400,
            "No review feedback to revise from. Submit for review first.",
            "NO_FEEDBACK",
          );
        }

        const type = (draft.type as string) ?? "blog";
        const cost = FORMAT_COSTS[type] ?? 200;
        await checkCredits(orgId, request.userId, cost);

        let systemPrompt =
          (await loadAgentPrompt(type)) ??
          (await loadAgentPrompt("production")) ??
          undefined;

        // Inject production settings if present
        const settings = draft.production_settings_json as Record<
          string,
          unknown
        > | null;
        if (settings && systemPrompt) {
          const ctx: string[] = [];
          if (settings.wordCountTarget)
            ctx.push(`Target word count: ${settings.wordCountTarget}`);
          if (settings.writingStyle)
            ctx.push(`Writing style: ${settings.writingStyle}`);
          if (settings.tone) ctx.push(`Tone: ${settings.tone}`);
          if (ctx.length > 0) {
            systemPrompt = `${systemPrompt}\n\n## Production Settings\n${ctx.join("\n")}`;
          }
        }

        // Build input with review feedback context
        const reviewFeedback = draft.review_feedback_json as Record<
          string,
          unknown
        >;
        const formatReview = reviewFeedback[`${type}_review`] as
          | Record<string, unknown>
          | undefined;

        // Load channel data for builder
        const channelData = draft.channel_id
          ? await (async () => {
              const { data } = await (
                createServiceClient() as any
              )
                .from("channels")
                .select("name, niche, language, tone, presentation_style")
                .eq("id", draft.channel_id as string)
                .maybeSingle();
              return data;
            })()
          : null;

        const userMessage = buildReproduceMessage({
          type: type as string,
          title: draft.title as string,
          canonicalCore: draft.canonical_core_json,
          previousDraft: draft.draft_json,
          reviewFeedback: {
            overall_verdict: reviewFeedback.overall_verdict as string | undefined,
            score: formatReview?.score as number | null | undefined,
            critical_issues: (formatReview?.critical_issues ?? []) as string[],
            minor_issues: (formatReview?.minor_issues ?? []) as string[],
            strengths: (formatReview?.strengths ?? []) as string[],
          },
          channel: channelData as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
        });

        const { result } = await generateWithFallback(
          "production",
          (draft.model_tier as string) ?? "standard",
          {
            agentType: "production",
            systemPrompt: systemPrompt ?? '',
            userMessage,
          },
          {
            logContext: {
              userId: request.userId!,
              orgId,
              projectId: (draft.project_id as string) ?? undefined,
              channelId: (draft.channel_id as string) ?? undefined,
              sessionId: id,
              sessionType: 'production',
            },
          },
        );

        const iterationCount = ((draft.iteration_count as number) ?? 0) + 1;

        const { data: updated, error } = await (
          sb.from("content_drafts") as unknown as {
            update: (row: Record<string, unknown>) => {
              eq: (
                col: string,
                val: string,
              ) => {
                select: () => {
                  single: () => Promise<{ data: unknown; error: unknown }>;
                };
              };
            };
          }
        )
          .update({
            draft_json: result,
            status: "draft",
            review_verdict: "pending",
            iteration_count: iterationCount,
          })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;

        await debitCredits(
          orgId,
          request.userId,
          `reproduce-${type}`,
          "text",
          cost,
          {
            draftId: id,
            type,
            iteration: iterationCount,
          },
        );

        return reply.send({ data: updated, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  /**
   * DELETE /:id — remove a draft.
   */
  fastify.delete(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const sb = createServiceClient();
        const { error } = await sb.from("content_drafts").delete().eq("id", id);
        if (error) throw error;
        return reply.send({ data: { deleted: true }, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
