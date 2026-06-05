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
import { reserve, commit, release } from "../lib/credits/reservations.js";
import {
  blogProductionSettingsSchema,
  reviseSchema,
} from "@brighttale/shared/schemas/pipeline";
import {
  deriveDraftRequestSchema,
  assetSettingsSchema,
} from "@brighttale/shared/schemas/content-drafts";
import { deriveDraft } from "../lib/content-drafts/derive.js";
import { inngest } from "../jobs/client.js";
import { emitJobEvent } from "../jobs/emitter.js";
import {
  buildLayeredPersonaContext,
  loadPersonaForDraft,
} from "../lib/personas.js";
import { loadPriorReviewAttempts } from "../lib/ai/loadPriorReviewAttempts.js";
import {
  normalizeReviewFeedback,
  STAGE_CHANNEL_SELECT,
  buildStageSystemPrompt,
  buildStageUserMessage,
} from "../lib/ai/generation/index.js";
import { validateProducedDraft } from "../lib/ai/validators/index.js";
import { buildReviewMessage } from "../lib/ai/prompts/review.js";
import {
  computeRubricScore,
  deriveVerdictFromScore,
  extractRubricEvaluation,
  getRubricForType,
} from "../lib/ai/scoring/computeRubricScore.js";
import { buildAssetsMessage } from "../lib/ai/prompts/assets.js";
import {
  loadIdeaContext,
  type IdeaContext,
} from "../lib/ai/loadIdeaContext.js";
import { logAiUsage } from "../lib/axiom.js";
import { deriveTier } from "@brighttale/shared/utils/reviewTierCompat";
import { loadPlatformSettings } from "../lib/platform-settings.js";
import { calculateDraftCost } from "../lib/calculate-draft-cost.js";
import { getVoiceProvider } from "../lib/voice/index.js";
import { mapVideoOutputToShortsInput } from "@brighttale/shared/mappers/video-to-shorts";
import type { CanonicalCore, VideoOutput } from "@brighttale/shared/types/agents";


const createSchema = z.object({
  channelId: z.string().uuid().optional(),
  ideaId: z.string().optional(),
  researchSessionId: z.string().uuid().optional(),
  projectId: z.string().optional(),
  personaId: z.string().uuid().optional(),
  type: z.enum(["blog", "video", "shorts", "podcast", "engagement"]),
  title: z.string().optional(),
  modelTier: z.string().default("standard"),
  productionParams: z.record(z.unknown()).optional(),
});

const providerOverrideSchema = z.object({
  provider: z
    .enum(["gemini", "openai", "anthropic", "ollama", "manual"])
    .optional(),
  model: z.string().optional(),
  modelTier: z.string().optional(),
  productionParams: z.record(z.unknown()).optional(),
});

const synthesizeDraftSchema = z.object({
  voiceId: z.string().optional(),
  provider: z.enum(["elevenlabs", "openai"]).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  format: z.enum(["mp3", "wav"]).default("mp3"),
  style: z.string().optional(),
});

/**
 * Splits a long script into chunks ≤ maxChars at sentence boundaries.
 * Falls back to hard-cut on whitespace when a single sentence exceeds the
 * limit. Output preserves whitespace between sentences.
 */
function chunkTeleprompter(text: string, maxChars = 3800): string[] {
  if (text.length <= maxChars) return [text];
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > maxChars) {
      if (current) chunks.push(current.trim());
      if (s.length > maxChars) {
        // Single sentence longer than the cap — hard split on whitespace.
        let remaining = s;
        while (remaining.length > maxChars) {
          const cut = remaining.lastIndexOf(" ", maxChars);
          const at = cut > maxChars / 2 ? cut : maxChars;
          chunks.push(remaining.slice(0, at).trim());
          remaining = remaining.slice(at);
        }
        current = remaining;
      } else {
        current = s;
      }
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

const updateSchema = z.object({
  title: z.string().optional(),
  canonicalCoreJson: z.record(z.unknown()).optional(),
  draftJson: z.record(z.unknown()).optional(),
  reviewFeedbackJson: z.record(z.unknown()).optional(),
  reviewScore: z.number().min(0).max(100).optional(),
  reviewVerdict: z
    .enum(["pending", "approved", "revision_required", "rejected"])
    .optional(),
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
  /** S6 — image-mode persistence: persists into draft_json.assetSettings */
  assetSettings: assetSettingsSchema.optional(),
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
 * Enforce the project's `review.maxIterations` cap before consuming credits on
 * another review/revision. Mirrors the check in pipeline-review-dispatch so
 * legacy direct-call routes can't blow past the wizard limit even when the
 * orchestrator isn't in the loop. No-op for project-less drafts and projects
 * whose autopilot config doesn't define the slot.
 */
async function assertWithinReviewCap(
  projectId: string | null | undefined,
  currentIterationCount: number,
): Promise<void> {
  if (!projectId) return;
  const sb = createServiceClient();
  const { data: project } = await sb
    .from("projects")
    .select("autopilot_config_json")
    .eq("id", projectId)
    .maybeSingle();
  const cfg = (project as { autopilot_config_json?: Record<string, unknown> | null } | null)
    ?.autopilot_config_json as Record<string, unknown> | null | undefined;
  const review = cfg?.review as { maxIterations?: unknown } | undefined;
  const maxIterations = review?.maxIterations;
  if (typeof maxIterations !== "number" || maxIterations <= 0) return;
  if (currentIterationCount + 1 > maxIterations) {
    throw new ApiError(
      409,
      `Review iteration cap reached (${maxIterations}). Approve or hard-reject the draft to proceed.`,
      "MAX_ITERATIONS",
    );
  }
}

function resolveSeoDefaults(draft: Record<string, unknown>): {
  title: string;
  slug: string;
  meta_description: string;
  primary_keyword: string;
  secondary_keywords: string[];
  categories: string[];
  tags: string[];
} {
  const dj = (draft.draft_json ?? {}) as Record<string, unknown>;
  const blog = (dj.blog ?? dj) as Record<string, unknown>;
  const canonicalCore = (draft.canonical_core_json ?? {}) as Record<string, unknown>;
  const feedback = (draft.review_feedback_json ?? {}) as Record<
    string,
    unknown
  >;
  const root = (feedback.BC_REVIEW_OUTPUT ?? feedback) as Record<
    string,
    unknown
  >;
  const blogReview = (root.blog_review ?? root.blog) as
    | Record<string, unknown>
    | undefined;
  const pubPlan = (root.publication_plan ?? blogReview?.publication_plan) as
    | Record<string, unknown>
    | undefined;
  const pubBlog = (pubPlan?.blog ?? pubPlan) as
    | Record<string, unknown>
    | undefined;
  const seo = (pubBlog?.final_seo ??
    pubBlog?.seo ??
    pubPlan?.final_seo ??
    {}) as Record<string, string>;

  const title =
    seo.title || (draft.title as string) || (blog.title as string) || "";
  const slug = seo.slug || (blog.slug as string) || (dj.slug as string) || "";
  const metaDesc =
    seo.meta_description ||
    seo.metaDescription ||
    (blog.meta_description as string) ||
    (dj.meta_description as string) ||
    "";
  const primaryKeyword =
    (blog.primary_keyword as string) || (dj.primary_keyword as string) || "";
  const secondaryKeywords =
    (blog.secondary_keywords as string[]) ??
    (dj.secondary_keywords as string[]) ??
    [];
  // Resolution cascade for categories + tags:
  //   1. canonical_core_json (source of truth — agent-3a writes these as
  //      format-agnostic taxonomy shared across blog/video/shorts/podcast)
  //   2. publication_plan.blog.* (legacy: review agent used to seed these
  //      as empty placeholders, kept for back-compat with pre-canonical drafts)
  //   3. publication_plan.* (even older shape — flat layout)
  //   4. keyword fallback (primary_keyword for categories, secondary_keywords
  //      for tags) — last resort for projects with neither canonical nor
  //      a populated review publication_plan.
  //
  // `??` short-circuits on null/undefined but NOT on empty arrays — review
  // template seeded `[]` placeholders that frequently shipped untouched, so
  // the cascade has to length-check each candidate explicitly.
  const firstNonEmpty = (...candidates: (unknown)[]): string[] => {
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) return c as string[];
    }
    return [];
  };
  const categories = firstNonEmpty(
    canonicalCore.categories,
    pubBlog?.categories,
    pubPlan?.categories,
    primaryKeyword ? [primaryKeyword] : [],
  );
  const tags = firstNonEmpty(
    canonicalCore.tags,
    pubBlog?.tags,
    pubPlan?.tags,
    secondaryKeywords,
  );

  return {
    title,
    slug,
    meta_description: metaDesc,
    primary_keyword: primaryKeyword,
    secondary_keywords: secondaryKeywords,
    categories,
    tags,
  };
}

/**
 * Build BC_ASSETS_INPUT from a draft row. Shared between the data-only
 * /asset-prompts route and the LLM-powered /generate-asset-prompts route.
 */
async function buildAssetsInput(draft: Record<string, unknown>): Promise<{
  title: string;
  content_type: string;
  sections: Array<{
    slot: string;
    section_title: string;
    key_points: string[];
  }>;
  channel_context: Record<string, unknown>;
  idea_context: IdeaContext | null;
  draft_excerpt?: string;
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
  } else if (
    coreJson.argument_chain &&
    Array.isArray(coreJson.argument_chain)
  ) {
    outline = (coreJson.argument_chain as Array<Record<string, unknown>>).map(
      (s) => ({
        h2: (s.claim as string) ?? (s.section as string) ?? "",
        key_points: Array.isArray(s.evidence) ? (s.evidence as string[]) : [],
      }),
    );
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

  // Extract draft_excerpt: intro paragraph + H2 headings from full_draft
  let draft_excerpt: string | undefined;
  const fullDraft =
    (draftJson?.full_draft as string | undefined) ??
    ((draftJson?.blog as Record<string, unknown> | undefined)?.full_draft as
      | string
      | undefined) ??
    "";
  if (fullDraft) {
    const lines = fullDraft.split("\n");
    const excerptParts: string[] = [];
    // Grab first non-empty paragraph (intro)
    const firstPara = lines.find((l) => l.trim() && !l.startsWith("#"));
    if (firstPara) excerptParts.push(firstPara.trim());
    // Grab all H2 headings
    const headings = lines
      .filter((l) => l.startsWith("## "))
      .map((l) => l.trim());
    excerptParts.push(...headings);
    if (excerptParts.length > 0) {
      draft_excerpt = excerptParts.join("\n");
    }
  }

  return {
    title: (draft.title as string) ?? "Untitled",
    content_type: contentType,
    sections,
    channel_context: channelContext,
    idea_context: idea,
    ...(draft_excerpt ? { draft_excerpt } : {}),
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
        const column =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            body.ideaId,
          )
            ? "id"
            : "idea_id";
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
          persona_id: body.personaId ?? null,
          type: body.type,
          title: body.title ?? null,
          status: "draft",
          production_params: body.productionParams ?? null,
        })
        .select()
        .single();

      if (error) {
        if ((error as { code?: string }).code === "23503") {
          throw new ApiError(400, "Persona not found", "INVALID_PERSONA_ID");
        }
        throw error;
      }
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
        const resolved_seo = resolveSeoDefaults(
          draft as unknown as Record<string, unknown>,
        );
        return reply.send({ data: { ...draft, resolved_seo }, error: null });
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

        // S6 — assetSettings: merge into draft_json.assetSettings.
        // If draftJson was explicitly provided it takes precedence; otherwise
        // we load the current draft_json and patch assetSettings into it.
        if (body.assetSettings !== undefined) {
          if (body.draftJson !== undefined) {
            // Caller provided explicit draftJson — inject assetSettings into it
            update.draft_json = {
              ...(body.draftJson as Record<string, unknown>),
              assetSettings: body.assetSettings,
            };
          } else {
            // Load current draft_json and merge assetSettings
            const existing = await loadDraft(id);
            const existingDraftJson =
              (existing.draft_json as Record<string, unknown> | null) ?? {};
            update.draft_json = {
              ...existingDraftJson,
              assetSettings: body.assetSettings,
            };
          }
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
        // Ownership guard: /generate overwrites canonical_core_json and bills
        // the draft's org. Mirrors the guard on /produce.
        if (draft.user_id && draft.user_id !== request.userId) {
          throw new ApiError(
            403,
            `Forbidden: this draft belongs to user ${String(draft.user_id).slice(0, 8)}… and the current session is user ${String(request.userId).slice(0, 8)}…. Log in as the draft owner.`,
            "FORBIDDEN",
          );
        }
        // Prefer draft.org_id over a fresh org_memberships lookup — see
        // /produce for the rationale (OAuth/admin sessions without a
        // membership row would otherwise hit "No organization found").
        const orgId =
          (draft.org_id as string | null) ?? (await getOrgId(request.userId));

        const creditSettings = await loadPlatformSettings(createServiceClient());
        const CANONICAL_CORE_COST = creditSettings.costCanonicalCore;

        const type =
          (draft.type as "blog" | "video" | "shorts" | "podcast") ?? "blog";
        // Local Ollama runs cost us nothing → no internal credit charge.
        const _totalCost =
          override.provider === "ollama"
            ? 0
            : calculateDraftCost(type, creditSettings) + CANONICAL_CORE_COST;

        // Credit reservation handled per-job via withReservation inside production/generate.
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
      let coreToken: string | null = null;
      let coreReservationDone = false;
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const sb = createServiceClient();
        const { id } = request.params as { id: string };
        const override = providerOverrideSchema.parse(request.body ?? {});
        const draft = (await loadDraft(id)) as Record<string, unknown>;
        const orgId = await getOrgId(request.userId);

        const creditSettings = await loadPlatformSettings(sb);
        const CANONICAL_CORE_COST = creditSettings.costCanonicalCore;

        // Manual provider short-circuits the LLM call: build the prompt
        // synchronously, emit the full payload to Axiom, persist the draft in
        // awaiting_manual state, and return early. The user pastes the output
        // produced externally via POST /:id/manual-output.
        if (override.provider === "manual") {
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
                const { data } = await (createServiceClient() as any)
                  .from("channels")
                  .select(STAGE_CHANNEL_SELECT)
                  .eq("id", draft.channel_id as string)
                  .maybeSingle();
                return data;
              })()
            : null;

          const idea = draft.idea_id
            ? await loadIdeaContext(draft.idea_id as string)
            : null;
          const persona = await loadPersonaForDraft(draft, sb);
          const layeredPersona = persona ? await buildLayeredPersonaContext(persona, sb) : null;

          const userMessage = buildStageUserMessage({
            stage: 'canonical',
            ctx: {
              draft: draft as Record<string, unknown>,
              persona,
              layeredPersona,
              channel: channelData as Record<string, unknown> | null,
              idea,
              researchCards: approvedCards,
            },
          });
          if (layeredPersona?.constraints.length) {
            systemPrompt = systemPrompt
              ? buildStageSystemPrompt(systemPrompt, layeredPersona.constraints)
              : buildStageSystemPrompt('', layeredPersona.constraints);
          }

          // Update draft to awaiting_manual status
          const { data: manualDraft, error: manualInsertErr } = await (
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
            .update({ status: "awaiting_manual" })
            .eq("id", id)
            .select()
            .single();
          if (manualInsertErr || !manualDraft) {
            throw (
              manualInsertErr ??
              new ApiError(500, "Failed to update draft", "DB_ERROR")
            );
          }

          // Combine system + user message so the operator can copy ONE prompt
          // from Axiom and paste it into ChatGPT/Claude without reassembling.
          const combinedPrompt = systemPrompt
            ? `${systemPrompt}\n\n${userMessage}`
            : userMessage;

          logAiUsage({
            userId: request.userId,
            orgId,
            action: "manual.awaiting",
            provider: "manual",
            model: "manual",
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            durationMs: 0,
            status: "awaiting_manual",
            metadata: {
              draftId: id,
              stage: "draft.core",
              channelId: (draft.channel_id as string) ?? null,
              prompt: combinedPrompt,
              input: { type: draft.type, title: draft.title },
            },
          });

          return reply.status(202).send({
            data: { draftId: id, status: "awaiting_manual" },
            error: null,
          });
        }

        // Reserve credits upfront; commit on success, release on error.
        coreToken = await reserve(orgId, request.userId, CANONICAL_CORE_COST);

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
              const { data } = await (createServiceClient() as any)
                .from("channels")
                .select(STAGE_CHANNEL_SELECT)
                .eq("id", draft.channel_id as string)
                .maybeSingle();
              return data;
            })()
          : null;

        const idea = draft.idea_id
          ? await loadIdeaContext(draft.idea_id as string)
          : null;
        const persona = await loadPersonaForDraft(draft, sb);
        const layeredPersona = persona ? await buildLayeredPersonaContext(persona, sb) : null;

        const coreCtx = {
          draft: draft as Record<string, unknown>,
          persona,
          layeredPersona,
          channel: channelData as Record<string, unknown> | null,
          idea,
          researchCards: approvedCards,
        };
        const userMessage = buildStageUserMessage({ stage: 'canonical', ctx: coreCtx });

        const { result } = await generateWithFallback(
          "production",
          override.modelTier ?? (draft.model_tier as string) ?? "standard",
          {
            agentType: "production",
            systemPrompt: buildStageSystemPrompt(systemPrompt, layeredPersona?.constraints ?? []),
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
              sessionType: "production",
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
            canonical_core_json:
              draft.idea_id &&
              result &&
              typeof result === "object" &&
              !Array.isArray(result)
                ? {
                    ...(result as Record<string, unknown>),
                    idea_id: draft.idea_id,
                  }
                : result,
            status: "draft",
          })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;

        await commit(coreToken, CANONICAL_CORE_COST, "canonical-core", "text", {
          draftId: id,
          type: draft.type,
        });
        coreReservationDone = true;

        return reply.send({ data: updated, error: null });
      } catch (error) {
        if (!coreReservationDone && coreToken !== null) {
          await release(coreToken).catch(() => { /* best-effort */ });
        }
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
        // Ownership guard: produce mutates the draft (and bills its org), so
        // require the session user own the row. Surface the mismatching IDs in
        // the error message — without them the operator can't tell whether the
        // wrong account is logged in or a session got swapped.
        if (draft.user_id && draft.user_id !== request.userId) {
          throw new ApiError(
            403,
            `Forbidden: this draft belongs to user ${String(draft.user_id).slice(0, 8)}… and the current session is user ${String(request.userId).slice(0, 8)}…. Log in as the draft owner.`,
            "FORBIDDEN",
          );
        }
        // Prefer the draft's org_id over a fresh org_memberships lookup. Some
        // users (OAuth signups, admin impersonation) hit /produce without an
        // org_membership row and getOrgId throws "No organization found" even
        // though the draft itself has a valid org_id. Falling back to the
        // membership lookup keeps the legacy path intact when draft.org_id is
        // null (pre-org-scoping migration drafts).
        const orgId =
          (draft.org_id as string | null) ?? (await getOrgId(request.userId));

        const creditSettings = await loadPlatformSettings(sb);

        const type = (draft.type as string) ?? "blog";
        const _cost = calculateDraftCost(type, creditSettings);

        // Manual provider short-circuits the LLM call: build the prompt
        // synchronously, emit the full payload to Axiom, persist the draft in
        // awaiting_manual state, and return early. The user pastes the output
        // produced externally via POST /:id/manual-output.
        if (override.provider === "manual") {
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
            if (
              Array.isArray(settings.keywords) &&
              settings.keywords.length > 0
            )
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
              settingsContext.push(
                `WordPress tags: ${settings.tags.join(", ")}`,
              );
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
                const { data } = await (createServiceClient() as any)
                  .from("channels")
                  .select(STAGE_CHANNEL_SELECT)
                  .eq("id", draft.channel_id as string)
                  .maybeSingle();
                return data;
              })()
            : null;

          const idea = draft.idea_id
            ? await loadIdeaContext(draft.idea_id as string)
            : null;
          const persona = await loadPersonaForDraft(draft, sb);
          const layeredPersonaForProduce = persona ? await buildLayeredPersonaContext(persona, sb) : null;

          const userMessage = buildStageUserMessage({
            stage: 'produce',
            ctx: {
              draft: { ...draft as Record<string, unknown>, type },
              persona,
              layeredPersona: layeredPersonaForProduce,
              channel: channelData as Record<string, unknown> | null,
              idea,
              researchCards: null,
            },
            productionParams:
              (draft.production_params as Record<string, unknown> | null) ??
              null,
          });

          // Update draft to awaiting_manual status
          const { data: manualDraft, error: manualInsertErr } = await (
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
            .update({ status: "awaiting_manual" })
            .eq("id", id)
            .select()
            .single();
          if (manualInsertErr || !manualDraft) {
            throw (
              manualInsertErr ??
              new ApiError(500, "Failed to update draft", "DB_ERROR")
            );
          }

          // Combine system + user message so the operator can copy ONE prompt
          // from Axiom and paste it into ChatGPT/Claude without reassembling.
          const combinedPrompt = systemPrompt
            ? `${systemPrompt}\n\n${userMessage}`
            : userMessage;

          logAiUsage({
            userId: request.userId,
            orgId,
            action: "manual.awaiting",
            provider: "manual",
            model: "manual",
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            durationMs: 0,
            status: "awaiting_manual",
            metadata: {
              draftId: id,
              stage: `draft.${type}`,
              channelId: (draft.channel_id as string) ?? null,
              prompt: combinedPrompt,
              input: { type, title: draft.title },
            },
          });

          return reply.status(202).send({
            data: { draftId: id, status: "awaiting_manual" },
            error: null,
          });
        }

        // Credit reservation handled by production-produce job via withReservation.
        // Async path: dispatch the produce LLM call to the production-produce
        // Inngest worker so the route returns 202 quickly. The worker emits
        // SSE progress events; DraftEngine subscribes via /:id/events.
        await emitJobEvent(id, "production", "queued", "Iniciando produção…");
        await inngest.send({
          name: "production/produce",
          data: {
            draftId: id,
            orgId,
            userId: request.userId,
            type: type as "blog" | "video" | "shorts" | "podcast",
            modelTier:
              override.modelTier ?? (draft.model_tier as string) ?? "standard",
            provider: override.provider,
            model: override.model,
            productionParams:
              override.productionParams ??
              (draft.production_params as Record<string, unknown> | null) ??
              null,
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
   * POST /:id/cancel — Cancel a draft in `awaiting_manual` status.
   */
  fastify.post(
    "/:id/cancel",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
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
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const body = z
          .object({
            phase: z.enum(["core", "blog", "video", "shorts", "podcast"]),
            output: z.unknown(),
          })
          .parse(request.body);
        const sb = createServiceClient();

        const { data: draft, error: fetchErr } = await sb
          .from("content_drafts")
          .select(
            "id, status, channel_id, project_id, org_id, user_id, type, title",
          )
          .eq("id", id)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!draft) throw new ApiError(404, "Draft not found", "NOT_FOUND");
        const row = draft as Record<string, unknown>;
        if (row.user_id !== request.userId)
          throw new ApiError(403, "Forbidden", "FORBIDDEN");
        if (row.status !== "awaiting_manual") {
          throw new ApiError(
            409,
            `Draft is not awaiting manual output (status=${row.status})`,
            "CONFLICT",
          );
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

        // Pipeline Orchestrator handoff for manual production/canonical writes:
        // flip the matching project stage_run to `completed`. Without this,
        // stage_runs.production stays `queued`/`running` after the user pastes
        // output — the v2 sidebar / advance polling keeps the run open and
        // downstream stages never trigger. Mirror of brainstorm manual-output
        // fix and production-produce.ts:300 (AI dispatcher path).
        const projectId = row.project_id as string | null | undefined;
        if (projectId) {
          const targetStage = body.phase === "core" ? "canonical" : "production";
          const { data: matchingRun } = await sb
            .from("stage_runs")
            .select("id, payload_ref")
            .eq("project_id", projectId)
            .eq("stage", targetStage)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const runRef = (matchingRun?.payload_ref ?? null) as
            | { kind?: string; id?: string }
            | null;
          // Only flip when the stage_run's payload_ref points at THIS draft —
          // protects against multi-track projects where production has
          // multiple draftIds and we don't want to clobber a sibling track.
          if (
            matchingRun?.id &&
            (runRef?.id === id || runRef?.kind !== "content_draft")
          ) {
            const now = new Date().toISOString();
            await (sb.from("stage_runs") as unknown as {
              update: (row: Record<string, unknown>) => {
                eq: (col: string, val: string) => Promise<unknown>;
              };
            })
              .update({
                status: "completed",
                awaiting_reason: null,
                error_message: null,
                outcome_json: {
                  draftId: id,
                  draftTitle: (row.title as string) ?? "",
                },
                payload_ref: { kind: "content_draft", id },
                finished_at: now,
                updated_at: now,
              })
              .eq("id", matchingRun.id as string);
            await inngest.send({
              name: "pipeline/stage.run.finished",
              data: { stageRunId: matchingRun.id as string, projectId },
            });
          }
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

        // Validate produced content (blog/video/shorts/podcast — not core).
        // Persona may be null on legacy drafts; validators degrade gracefully.
        let validation: ReturnType<typeof validateProducedDraft> | undefined;
        if (body.phase !== "core") {
          const updatedRow = (updated ?? row) as Record<string, unknown>;
          const persona = await loadPersonaForDraft(updatedRow, sb);
          validation = validateProducedDraft(
            updatedRow.draft_json as Parameters<
              typeof validateProducedDraft
            >[0],
            updatedRow.canonical_core_json as Parameters<
              typeof validateProducedDraft
            >[1],
            persona,
          );
        }

        return reply.send({
          data: updated ?? row,
          ...(validation ? { validation } : {}),
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
      let reviewToken: string | null = null;
      let reviewReservationDone = false;
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const sb = createServiceClient();
        const { id } = request.params as { id: string };
        const override = providerOverrideSchema.parse(request.body ?? {});
        const draft = (await loadDraft(id)) as Record<string, unknown>;
        const orgId = await getOrgId(request.userId);

        const creditSettings = await loadPlatformSettings(sb);
        const REVIEW_COST = creditSettings.costReview;

        if (draft.status !== "in_review") {
          throw new ApiError(
            400,
            "Draft must be in_review status. Use PATCH to set status first.",
            "INVALID_STATUS",
          );
        }

        await assertWithinReviewCap(
          (draft.project_id as string | null | undefined) ?? null,
          (draft.iteration_count as number | null | undefined) ?? 0,
        );

        // Manual provider short-circuits the LLM call: build the prompt
        // synchronously, emit the full payload to Axiom, persist the draft in
        // awaiting_manual state, and return early. The user pastes the output
        // produced externally via POST /:id/manual-review-output.
        if (override.provider === "manual") {
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
                const { data } = await (createServiceClient() as any)
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
            channel: channelData as
              | {
                  name?: string;
                  niche?: string;
                  language?: string;
                  tone?: string;
                }
              | undefined,
          });

          // Update draft to awaiting_manual status
          const { data: manualDraft, error: manualInsertErr } = await (
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
            .update({ status: "awaiting_manual" })
            .eq("id", id)
            .select()
            .single();
          if (manualInsertErr || !manualDraft) {
            throw (
              manualInsertErr ??
              new ApiError(500, "Failed to update draft", "DB_ERROR")
            );
          }

          // Combine system + user message so the operator can copy ONE prompt
          // from Axiom and paste it into ChatGPT/Claude without reassembling.
          const combinedPrompt = systemPrompt
            ? `${systemPrompt}\n\n${userMessage}`
            : userMessage;

          logAiUsage({
            userId: request.userId,
            orgId,
            action: "manual.awaiting",
            provider: "manual",
            model: "manual",
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            durationMs: 0,
            status: "awaiting_manual",
            metadata: {
              draftId: id,
              stage: "review",
              channelId: (draft.channel_id as string) ?? null,
              prompt: combinedPrompt,
              input: { type: draft.type, title: draft.title },
            },
          });

          return reply.status(202).send({
            data: { draftId: id, status: "awaiting_manual" },
            error: null,
          });
        }

        // Reserve credits upfront; commit on success, release on error.
        reviewToken = await reserve(orgId, request.userId, REVIEW_COST);

        // Emit progress events so the SSE-driven modal in ReviewEngine has
        // something to render during this synchronous review run.
        await emitJobEvent(id, "production", "queued", "Iniciando review…");

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

        await emitJobEvent(id, "production", "loading_prompt", "Carregando agente de review…");
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
              const { data } = await (createServiceClient() as any)
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
            channel: channelData as
              | {
                  name?: string;
                  niche?: string;
                  language?: string;
                  tone?: string;
                }
              | undefined,
          });

          await emitJobEvent(
            id,
            "production",
            "calling_provider",
            `Revisando com ${override.provider ?? "AI"}${override.model ? ` (${override.model})` : ""}…`,
            { stage: "review", provider: override.provider, model: override.model },
          );

          const response = await generateWithFallback(
            "review",
            (draft.model_tier as string) ?? "standard",
            {
              agentType: "review",
              systemPrompt: systemPrompt ?? "",
              userMessage,
            },
            {
              logContext: {
                userId: request.userId!,
                orgId,
                projectId: (draft.project_id as string) ?? undefined,
                channelId: (draft.channel_id as string) ?? undefined,
                sessionId: id,
                sessionType: "review",
              },
            },
          );
          result = response.result as Record<string, unknown>;
        } catch (agentError) {
          await emitJobEvent(
            id,
            "production",
            "failed",
            (agentError as Error)?.message?.slice(0, 200) ?? "Review falhou",
          );
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

        // Extract verdict and score from agent response.
        //
        // Score derivation: if a rubric is defined for this content type
        // (currently blog), the server computes score deterministically from
        // rubric_evaluation (Σ weight over passing criteria). This replaces
        // the LLM's opinionated 0-100 number, which was unreliable — the
        // model would settle on round numbers like 60 regardless of actual
        // quality. When no rubric exists for the type, fall back to the
        // legacy LLM score or the quality_tier mapping.
        const overallVerdictRaw =
          (result.overall_verdict as string) ?? "revision_required";
        const draftType = draft.type as string;
        const formatReview = result[`${draftType}_review`] as
          | Record<string, unknown>
          | undefined;
        const tier = deriveTier(formatReview);
        const legacyScoreMap: Record<string, number> = {
          excellent: 95,
          good: 82,
          needs_revision: 60,
          reject: 20,
          not_requested: 0,
        };

        const rubric = getRubricForType(draftType);
        let reviewScore: number | null;
        let computedFromRubric: ReturnType<typeof computeRubricScore> | null = null;
        if (rubric) {
          const rubricEval = extractRubricEvaluation(result, draftType);
          computedFromRubric = computeRubricScore(rubric, rubricEval);
          reviewScore = computedFromRubric.score;
        } else {
          const rawScore = (formatReview?.score as number | undefined) ?? null;
          reviewScore =
            rawScore !== null ? rawScore : (legacyScoreMap[tier] ?? null);
        }

        // Verdict: if we computed from rubric, the score determines verdict
        // (90+ = approved). Otherwise honor the model's overall_verdict.
        const overallVerdict = computedFromRubric
          ? deriveVerdictFromScore(
              computedFromRubric.score,
              computedFromRubric.maxScore,
            )
          : overallVerdictRaw;
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
          draft_json: draft.draft_json,
        });

        // Commit credits on successful agent call
        await commit(reviewToken, REVIEW_COST, "review", "text", {
          draftId: id,
          type: draftType,
          iteration: iterationCount,
        });
        reviewReservationDone = true;

        await emitJobEvent(
          id,
          "production",
          "completed",
          `Review concluída — ${tier}`,
          { tier, score: reviewScore, verdict: newVerdict, iterationCount },
        );

        return reply.send({
          data: { draft: updated, review: result },
          error: null,
        });
      } catch (error) {
        if (!reviewReservationDone && reviewToken !== null) {
          await release(reviewToken).catch(() => { /* best-effort */ });
        }
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
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const body = z
          .record(z.unknown())
          .refine(
            (data) => {
              // At least one verdict field must be present
              const hasOverallVerdict =
                typeof data.overall_verdict === "string";
              const hasBlogReview =
                data.blog_review && typeof data.blog_review === "object";
              const hasVideoReview =
                data.video_review && typeof data.video_review === "object";
              const hasShortsReview =
                data.shorts_review && typeof data.shorts_review === "object";
              const hasPodcastReview =
                data.podcast_review && typeof data.podcast_review === "object";
              return (
                hasOverallVerdict ||
                hasBlogReview ||
                hasVideoReview ||
                hasShortsReview ||
                hasPodcastReview
              );
            },
            {
              message:
                "Review output must contain verdict and/or format-specific review data",
            },
          )
          .parse(request.body);

        const sb = createServiceClient();

        const { data: draft, error: fetchErr } = await sb
          .from("content_drafts")
          .select(
            "id, status, channel_id, project_id, org_id, user_id, type, title, iteration_count, draft_json",
          )
          .eq("id", id)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!draft) throw new ApiError(404, "Draft not found", "NOT_FOUND");
        const row = draft as Record<string, unknown>;
        if (row.user_id !== request.userId)
          throw new ApiError(403, "Forbidden", "FORBIDDEN");
        if (row.status !== "awaiting_manual") {
          throw new ApiError(
            409,
            `Draft is not awaiting manual review (status=${row.status})`,
            "CONFLICT",
          );
        }

        await assertWithinReviewCap(
          (row.project_id as string | null | undefined) ?? null,
          (row.iteration_count as number | null | undefined) ?? 0,
        );

        // Extract verdict and score from the review output, matching AI review logic
        const draftType = row.type as string;
        const formatReview = body[
          `${draftType}_review` as keyof typeof body
        ] as Record<string, unknown> | undefined;

        const tier2 = deriveTier(formatReview);
        const legacyScoreMap2: Record<string, number> = {
          excellent: 95,
          good: 82,
          needs_revision: 60,
          reject: 20,
          not_requested: 0,
        };
        const rawScore2 =
          formatReview && typeof formatReview.score === "number"
            ? formatReview.score
            : null;
        const reviewScore: number | null =
          rawScore2 !== null ? rawScore2 : (legacyScoreMap2[tier2] ?? null);
        let reviewVerdict = "revision_required";

        const overallVerdict = body.overall_verdict
          ? String(body.overall_verdict)
          : null;
        if (formatReview && typeof formatReview.verdict === "string") {
          reviewVerdict = String(formatReview.verdict)
            .toLowerCase()
            .replace(/\s+/g, "_");
        }
        if (overallVerdict) {
          reviewVerdict = overallVerdict.toLowerCase().replace(/\s+/g, "_");
        }

        // Determine status based on verdict
        let newStatus: string;
        let approvedAt: string | null = null;

        if (
          reviewVerdict === "approved" ||
          (reviewScore !== null && reviewScore >= 90)
        ) {
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
          draft_json: (row as { draft_json?: unknown }).draft_json ?? null,
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
            stage: "review",
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
   * POST /:id/generate-asset-prompts — Run agent-5-assets to produce
   * BC_ASSETS_OUTPUT (visual_direction + slot prompt briefs).
   * Manual provider short-circuits to 202 awaiting_manual without persisting
   * DB state — the paste round-trip is handled client-side.
   */
  fastify.post(
    "/:id/generate-asset-prompts",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const override = providerOverrideSchema.parse(request.body ?? {});
        const draft = (await loadDraft(id)) as Record<string, unknown>;
        const orgId = await getOrgId(request.userId);

        const input = await buildAssetsInput(draft);

        let systemPrompt = (await loadAgentPrompt("assets")) ?? undefined;
        const channelContextStr = await buildChannelContext(
          draft.channel_id as string | null | undefined,
        );
        if (channelContextStr && systemPrompt) {
          systemPrompt = `${systemPrompt}\n\n${channelContextStr}`;
        }

        const userMessage = buildAssetsMessage(input);

        if (override.provider === "manual") {
          const combinedPrompt = systemPrompt
            ? `${systemPrompt}\n\n${userMessage}`
            : userMessage;

          logAiUsage({
            userId: request.userId,
            orgId,
            action: "manual.awaiting",
            provider: "manual",
            model: "manual",
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            durationMs: 0,
            status: "awaiting_manual",
            metadata: {
              draftId: id,
              stage: "assets",
              channelId: (draft.channel_id as string) ?? null,
              prompt: combinedPrompt,
              input,
            },
          });

          return reply.status(202).send({
            data: {
              draftId: id,
              status: "awaiting_manual",
              prompt: combinedPrompt,
            },
            error: null,
          });
        }

        const { result } = await generateWithFallback(
          "assets",
          (draft.model_tier as string) ?? "standard",
          {
            agentType: "assets",
            systemPrompt: systemPrompt ?? "",
            userMessage,
          },
          {
            provider: override.provider,
            model: override.model,
            logContext: {
              userId: request.userId!,
              orgId,
              channelId: (draft.channel_id as string) ?? undefined,
              sessionId: id,
              sessionType: "assets",
            },
          },
        );

        return reply.send({ data: result, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * PUT /:id/asset-briefs — Persist the visual_direction + slot prompt briefs
   * produced by agent-5-assets (or pasted manually) into draft_json.asset_briefs
   * so the AssetsEngine can rehydrate them across reloads, enabling a user to
   * return to the Refine phase after the page is closed.
   */
  fastify.put(
    "/:id/asset-briefs",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };

        const slotSchema = z.object({
          slot: z.string(),
          sectionTitle: z.string().default(""),
          promptBrief: z.string().default(""),
          styleRationale: z.string().default(""),
          aspectRatio: z.string().default("16:9"),
          altText: z.string().default(""),
        });
        const visualSchema = z.object({
          style: z.string().default(""),
          colorPalette: z.array(z.string()).default([]),
          mood: z.string().default(""),
          constraints: z.array(z.string()).default([]),
        }).nullable();
        const body = z
          .object({
            visualDirection: visualSchema.optional(),
            slots: z.array(slotSchema),
          })
          .parse(request.body ?? {});

        const draft = (await loadDraft(id)) as Record<string, unknown>;
        const sb = createServiceClient();
        const existing = (draft.draft_json ?? {}) as Record<string, unknown>;
        const newDraftJson = {
          ...existing,
          asset_briefs: {
            visualDirection: body.visualDirection ?? null,
            slots: body.slots,
            updated_at: new Date().toISOString(),
          },
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
          data: { saved: true, slotCount: body.slots.length },
          error: null,
        });
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
      let reviseToken: string | null = null;
      let reviseReservationDone = false;
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

        await assertWithinReviewCap(
          (draft.project_id as string | null | undefined) ?? null,
          (draft.iteration_count as number | null | undefined) ?? 0,
        );

        const creditSettings = await loadPlatformSettings(sb);

        const type = (draft.type as string) ?? "blog";
        const cost = calculateDraftCost(type, creditSettings);
        // Reserve credits upfront; commit on success, release on error.
        reviseToken = await reserve(orgId, request.userId, cost);

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

        // Load channel, persona (layered), idea, prior review attempts
        const reviewFeedbackRaw = draft.review_feedback_json as Record<string, unknown>;

        const channelData = draft.channel_id
          ? await (async () => {
              const { data } = await (createServiceClient() as any)
                .from("channels")
                .select(STAGE_CHANNEL_SELECT)
                .eq("id", draft.channel_id as string)
                .maybeSingle();
              return data;
            })()
          : null;

        const persona = await loadPersonaForDraft(draft as Record<string, unknown>, sb);
        const layeredPersona = persona ? await buildLayeredPersonaContext(persona, sb) : null;

        // Full normalization: issues.critical objects, rubric_checks, rubricEvaluation
        const normalizedFeedback = normalizeReviewFeedback({
          raw: reviewFeedbackRaw,
          type: type as string,
          reviewScore: (draft.review_score as number | null) ?? null,
        });

        const iterationCount = ((draft.iteration_count as number) ?? 0) + 1;

        // Mirror reviewer's priorAttempts memory on the producer side
        const priorAttempts = normalizedFeedback
          ? await loadPriorReviewAttempts(sb, id, type as string, { skipLatest: true })
          : [];

        const reproduceCtx = {
          draft: draft as Record<string, unknown>,
          persona,
          layeredPersona,
          channel: channelData as Record<string, unknown> | null,
          idea: draft.idea_id ? await loadIdeaContext(draft.idea_id as string) : null,
          researchCards: null,
        };
        const userMessage = buildStageUserMessage({
          stage: 'reproduce',
          ctx: reproduceCtx,
          reviewFeedback: normalizedFeedback ?? {
            overall_verdict: (reviewFeedbackRaw.overall_verdict as string | undefined),
            score: null,
            critical_issues: [],
            minor_issues: [],
            strengths: [],
          },
          iterationCount,
          priorAttempts,
        });

        const { result } = await generateWithFallback(
          "production",
          (draft.model_tier as string) ?? "standard",
          {
            agentType: "production",
            systemPrompt: buildStageSystemPrompt(systemPrompt, layeredPersona?.constraints ?? []),
            userMessage,
          },
          {
            logContext: {
              userId: request.userId!,
              orgId,
              projectId: (draft.project_id as string) ?? undefined,
              channelId: (draft.channel_id as string) ?? undefined,
              sessionId: id,
              sessionType: "production",
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
            draft_json: result,
            status: "draft",
            review_verdict: "pending",
            iteration_count: iterationCount,
          })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;

        await commit(reviseToken, cost, `reproduce-${type}`, "text", {
          draftId: id,
          type,
          iteration: iterationCount,
        });
        reviseReservationDone = true;

        return reply.send({ data: updated, error: null });
      } catch (error) {
        if (!reviseReservationDone && reviseToken !== null) {
          await release(reviseToken).catch(() => { /* best-effort */ });
        }
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

  /**
   * POST /:id/derive-shorts — spawn a new shorts draft from a video draft (G7).
   * Reuses the source video's canonical core + chapter signals to seed the
   * shorts pipeline so the user doesn't burn another canonical-core LLM call.
   * The new content_drafts row carries production_params.source_content_draft_id
   * so the eventual shorts_drafts insert can populate the FK column added in
   * supabase/migrations/20260508130000_shorts_drafts_source_video.sql.
   */
  fastify.post(
    "/:id/derive-shorts",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const sb = createServiceClient();
        const source = (await loadDraft(id)) as Record<string, unknown>;

        if (source.user_id && source.user_id !== request.userId) {
          throw new ApiError(403, "Forbidden", "FORBIDDEN");
        }
        if (source.type !== "video") {
          throw new ApiError(
            422,
            `Source draft must be type=video (got "${source.type}").`,
            "BAD_SOURCE_TYPE",
          );
        }

        const draftJson = source.draft_json as Record<string, unknown> | null;
        const canonicalCoreJson = source.canonical_core_json as Record<string, unknown> | null;
        if (!draftJson || Object.keys(draftJson).length === 0) {
          throw new ApiError(
            422,
            "Source video has no produced output (draft_json is empty).",
            "NO_VIDEO_OUTPUT",
          );
        }
        if (!canonicalCoreJson || Object.keys(canonicalCoreJson).length === 0) {
          throw new ApiError(
            422,
            "Source video is missing its canonical core.",
            "NO_CANONICAL_CORE",
          );
        }

        // Unwrap legacy wrappers before passing to the mapper, mirroring what
        // VideoDraftViewer does so the same drafts work in either path.
        const inner =
          (draftJson.video_script as Record<string, unknown> | undefined) ??
          (draftJson.video as Record<string, unknown> | undefined) ??
          draftJson;
        const shortsInput = mapVideoOutputToShortsInput(
          inner as unknown as VideoOutput,
          canonicalCoreJson as unknown as CanonicalCore,
        );

        const sourceTitle = (source.title as string) ?? "Untitled video";
        const inheritedParams =
          (source.production_params as Record<string, unknown> | null | undefined) ?? {};
        const newProductionParams: Record<string, unknown> = {
          ...inheritedParams,
          source_content_draft_id: id,
        };

        const { data: created, error: insertErr } = await (
          sb.from("content_drafts") as unknown as {
            insert: (row: Record<string, unknown>) => {
              select: (cols: string) => {
                single: () => Promise<{ data: unknown; error: unknown }>;
              };
            };
          }
        )
          .insert({
            channel_id: (source.channel_id as string | null) ?? null,
            idea_id: (source.idea_id as string | null) ?? null,
            research_session_id: (source.research_session_id as string | null) ?? null,
            project_id: (source.project_id as string | null) ?? null,
            persona_id: (source.persona_id as string | null) ?? null,
            user_id: source.user_id as string | null,
            org_id: source.org_id as string | null,
            type: "shorts",
            title: `Shorts from: ${sourceTitle}`,
            canonical_core_json: shortsInput,
            production_params: newProductionParams,
            status: "draft",
          })
          .select("id, type, title, project_id, channel_id")
          .single();

        if (insertErr) throw insertErr;

        return reply.send({
          data: {
            draft: created,
            shortsInput,
            sourceContentDraftId: id,
          },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:id/derive — derive a per-track draft from a canonical/source draft.
   * Copies canonical_core_json + identity fields, sets type/track_id, and is idempotent
   * per (project_id, track_id). Used by ProductionEngine when a track first runs.
   */
  fastify.post(
    "/:id/derive",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const body = deriveDraftRequestSchema.parse(request.body ?? {});

        const sb = createServiceClient();
        const result = await deriveDraft(sb, {
          sourceId: id,
          trackId: body.trackId,
          medium: body.medium,
          userId: request.userId,
        });

        return reply.send({ data: result, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:id/synthesize — generate TTS audio from the draft's teleprompter_script.
   * Channel voice settings act as defaults; body params override per-call.
   * Long scripts are chunked at sentence boundaries and concatenated client-side
   * (mp3 frames are independently decodable, so a raw concat is acceptable).
   */
  fastify.post(
    "/:id/synthesize",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const body = synthesizeDraftSchema.parse(request.body ?? {});

        const sb = createServiceClient();
        const draft = (await loadDraft(id)) as Record<string, unknown>;

        // Ownership: content_drafts.user_id is the authoritative scope.
        if (draft.user_id && draft.user_id !== request.userId) {
          throw new ApiError(403, "Forbidden", "FORBIDDEN");
        }

        const draftJson = (draft.draft_json ?? {}) as Record<string, unknown>;
        // Unwrap legacy shapes (video_script / video) before reading the script.
        const inner =
          (draftJson.video_script as Record<string, unknown> | undefined) ??
          (draftJson.video as Record<string, unknown> | undefined) ??
          draftJson;
        const teleprompter =
          typeof inner.teleprompter_script === "string"
            ? inner.teleprompter_script
            : typeof draftJson.teleprompter_script === "string"
              ? (draftJson.teleprompter_script as string)
              : "";
        if (!teleprompter.trim()) {
          throw new ApiError(
            422,
            "Draft has no teleprompter_script. Produce or paste a video draft first.",
            "NO_TELEPROMPTER",
          );
        }

        // Channel defaults
        let channelDefaults: {
          voice_id?: string | null;
          voice_provider?: string | null;
          voice_speed?: number | null;
        } = {};
        if (draft.channel_id) {
          const { data: ch } = await sb
            .from("channels")
            .select("voice_id, voice_provider, voice_speed")
            .eq("id", draft.channel_id as string)
            .maybeSingle();
          if (ch) channelDefaults = ch as typeof channelDefaults;
        }

        const voiceId = body.voiceId ?? channelDefaults.voice_id ?? null;
        if (!voiceId) {
          throw new ApiError(
            422,
            "No voiceId provided and the channel has no default voice. Set channel.voice_id or pass voiceId in the body.",
            "NO_VOICE_ID",
          );
        }
        const providerName =
          body.provider ?? (channelDefaults.voice_provider as "elevenlabs" | "openai" | null) ?? "elevenlabs";
        const speed =
          body.speed ?? (typeof channelDefaults.voice_speed === "number" ? channelDefaults.voice_speed : undefined);

        const provider = getVoiceProvider(providerName);
        if (!provider) {
          throw new ApiError(
            500,
            `Voice provider "${providerName}" is not configured. Set ELEVENLABS_API_KEY or OPENAI_API_KEY in apps/api/.env.local.`,
            "CONFIG_ERROR",
          );
        }

        const chunks = chunkTeleprompter(teleprompter);
        const results = [] as Array<{
          audio: Buffer;
          mimeType: string;
          estimatedSeconds: number;
          providerName: string;
          voiceId: string;
        }>;
        for (const chunk of chunks) {
          const r = await provider.synthesize({
            text: chunk,
            voiceId,
            speed,
            format: body.format,
            style: body.style,
          });
          results.push(r);
        }

        const combined = Buffer.concat(results.map((r) => r.audio));
        const totalSeconds = results.reduce(
          (acc, r) => acc + (r.estimatedSeconds || 0),
          0,
        );

        return reply.send({
          data: {
            audioBase64: combined.toString("base64"),
            mimeType: results[0]?.mimeType ?? "audio/mpeg",
            estimatedSeconds: totalSeconds,
            provider: results[0]?.providerName ?? providerName,
            voiceId,
            characterCount: teleprompter.length,
            chunkCount: chunks.length,
          },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * GET /:id/iterations — list every review pass for a draft so the user
   * can compare scores and pick the best (draft, review) pair when the
   * autopilot loop finished without ever clearing the auto-approve
   * threshold. Returns rows ordered by iteration ASC.
   */
  fastify.get(
    "/:id/iterations",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const sb = createServiceClient();
        const { id } = request.params as { id: string };

        const draft = (await loadDraft(id)) as Record<string, unknown>;
        if (draft.user_id !== request.userId) {
          throw new ApiError(403, "Forbidden", "FORBIDDEN");
        }

        const { data: rows, error } = await (
          sb.from("review_iterations" as never) as unknown as {
            select: (cols: string) => {
              eq: (col: string, val: string) => {
                order: (
                  col: string,
                  opts: { ascending: boolean },
                ) => Promise<{ data: unknown[] | null; error: unknown }>;
              };
            };
          }
        )
          .select(
            "id, iteration, score, verdict, feedback_json, draft_json, created_at",
          )
          .eq("draft_id", id)
          .order("iteration", { ascending: true });
        if (error) throw error;

        return reply.send({
          data: {
            draftId: id,
            currentIterationCount:
              (draft.iteration_count as number | null) ?? 0,
            currentReviewScore:
              (draft.review_score as number | null) ?? null,
            currentReviewVerdict:
              (draft.review_verdict as string | null) ?? null,
            iterations: (rows ?? []).map((r) => ({
              id: (r as { id: string }).id,
              iteration: (r as { iteration: number }).iteration,
              score: (r as { score: number | null }).score,
              verdict: (r as { verdict: string | null }).verdict,
              feedbackJson: (r as { feedback_json: unknown }).feedback_json,
              draftJson: (r as { draft_json: unknown }).draft_json,
              createdAt: (r as { created_at: string }).created_at,
            })),
          },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:id/iterations/:iteration/promote — pick iteration N as the
   * "winner". Copies its draft_json + review fields back onto the live
   * content_drafts row and flips status/verdict to approved. Used when the
   * autopilot loop finished without crossing the auto-approve threshold and
   * the user wants to lock in the best-scoring pass to move downstream.
   */
  fastify.post(
    "/:id/iterations/:iteration/promote",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const sb = createServiceClient();
        const { id, iteration } = request.params as {
          id: string;
          iteration: string;
        };
        const iterationNo = Number.parseInt(iteration, 10);
        if (!Number.isFinite(iterationNo) || iterationNo < 1) {
          throw new ApiError(
            400,
            "iteration must be a positive integer",
            "INVALID_ITERATION",
          );
        }

        const draft = (await loadDraft(id)) as Record<string, unknown>;
        if (draft.user_id !== request.userId) {
          throw new ApiError(403, "Forbidden", "FORBIDDEN");
        }

        const { data: row, error: fetchErr } = await (
          sb.from("review_iterations" as never) as unknown as {
            select: (cols: string) => {
              eq: (col: string, val: string) => {
                eq: (col: string, val: number) => {
                  maybeSingle: () => Promise<{
                    data: Record<string, unknown> | null;
                    error: unknown;
                  }>;
                };
              };
            };
          }
        )
          .select("iteration, score, verdict, feedback_json, draft_json")
          .eq("draft_id", id)
          .eq("iteration", iterationNo)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!row) {
          throw new ApiError(
            404,
            `Iteration ${iterationNo} not found for draft ${id}`,
            "NOT_FOUND",
          );
        }
        if (!(row as { draft_json: unknown }).draft_json) {
          throw new ApiError(
            409,
            "This iteration predates draft snapshots and can't be promoted.",
            "NO_SNAPSHOT",
          );
        }

        const approvedAt = new Date().toISOString();
        const { data: updated, error } = await (
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
          .update({
            draft_json: row.draft_json,
            review_feedback_json: row.feedback_json,
            review_score: row.score as number | null,
            review_verdict: "approved",
            status: "approved",
            approved_at: approvedAt,
          })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;

        return reply.send({ data: updated, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
