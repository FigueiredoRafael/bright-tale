'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, ArrowRight, Check, Upload, Image as ImageIcon,
  Sparkles, FolderOpen, Palette, Trash2, Link2, ChevronDown, ChevronUp, Copy,
  ClipboardPaste, SkipForward,
} from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ManualOutputDialog } from './ManualOutputDialog';
import { ModelPicker, MODELS_BY_PROVIDER, type ProviderId } from '@/components/ai/ModelPicker';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { useSelector } from '@xstate/react';
import { usePipelineActor } from '@/hooks/usePipelineActor';
import { useAutoPilotTrigger } from '@/hooks/use-auto-pilot-trigger';
import { usePipelineAbort } from '@/components/pipeline/PipelineAbortProvider';
import { ContextBanner } from './ContextBanner';
import { ImportPicker } from './ImportPicker';
import { getPersonaTheme } from './utils/personaTheme';
import type { AssetsResult, PipelineContext, PipelineStage } from './types';

/* ── Types ── */

// Stepper phases. 'images' is the AI generation step (kept verbatim so
// the autopilot wiring's `phase === 'images'` checks stay valid).
// 'approve' is the new final step where the user reviews / overrides
// generated images before clicking Finish & Save.
type AssetPhase = 'briefs' | 'refine' | 'images' | 'approve';
type ImagesMode = 'brief' | 'no-briefs';

interface SlotCard {
  slot: string;
  sectionTitle: string;
  promptBrief: string;
  styleRationale: string;
  aspectRatio: string;
  altText: string;
}

interface VisualDirection {
  style: string;
  colorPalette: string[];
  mood: string;
  constraints: string[];
}

interface UploadedAsset {
  id: string;
  slot: string;
  url: string;
  webpUrl: string | null;
  role: string;
  altText: string;
}

interface ContentAsset {
  id: string;
  url: string;
  webpUrl: string | null;
  role: string | null;
  altText: string | null;
  sourceType: string;
}

/**
 * Non-null invariant for `draft` — orchestrator gates render until draft is hydrated.
 * Guard in the engine is defensive, not normal flow.
 */
interface AssetsEngineProps {
  mode?: 'generate' | 'import';
  onModeChange?: (m: 'generate' | 'import') => void;
  draft: Record<string, unknown> | null;
  /** Override the provider selected in assetsConfig — set by orchestrator on "Switch provider". */
  imageProviderOverride?: ImageProvider;
  /** Bumped by orchestrator to re-arm autopilot after a quota error recovery. */
  retrySignal?: number;
}

interface NoBriefSection {
  slot: string;
  sectionTitle: string;
  keyPoints: string[];
  body: string;
}

/* ── Constants ── */

const ASSETS_PROVIDERS: ProviderId[] = ['gemini', 'openai', 'manual'];
type ImageProvider = 'gemini' | 'openai' | 'manual';
const IMAGE_PROVIDERS: { id: ImageProvider; label: string; hint: string }[] = [
  { id: 'gemini', label: 'Nano-banana (Gemini)', hint: 'Runs the image model directly.' },
  { id: 'openai', label: 'GPT Image (OpenAI)', hint: 'Uses gpt-image-1 via the OpenAI API.' },
  { id: 'manual', label: 'Manual (Axiom)', hint: 'Emits the prompt to Axiom; upload the resulting image when ready.' },
];

/* ── Helpers ── */

function slotToRole(slot: string): string {
  if (slot === 'featured') return 'featured_image';
  return `body_${slot}`;
}

function roleToSlot(role: string | null): string | null {
  if (!role) return null;
  if (role === 'featured_image') return 'featured';
  if (role.startsWith('body_')) return role.slice(5);
  return null;
}

function findSlotsArray(obj: unknown): Array<Record<string, unknown>> | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  // Direct slots key
  if (Array.isArray(o.slots) && o.slots.length > 0) return o.slots as Array<Record<string, unknown>>;
  // Recurse into BC_ASSETS_OUTPUT wrapper
  if (o.BC_ASSETS_OUTPUT) return findSlotsArray(o.BC_ASSETS_OUTPUT);
  // Recurse into any object values
  for (const val of Object.values(o)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = findSlotsArray(val);
      if (found) return found;
    }
  }
  return null;
}

function findVisualDirection(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (o.visual_direction && typeof o.visual_direction === 'object') return o.visual_direction as Record<string, unknown>;
  if (o.BC_ASSETS_OUTPUT) return findVisualDirection(o.BC_ASSETS_OUTPUT);
  for (const val of Object.values(o)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = findVisualDirection(val);
      if (found) return found;
    }
  }
  return null;
}

function parseAssetsOutput(raw: unknown): { visual: VisualDirection; slots: SlotCard[] } | null {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const slotsRaw = findSlotsArray(obj);
    if (!slotsRaw || slotsRaw.length === 0) return null;

    const vd = findVisualDirection(obj);
    const visual: VisualDirection = {
      style: (vd?.style as string) ?? '',
      colorPalette: Array.isArray(vd?.color_palette) ? (vd.color_palette as string[]) : [],
      mood: (vd?.mood as string) ?? '',
      constraints: Array.isArray(vd?.constraints) ? (vd.constraints as string[]) : [],
    };

    const slots: SlotCard[] = slotsRaw.map((s) => ({
      slot: (s.slot as string) ?? '',
      sectionTitle: (s.section_title as string) ?? (s.sectionTitle as string) ?? '',
      promptBrief: (s.prompt_brief as string) ?? (s.promptBrief as string) ?? (s.prompt as string) ?? '',
      styleRationale: (s.style_rationale as string) ?? (s.styleRationale as string) ?? '',
      aspectRatio: (s.aspect_ratio as string) ?? (s.aspectRatio as string) ?? '16:9',
      altText: (s.alt_text as string) ?? (s.altText as string) ?? '',
    }));

    return { visual, slots };
  } catch {
    return null;
  }
}

function buildFullPrompt(card: SlotCard, visual: VisualDirection | null): string {
  const lines: string[] = [];
  lines.push(card.promptBrief);
  if (visual) {
    if (visual.style) lines.push(`Style: ${visual.style}`);
    if (visual.mood) lines.push(`Mood: ${visual.mood}`);
    if (visual.colorPalette.length > 0) lines.push(`Color palette: ${visual.colorPalette.join(', ')}`);
    if (visual.constraints.length > 0) lines.push(`Constraints: ${visual.constraints.join('. ')}`);
  }
  lines.push(`Aspect ratio: ${card.aspectRatio}`);
  return lines.join('\n');
}

interface PendingUpload {
  slot: string;
  preview: string;       // blob URL or original URL for display
  file?: File;           // set for file uploads
  sourceUrl?: string;    // set for URL uploads
}

/* ── Component ── */

export function AssetsEngine({ mode: engineMode, onModeChange, draft, imageProviderOverride, retrySignal = 0 }: AssetsEngineProps) {
  const actor = usePipelineActor();
  const abortController = usePipelineAbort();
  const channelId = useSelector(actor, (s) => s.context.channelId);
  const projectId = useSelector(actor, (s) => s.context.projectId);
  const brainstormResult = useSelector(actor, (s) => s.context.stageResults.brainstorm);
  const researchResult = useSelector(actor, (s) => s.context.stageResults.research);
  const draftResult = useSelector(actor, (s) => s.context.stageResults.draft);
  const draftId = draftResult?.draftId;
  const draftStatus = draft?.status as string | undefined;

  const trackerContext: PipelineContext = {
    channelId: channelId ?? undefined,
    projectId,
    ideaId: brainstormResult?.ideaId,
    ideaTitle: brainstormResult?.ideaTitle,
    ideaVerdict: brainstormResult?.ideaVerdict,
    ideaCoreTension: brainstormResult?.ideaCoreTension,
    brainstormSessionId: brainstormResult?.brainstormSessionId,
    researchSessionId: researchResult?.researchSessionId,
    approvedCardsCount: researchResult?.approvedCardsCount,
    researchLevel: researchResult?.researchLevel,
    researchPrimaryKeyword: researchResult?.primaryKeyword,
    researchSecondaryKeywords: researchResult?.secondaryKeywords,
    researchSearchIntent: researchResult?.searchIntent,
    draftId: draftResult?.draftId,
    draftTitle: draftResult?.draftTitle,
    personaId: draftResult?.personaId,
    personaName: draftResult?.personaName,
    personaSlug: draftResult?.personaSlug,
    personaWpAuthorId: draftResult?.personaWpAuthorId,
  };

  function navigate(toStage?: PipelineStage) {
    actor.send({ type: 'NAVIGATE', toStage: toStage ?? 'review' });
  }

  // Sync-init from the draft prop so re-entry from a later stage lands
  // immediately on the right phase instead of flashing Briefs while the
  // async fetchAssets effect resolves. Best-effort: if draft is missing
  // or has no asset_briefs, we fall through to Briefs and let the effect
  // promote later.
  const initialBriefs = (
    (draft?.draft_json as { asset_briefs?: { visualDirection?: VisualDirection | null; slots?: SlotCard[] } } | undefined)
      ?.asset_briefs
  );
  const [phase, setPhase] = useState<AssetPhase>(() =>
    (initialBriefs?.slots && initialBriefs.slots.length > 0) ? 'approve' : 'briefs',
  );
  const [imagesMode, setImagesMode] = useState<ImagesMode>('brief');
  const [visualDirection, setVisualDirection] = useState<VisualDirection | null>(
    () => initialBriefs?.visualDirection ?? null,
  );
  const [slotCards, setSlotCards] = useState<SlotCard[]>(
    () => initialBriefs?.slots ?? [],
  );
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [existingAssets, setExistingAssets] = useState<ContentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [generatingSlot, setGeneratingSlot] = useState<string | null>(null);
  const [slotAssets, setSlotAssets] = useState<Record<string, ContentAsset>>({});
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [model, setModel] = useState<string>(MODELS_BY_PROVIDER.gemini[0].id);
  const [generatingBriefs, setGeneratingBriefs] = useState(false);
  const [manualBriefsOpen, setManualBriefsOpen] = useState(false);
  const [noBriefSections, setNoBriefSections] = useState<NoBriefSection[]>([]);
  const [imageProvider, setImageProvider] = useState<ImageProvider>('gemini');
  const [generatingAll, setGeneratingAll] = useState(false);
  const inFlightRef = useRef(false);
  const tracker = usePipelineTracker('assets', trackerContext);

  // ── Auto-pilot wiring ────────────────────────────────────────────
  // Drives the engine after the user confirms the assets dialog in
  // PipelineOrchestrator (engineMode flips to 'generate' on confirm).
  // Path A — generate fresh: briefs → auto-skip refine → generate-all →
  //   handleFinish dispatches ASSETS_COMPLETE.
  // Path B — existing assets already present: handleFinish dispatches
  //   immediately with the existing IDs.
  const autoMode = useSelector(actor, (s) => s.context.mode);
  const autoPaused = useSelector(actor, (s) => s.context.paused);
  const assetsResult = useSelector(actor, (s) => s.context.stageResults.assets);
  // STAGE_PROGRESS partial updates also populate stageResults.assets (e.g. { status: 'Generating images' }).
  // Only treat the stage as complete when the real AssetsResult with `assetIds` has been dispatched.
  const assetsComplete = assetsResult != null && 'assetIds' in Object(assetsResult);
  // A persisted errorCode (e.g. 'QUOTA_EXCEEDED') also blocks autopilot — prevents re-dispatch on reload.
  // The user must explicitly choose to skip or retry with a different provider.
  const assetsErrored = assetsResult != null && !assetsComplete && !!(assetsResult as { errorCode?: string }).errorCode;
  const assetsBlocked = assetsComplete || assetsErrored;
  const assetsConfig = useSelector(actor, (s) => s.context.autopilotConfig?.assets);
  const autopilotConfig = useSelector(actor, (s) => s.context.autopilotConfig);
  const overviewMode = useSelector(actor, (s) => s.context.mode === 'overview');
  const isGeneratingBriefs = useSelector(actor, (s) => s.matches({ assets: 'generatingBriefs' }));
  const isRefining = useSelector(actor, (s) => s.matches({ assets: 'refining' }));
  const isGeneratingImages = useSelector(actor, (s) => s.matches({ assets: 'generatingImages' }));

  // Seed provider/model from autopilot wizard config when an override is present.
  // Only fires when providerOverride is non-null to avoid clobbering the user's
  // manual selection on subsequent renders.
  const assetsProviderOverride = autopilotConfig?.assets?.providerOverride ?? null;
  useEffect(() => {
    if (!assetsProviderOverride) return;
    setProvider(assetsProviderOverride as ProviderId);
    const modelOverride = autopilotConfig?.assets?.modelOverride ?? null;
    const resolvedModel = modelOverride ?? MODELS_BY_PROVIDER[assetsProviderOverride as ProviderId]?.[0]?.id;
    if (resolvedModel) setModel(resolvedModel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsProviderOverride]);

  // ── 3-mode gate ─────────────────────────────────────────────────
  // On mount, react to autopilotConfig.assets.mode:
  //   'briefs_only'  → emit ASSETS_GATE_TRIGGERED; orchestrator drills user in
  //   'auto_generate' → falls through to useAutoPilotTrigger below (no gate needed)
  //   'skip'          → machine never mounts this engine (assets.idle always-guard fires)
  const gateRef = useRef(false);
  useEffect(() => {
    if (gateRef.current) return;
    if (!overviewMode || !assetsConfig) return;
    gateRef.current = true;
    if (assetsConfig.mode === 'briefs_only') {
      actor.send({ type: 'ASSETS_GATE_TRIGGERED' });
    }
    // 'auto_generate' falls through to useAutoPilotTrigger which fires handleGenerateBriefs()
    // 'skip' is handled by the machine (shouldSkipAssets guard on assets.idle entry)
  }, [overviewMode, assetsConfig, actor]);

  useAutoPilotTrigger({
    stage: 'assets',
    canFire: () =>
      !!draftId &&
      !loading &&
      !generatingBriefs &&
      !generatingAll &&
      !manualBriefsOpen &&
      slotCards.length === 0 &&
      existingAssets.length === 0 &&
      phase === 'briefs' &&
      engineMode === 'generate' &&
      !assetsBlocked,
    fire: handleGenerateBriefs,
  });

  useEffect(() => {
    if ((autoMode !== 'supervised' && autoMode !== 'overview') || autoPaused) return;
    if (assetsBlocked) return;
    if (assetsConfig?.mode === 'briefs_only') return;
    if (isRefining && slotCards.length > 0) {
      setImagesMode('brief');
      setPhase('images');
      actor.send({ type: 'ASSETS_IMAGES_STARTED' });
    }
  }, [autoMode, autoPaused, isRefining, slotCards.length, assetsBlocked, assetsConfig?.mode, actor]);

  const autoGenAllRef = useRef(false);
  useEffect(() => {
    if ((autoMode !== 'supervised' && autoMode !== 'overview') || autoPaused) return;
    if (assetsBlocked) return;
    if (!isGeneratingImages) return;
    if (slotCards.length === 0) return;
    if (Object.keys(slotAssets).length > 0) return;
    if (generatingAll || generatingSlot) return;
    if (autoGenAllRef.current) return;
    autoGenAllRef.current = true;
    void handleGenerateAllSlots();
  // handleGenerateAllSlots is a stable function declaration in this scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, autoPaused, isGeneratingImages, slotCards.length, slotAssets, generatingAll, generatingSlot, assetsBlocked]);

  const autoFinishRef = useRef(false);
  useEffect(() => {
    if ((autoMode !== 'supervised' && autoMode !== 'overview') || autoPaused) return;
    if (assetsBlocked) return;
    if (phase !== 'images') return;
    if (finishing) return;
    if (autoFinishRef.current) return;
    const hasGeneratedAll =
      slotCards.length > 0 && Object.keys(slotAssets).length >= slotCards.length;
    const hasExistingOnly = slotCards.length === 0 && existingAssets.length > 0;
    if (!hasGeneratedAll && !hasExistingOnly) return;
    autoFinishRef.current = true;
    void handleFinish();
  // handleFinish is a stable function declaration in this scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, autoPaused, phase, slotCards.length, slotAssets, existingAssets.length, finishing, assetsBlocked]);

  // When retrySignal is bumped by the orchestrator (user picked a new provider),
  // reset autopilot refs and clear generated images so the full flow re-runs.
  // The orchestrator also dispatches STAGE_PROGRESS to clear the errorCode before bumping,
  // which unblocks assetsBlocked on the next render cycle.
  useEffect(() => {
    if (retrySignal === 0) return;
    autoGenAllRef.current = false;
    autoFinishRef.current = false;
    setSlotAssets({});
    setSlotCards([]);
    setPhase('briefs');
  }, [retrySignal]);

  // Fetch existing assets on mount. Hydration priority:
  //   1. draft_json.asset_briefs — full briefs persisted by the engine
  //   2. existing assets + asset-prompts section titles — best-effort rebuild
  //      for legacy drafts that don't have asset_briefs yet
  //   3. nothing — start fresh
  // Either way, if assets exist we land on the Images phase but keep Refine
  // reachable (slotCards present + imagesMode='brief').
  useEffect(() => {
    async function fetchAssets() {
      try {
        const persistedBriefs = (
          (draft?.draft_json as { asset_briefs?: { visualDirection?: VisualDirection | null; slots?: SlotCard[] } } | undefined)
            ?.asset_briefs
        );

        const [assetsRes, promptsRes] = await Promise.all([
          fetch(`/api/assets?content_id=${draftId}`, { signal: abortController?.signal }),
          fetch(`/api/content-drafts/${draftId}/asset-prompts`, {
            method: 'POST',
            signal: abortController?.signal,
          }).catch(() => null),
        ]);
        const { data } = await assetsRes.json();
        const items = Array.isArray(data) ? data : (data?.assets ?? data?.items ?? []);

        if (items.length > 0) {
          const mapped = (items as Array<Record<string, unknown>>).map((a) => ({
            id: a.id as string,
            url: (a.source_url as string) ?? (a.url as string) ?? '',
            webpUrl: (a.webp_url as string) ?? null,
            role: (a.role as string) ?? null,
            altText: (a.alt_text as string) ?? null,
            sourceType: (a.source as string) ?? 'ai_generated',
          }));
          setExistingAssets(mapped);
        }

        // Path 1: prefer persisted briefs.
        if (persistedBriefs?.slots && persistedBriefs.slots.length > 0) {
          setVisualDirection(persistedBriefs.visualDirection ?? null);
          setSlotCards(persistedBriefs.slots);
          setImagesMode('brief');
          // Images already exist → land on Approve so user sees results;
          // no images yet → land on Refine to let user re-enter generation.
          setPhase(items.length > 0 ? 'approve' : 'refine');
          return;
        }

        if (items.length === 0) return;

        // Path 2: rebuild from assets + section titles.
        let titlesBySlot: Record<string, string> = {};
        if (promptsRes?.ok) {
          try {
            const promptsJson = await promptsRes.json();
            const sections = (promptsJson.data?.sections ?? []) as Array<{
              slot: string; section_title: string;
            }>;
            titlesBySlot = Object.fromEntries(
              sections.map((s) => [s.slot, s.section_title]),
            );
          } catch {
            // Title hydration is best-effort.
          }
        }

        const cards: SlotCard[] = (items as Array<Record<string, unknown>>)
          .map((a) => {
            const slot = roleToSlot((a.role as string) ?? null);
            if (!slot) return null;
            return {
              slot,
              sectionTitle: titlesBySlot[slot] ?? slot,
              promptBrief: (a.prompt as string) ?? '',
              styleRationale: '',
              aspectRatio: '16:9',
              altText: (a.alt_text as string) ?? '',
            } satisfies SlotCard;
          })
          .filter((c): c is SlotCard => c !== null);

        if (cards.length > 0) {
          setSlotCards(cards);
          setImagesMode('brief');
        } else {
          setImagesMode('no-briefs');
        }
        // Items already exist → user is reviewing, land on Approve.
        setPhase('approve');
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // No existing assets, start fresh
      } finally {
        setLoading(false);
      }
    }
    if (draftId) void fetchAssets();
    else setLoading(false);
    // `draft` is intentionally excluded — sync-init reads draft on first render
    // and the network refresh below doesn't need to refire when draft mutates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  useEffect(() => {
    async function fetchNoBriefSections() {
      if (!draftId) return;
      if (imagesMode !== 'no-briefs') return;
      if (noBriefSections.length > 0) return;
      try {
        const [promptsRes, draftRes] = await Promise.all([
          fetch(`/api/content-drafts/${draftId}/asset-prompts`, {
            method: 'POST',
            signal: abortController?.signal,
          }),
          fetch(`/api/content-drafts/${draftId}`, { signal: abortController?.signal }),
        ]);
        const promptsJson = await promptsRes.json();
        const draftJson = await draftRes.json();

        const sections = (promptsJson.data?.sections ?? []) as Array<{
          slot: string; section_title: string; key_points: string[];
        }>;

        const draftData = (draftJson.data?.draft_json ?? {}) as Record<string, unknown>;
        const blog = draftData.blog as Record<string, unknown> | undefined;
        const fullDraft = (blog?.full_draft as string | undefined)
          ?? (draftData.full_draft as string | undefined)
          ?? '';

        const { splitDraftBySections } = await import('@/lib/assets/section-splitter');
        const split = splitDraftBySections(fullDraft);

        const mapped: NoBriefSection[] = sections.map((s, i) => ({
          slot: s.slot,
          sectionTitle: s.section_title,
          keyPoints: s.key_points,
          body:
            s.slot === 'featured'
              ? split.intro
              : (split.sections[i - 1]?.body ?? ''),
        }));

        setNoBriefSections(mapped);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // non-fatal
      }
    }
    void fetchNoBriefSections();
  }, [draftId, imagesMode, noBriefSections.length, abortController?.signal]);

  /* ── Persist briefs to draft_json.asset_briefs so they survive reloads ── */
  const persistBriefs = useCallback(
    async (visual: VisualDirection | null, slots: SlotCard[]) => {
      if (!draftId || slots.length === 0) return;
      try {
        await fetch(`/api/content-drafts/${draftId}/asset-briefs`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visualDirection: visual, slots }),
          signal: abortController?.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // Persistence is best-effort; in-memory state still works for this session.
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftId],
  );

  /* ── Manual mode: import BC_ASSETS_OUTPUT ── */
  const handleManualImport = useCallback(async (parsed: unknown) => {
    const result = parseAssetsOutput(parsed);
    if (!result) {
      const keys = parsed && typeof parsed === 'object' ? Object.keys(parsed as object).join(', ') : typeof parsed;
      toast.error(`Could not find "slots" array in output. Top-level keys: ${keys}`);
      return;
    }
    setVisualDirection(result.visual);
    setSlotCards(result.slots);
    actor.send({ type: 'ASSETS_BRIEFS_COMPLETE' });
    setImagesMode('brief');
    setPhase('refine');
    void persistBriefs(result.visual, result.slots);
    if (!overviewMode) toast.success(`Imported ${result.slots.length} prompt briefs`);
  }, [persistBriefs, overviewMode, actor]);

  /* ── Generate briefs via AI or manual ── */
  async function handleGenerateBriefs() {
    if (!draftId || generatingBriefs) return;
    actor.send({ type: 'ASSETS_BRIEFS_STARTED' });
    actor.send({ type: 'STAGE_PROGRESS', stage: 'assets', partial: { status: 'Generating images' } });
    setGeneratingBriefs(true);
    try {
      const body: Record<string, unknown> = { provider };
      if (model && provider !== 'manual') body.model = model;
      const res = await fetch(`/api/content-drafts/${draftId}/generate-asset-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortController?.signal,
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error.message ?? 'Failed to generate briefs');
        return;
      }
      if (json.data?.status === 'awaiting_manual') {
        setManualBriefsOpen(true);
        return;
      }
      await handleManualImport(json.data);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      toast.error(e instanceof Error ? e.message : 'Failed to generate briefs');
    } finally {
      setGeneratingBriefs(false);
    }
  }

  function handleSkipBriefs() {
    // No briefs = no AI generation; go straight to upload-only Approve phase.
    setImagesMode('no-briefs');
    setSlotCards([]);
    setVisualDirection(null);
    setPhase('approve');
  }


  /* ── AI generate a single slot image ── */
  // Returns errorCode when the API rejects (e.g. 'QUOTA_EXCEEDED') so the caller
  // can persist the error state without re-dispatching on reload.
  async function generateSlotImage(card: SlotCard): Promise<{ errorCode?: string }> {
    const prompt = buildFullPrompt(card, visualDirection);
    if (prompt.trim().length < 10) {
      toast.error(`Prompt too short for ${card.slot}`);
      return {};
    }
    const role = slotToRole(card.slot);
    const activeProvider = imageProviderOverride ?? imageProvider;

    // Manual provider: emit prompt to Axiom, prompt the user to upload the result.
    if (activeProvider === 'manual') {
      const res = await fetch('/api/assets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          content_id: draftId,
          content_type: 'blog',
          role,
          aspectRatio: card.aspectRatio,
          numImages: 1,
          provider: 'manual',
        }),
        signal: abortController?.signal,
      });
      const json = await res.json();
      if (json?.error) {
        toast.error(json.error.message ?? 'Manual emit failed');
        return { errorCode: json.error.code as string | undefined };
      }
      tracker.trackAction('manual.awaiting', { draftId, role, slot: card.slot });
      if (!overviewMode) toast.success(`Prompt for ${card.slot} emitted to Axiom. Upload the image when ready.`);
      return {};
    }

    // AI provider: replace any existing asset for this role so the new one wins.
    const existing = existingAssets.find((a) => a.role === role);
    if (existing) {
      await fetch(`/api/assets/${existing.id}`, {
        method: 'DELETE',
        signal: abortController?.signal,
      }).catch(() => null);
    }

    const res = await fetch('/api/assets/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        content_id: draftId,
        content_type: 'blog',
        role,
        aspectRatio: card.aspectRatio,
        numImages: 1,
        provider: activeProvider,
      }),
      signal: abortController?.signal,
    });
    const json = await res.json();
    if (json?.error) {
      toast.error(json.error.message ?? `Image generation failed for ${card.slot}`);
      return { errorCode: json.error.code as string | undefined };
    }
    const asset = Array.isArray(json.data) ? json.data[0] : json.data;
    if (!asset || !asset.id) {
      toast.error(`No image returned for ${card.slot}`);
      return {};
    }
    const mapped: ContentAsset = {
      id: asset.id as string,
      url: (asset.source_url as string) ?? (asset.url as string) ?? '',
      webpUrl: (asset.webp_url as string) ?? null,
      role: (asset.role as string) ?? role,
      altText: (asset.alt_text as string) ?? (card.altText || card.sectionTitle),
      sourceType: (asset.source as string) ?? 'generated',
    };
    setSlotAssets((prev) => ({ ...prev, [card.slot]: mapped }));
    setExistingAssets((prev) => [...prev.filter((a) => a.role !== role), mapped]);
    tracker.trackAction('generated', { draftId, role, slot: card.slot });
    return {};
  }

  async function handleGenerateSlot(card: SlotCard) {
    if (generatingSlot || generatingAll) return;
    setGeneratingSlot(card.slot);
    try {
      await generateSlotImage(card);
      if ((imageProviderOverride ?? imageProvider) !== 'manual' && !overviewMode) toast.success(`Generated image for ${card.slot}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Image generation failed');
    } finally {
      setGeneratingSlot(null);
    }
  }

  async function handleGenerateAllSlots() {
    if (generatingSlot || generatingAll || slotCards.length === 0) return;
    setGeneratingAll(true);
    let quotaErrorCode: string | null = null;
    try {
      for (const card of slotCards) {
        setGeneratingSlot(card.slot);
        const result = await generateSlotImage(card);
        if (result.errorCode === 'QUOTA_EXCEEDED' && !quotaErrorCode) {
          quotaErrorCode = result.errorCode;
        }
      }
      if (quotaErrorCode) {
        // Persist error state so autopilot does not re-dispatch on reload.
        actor.send({ type: 'STAGE_PROGRESS', stage: 'assets', partial: { errorCode: quotaErrorCode, status: 'Quota exceeded' } });
      } else if ((imageProviderOverride ?? imageProvider) !== 'manual') {
        toast.success('All images generated');
      } else {
        toast.success('All prompts emitted to Axiom');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk generation failed');
    } finally {
      setGeneratingSlot(null);
      setGeneratingAll(false);
    }
  }

  /* ── Pending upload handlers (no API call yet) ── */
  function handleFileStage(slot: string, file: File) {
    const preview = URL.createObjectURL(file);
    setPendingUploads((prev) => [
      ...prev.filter((p) => p.slot !== slot),
      { slot, preview, file },
    ]);
  }

  function handleUrlStage(slot: string, url: string) {
    if (!url.trim()) return;
    setPendingUploads((prev) => [
      ...prev.filter((p) => p.slot !== slot),
      { slot, preview: url, sourceUrl: url },
    ]);
  }

  function handleDeletePending(slot: string) {
    setPendingUploads((prev) => {
      const removed = prev.find((p) => p.slot === slot);
      if (removed?.preview?.startsWith('blob:')) URL.revokeObjectURL(removed.preview);
      return prev.filter((p) => p.slot !== slot);
    });
  }

  /* ── Finish: upload all pending to API ── */
  async function handleFinish() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setFinishing(true);
    try {
      tracker.trackStarted({ draftId, mode: 'upload' });

      // No pending uploads: advance using existing assets only.
      if (pendingUploads.length === 0) {
        const assetIds = existingAssets.map((a) => a.id);
        const featuredUrl = existingAssets.find((a) => a.role === 'featured_image')?.url;
        tracker.trackCompleted({ draftId, assetCount: existingAssets.length, assetIds, featuredImageUrl: featuredUrl });
        actor.send({ type: 'ASSETS_COMPLETE', result: { assetIds, featuredImageUrl: featuredUrl } as AssetsResult });
        return;
      }

      const saved: UploadedAsset[] = [];
      for (const pending of pendingUploads) {
        const card = slotCards.find((c) => c.slot === pending.slot);
        const role = slotToRole(pending.slot);
        const existing = existingAssets.find((a) => a.role === role);
        if (existing) {
          await fetch(`/api/assets/${existing.id}`, {
            method: 'DELETE',
            signal: abortController?.signal,
          }).catch(() => null);
        }

        let body: Record<string, unknown>;
        let uploadSource: 'file' | 'url';
        if (pending.file) {
          uploadSource = 'file';
          const base64 = await fileToBase64(pending.file);
          body = {
            base64,
            mimeType: pending.file.type,
            draftId,
            role,
            altText: card?.altText || card?.sectionTitle || '',
            prompt: card?.promptBrief ?? '',
            styleRationale: card?.styleRationale ?? '',
          };
        } else {
          uploadSource = 'url';
          body = {
            url: pending.sourceUrl,
            draftId,
            role,
            altText: card?.altText || card?.sectionTitle || '',
            prompt: card?.promptBrief ?? '',
            styleRationale: card?.styleRationale ?? '',
          };
        }
        const res = await fetch('/api/assets/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortController?.signal,
        });
        const json = await res.json();
        if (json?.error) {
          toast.error(`Failed to save ${pending.slot}: ${json.error.message ?? 'Unknown error'}`);
          continue;
        }
        if (pending.preview?.startsWith('blob:')) URL.revokeObjectURL(pending.preview);
        const uploadedAsset: UploadedAsset = {
          id: json.data.id,
          slot: pending.slot,
          url: json.data.url ?? json.data.source_url,
          webpUrl: json.data.webp_url ?? null,
          role,
          altText: card?.sectionTitle ?? '',
        };
        saved.push(uploadedAsset);
        tracker.trackAction('uploaded', {
          draftId,
          role,
          mimeType: pending.file?.type ?? 'image/unknown',
          source: uploadSource,
        });
      }

      setPendingUploads([]);

      // Re-fetch all assets from DB so the parent sees up-to-date IDs
      let allAssets = [...existingAssets, ...saved.map<ContentAsset>((a) => ({
        id: a.id, url: a.url, webpUrl: a.webpUrl, role: a.role, altText: a.altText, sourceType: 'manual_upload',
      }))];
      if (draftId) {
        const res = await fetch(`/api/assets?content_id=${draftId}`, {
          signal: abortController?.signal,
        });
        const { data } = await res.json();
        const items = Array.isArray(data) ? data : (data?.assets ?? data?.items ?? []);
        if (items.length > 0) {
          const mapped: ContentAsset[] = (items as Array<Record<string, unknown>>).map((a) => ({
            id: a.id as string,
            url: (a.source_url as string) ?? (a.url as string) ?? '',
            webpUrl: (a.webp_url as string) ?? null,
            role: (a.role as string) ?? null,
            altText: (a.alt_text as string) ?? null,
            sourceType: (a.source as string) ?? 'manual_upload',
          }));
          setExistingAssets(mapped);
          allAssets = mapped;
        }
      }

      toast.success('Images saved');
      const assetIds = allAssets.map((a) => a.id);
      const featuredUrl = allAssets.find((a) => a.role === 'featured_image')?.url;
      tracker.trackCompleted({
        draftId,
        assetCount: allAssets.length,
        assetIds,
        featuredImageUrl: featuredUrl,
      });
      actor.send({ type: 'ASSETS_COMPLETE', result: { assetIds, featuredImageUrl: featuredUrl } as AssetsResult });
    } catch (e) {
      tracker.trackFailed(e instanceof Error ? e.message : 'Failed to save images');
      toast.error('Failed to save images');
    } finally {
      setFinishing(false);
      inFlightRef.current = false;
    }
  }

  /* ── Defensive guard — orchestrator gates render until draft hydrates ── */
  if (!draft) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-destructive">Draft not loaded. Please refresh.</p>
        </CardContent>
      </Card>
    );
  }

  /* ── Import mode ── */
  if (engineMode === 'import' && !draftId) {
    return (
      <div className="space-y-6">
        <ContextBanner stage="assets" context={trackerContext} onBack={navigate} />
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold">Assets</h1>
            {onModeChange && (
              <Tabs value="import" onValueChange={(v) => onModeChange(v as 'generate' | 'import')}>
                <TabsList>
                  <TabsTrigger value="generate" className="gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Generate
                  </TabsTrigger>
                  <TabsTrigger value="import" className="gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5" /> Import
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>
          <ImportPicker
            entityType="content-assets"
            channelId={channelId ?? undefined}
            searchPlaceholder="Search assets..."
            emptyMessage="No assets in library yet"
            renderItem={(item: Record<string, unknown>): React.ReactNode => {
              const url = item.url as string | undefined;
              const altText = item.alt_text as string | undefined;
              const role = item.role as string | undefined;
              const sourceType = item.source_type as string | undefined;
              return (
                <div className="p-3 rounded-lg border hover:border-primary/50 transition-colors">
                  <div className="flex items-start gap-3">
                    {url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={url} alt={altText ?? ''} className="h-16 w-16 rounded object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {role && <Badge variant="outline" className="text-[10px]">{role}</Badge>}
                        {sourceType && <Badge variant="secondary" className="text-[10px]">{sourceType}</Badge>}
                      </div>
                      {altText && <p className="text-xs text-muted-foreground mt-1">{altText}</p>}
                    </div>
                  </div>
                </div>
              );
            }}
            onSelect={(item) => {
              actor.send({
                type: 'ASSETS_COMPLETE',
                result: {
                  assetIds: [item.id as string],
                  featuredImageUrl: (item.url as string | undefined) || undefined,
                } as AssetsResult,
              });
            }}
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading assets...</div>;
  }

  const featuredPending = pendingUploads.find((p) => p.slot === 'featured');
  const totalSlots = slotCards.length;
  const pendingCount = pendingUploads.length;

  return (
    <div className="space-y-6">
      <ContextBanner stage="assets" context={trackerContext} onBack={navigate} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ImageIcon className="h-5 w-5" /> Assets
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate prompt briefs, refine them, then upload images for each section.
          </p>
          {trackerContext.personaName && (() => {
            const theme = getPersonaTheme(trackerContext.personaSlug);
            return (
              <div
                className="mt-3 mb-2 inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 backdrop-blur-sm"
                style={{
                  background: `rgba(${theme.glow}, 0.1)`,
                  borderColor: `rgba(${theme.glow}, 0.35)`,
                }}
                aria-label={`Authored by ${trackerContext.personaName}`}
              >
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{
                    background: theme.gradient,
                    boxShadow: `0 4px 12px -2px rgba(${theme.glow}, 0.5)`,
                  }}
                >
                  {trackerContext.personaName![0]}
                </div>
                <span
                  className="text-xs font-semibold tracking-wide"
                  style={{ color: theme.accent }}
                >
                  {trackerContext.personaName}
                </span>
              </div>
            );
          })()}
        </div>
        {onModeChange && (
          <Tabs value="generate" onValueChange={(v) => onModeChange(v as 'generate' | 'import')}>
            <TabsList>
              <TabsTrigger value="generate" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Generate
              </TabsTrigger>
              <TabsTrigger value="import" className="gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" /> Import
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Phase stepper */}
      <div className="flex items-center gap-3">
        {([
          { key: 'briefs' as const, label: 'Briefs' },
          { key: 'refine' as const, label: 'Refine', disabled: imagesMode === 'no-briefs' || slotCards.length === 0 },
          { key: 'images' as const, label: 'Generate', disabled: imagesMode === 'no-briefs' || slotCards.length === 0 },
          { key: 'approve' as const, label: 'Approve' },
        ]).map((step, i, arr) => {
          const active = phase === step.key;
          const reached =
            step.key === 'briefs' ||
            (step.key === 'refine' && slotCards.length > 0) ||
            (step.key === 'images' && slotCards.length > 0) ||
            step.key === 'approve';
          const canClick = reached && !step.disabled;
          return (
            <div key={step.key} className="flex items-center gap-3">
              <button
                type="button"
                disabled={!canClick}
                onClick={() => canClick && setPhase(step.key)}
                className={`flex items-center gap-1.5 text-sm transition-colors ${
                  active ? 'text-primary font-medium'
                    : canClick ? 'text-muted-foreground hover:text-foreground cursor-pointer'
                    : 'text-muted-foreground/40 cursor-not-allowed'
                }`}
              >
                {active ? (
                  <div className="h-4 w-4 rounded-full border-2 border-primary flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  </div>
                ) : (
                  <div className={`h-4 w-4 rounded-full border-2 ${canClick ? 'border-muted-foreground' : 'border-muted-foreground/30'}`} />
                )}
                {step.label}
              </button>
              {i < arr.length - 1 && <div className="h-px w-8 bg-border" />}
            </div>
          );
        })}
      </div>

      {/* ═══ PHASE 1: Briefs ═══ */}
      {phase === 'briefs' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 1: Briefs</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Generate refined image prompts for each section, or skip briefs and pick images from the section content directly.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Generate briefs
              </Label>
              <ModelPicker
                providers={ASSETS_PROVIDERS}
                provider={provider}
                model={model}
                recommended={{ provider: null, model: null }}
                onProviderChange={(p) => {
                  setProvider(p);
                  if (p === 'manual') setModel('manual');
                  else setModel(MODELS_BY_PROVIDER[p][0].id);
                }}
                onModelChange={setModel}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {provider === 'manual'
                    ? 'Manual: a prompt will be emitted to Axiom. Paste the output JSON when ready.'
                    : 'AI: runs the assets agent with the selected model.'}
                </p>
                <Button
                  onClick={handleGenerateBriefs}
                  disabled={generatingBriefs || !draftId}
                  className="gap-2 shrink-0"
                >
                  {generatingBriefs ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : provider === 'manual' ? (
                    <ClipboardPaste className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {provider === 'manual' ? 'Get Manual Prompt' : 'Generate Briefs'}
                </Button>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Skip briefs
                </Label>
                <p className="text-xs text-muted-foreground">
                  Pick images yourself using each section&apos;s title + content as context.
                </p>
              </div>
              <Button variant="outline" className="gap-2 shrink-0" onClick={handleSkipBriefs}>
                <SkipForward className="h-4 w-4" />
                Skip Briefs
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual paste dialog for briefs. Suppressed in overview mode. */}
      <ManualOutputDialog
        open={!overviewMode && manualBriefsOpen}
        onOpenChange={(open) => setManualBriefsOpen(open)}
        title="Paste Asset Prompt Briefs"
        description="Retrieve the prompt from Axiom, run it in your AI tool, then paste the BC_ASSETS_OUTPUT JSON here."
        submitLabel="Import Briefs"
        onSubmit={async (parsed) => {
          await handleManualImport(parsed);
          setManualBriefsOpen(false);
        }}
      />

      {/* ═══ PHASE 2: Refine Prompts ═══ */}
      {phase === 'refine' && (
        <div className="space-y-4">
          {/* Visual direction banner */}
          {visualDirection && (
            <Card className="border-purple-500/30 bg-purple-500/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Palette className="h-5 w-5 text-purple-500 mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <div className="text-sm font-medium">Visual Direction</div>
                    {visualDirection.style && (
                      <div className="text-xs text-muted-foreground">{visualDirection.style}</div>
                    )}
                    {visualDirection.mood && (
                      <div className="text-xs text-muted-foreground">Mood: {visualDirection.mood}</div>
                    )}
                    {visualDirection.colorPalette.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {visualDirection.colorPalette.map((color) => (
                          <div
                            key={color}
                            className="h-5 w-5 rounded border"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    )}
                    {visualDirection.constraints.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Constraints: {visualDirection.constraints.join(' | ')}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-slot prompt editors */}
          {slotCards.map((card, i) => (
            <Card key={card.slot}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant={card.slot === 'featured' ? 'default' : 'outline'} className="text-[10px]">
                    {card.slot}
                  </Badge>
                  <CardTitle className="text-sm">{card.sectionTitle}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">Prompt Brief</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => {
                        const full = buildFullPrompt(card, visualDirection);
                        void navigator.clipboard.writeText(full);
                        toast.success(`Full image prompt copied for ${card.slot}`);
                      }}
                    >
                      <Copy className="h-3 w-3" /> Copy Full Prompt
                    </Button>
                  </div>
                  <Textarea
                    value={card.promptBrief}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSlotCards((prev) => {
                        const updated = [...prev];
                        if (updated[i]) updated[i] = { ...updated[i], promptBrief: value };
                        return updated;
                      });
                    }}
                    rows={3}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Alt Text</Label>
                  <Input
                    value={card.altText}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSlotCards((prev) => {
                        const updated = [...prev];
                        if (updated[i]) updated[i] = { ...updated[i], altText: value };
                        return updated;
                      });
                    }}
                    placeholder="Describe what is visually depicted..."
                    className="text-sm mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Used for accessibility and SEO. Describe the image, not the concept.
                  </p>
                </div>
                {card.styleRationale && (
                  <div className="text-xs text-muted-foreground">{card.styleRationale}</div>
                )}
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Aspect Ratio</Label>
                  <select
                    value={card.aspectRatio}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSlotCards((prev) => {
                        const updated = [...prev];
                        if (updated[i]) updated[i] = { ...updated[i], aspectRatio: value };
                        return updated;
                      });
                    }}
                    className="text-xs border rounded px-2 py-1"
                  >
                    <option value="16:9">16:9</option>
                    <option value="1:1">1:1</option>
                    <option value="9:16">9:16</option>
                    <option value="4:3">4:3</option>
                  </select>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                void persistBriefs(visualDirection, slotCards);
                setImagesMode('brief');
                setPhase('images');
              }}
              className="gap-2"
            >
              Continue to Generate
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setPhase('briefs')}>
              Regenerate Briefs
            </Button>
          </div>
        </div>
      )}

      {/* ═══ PHASE 3: Generate Images (AI generation only) ═══ */}
      {phase === 'images' && imagesMode === 'brief' && (
        <div className="space-y-4">
          {/* Bulk action bar */}
          <Card>
            <CardContent className="py-3 space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Image provider
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {IMAGE_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setImageProvider(p.id)}
                    disabled={generatingAll || !!generatingSlot}
                    className={`text-left rounded-lg border p-2.5 transition-colors ${
                      imageProvider === p.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    } ${(generatingAll || !!generatingSlot) ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{p.hint}</div>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">
                  Apply to every slot below, or use the per-slot button for granular control.
                </p>
                <Button
                  onClick={handleGenerateAllSlots}
                  disabled={generatingAll || !!generatingSlot || slotCards.length === 0}
                  size="sm"
                  className="gap-1.5 shrink-0"
                >
                  {generatingAll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : imageProvider === 'manual' ? (
                    <ClipboardPaste className="h-3.5 w-3.5" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {imageProvider === 'manual' ? 'Emit all prompts' : 'Generate all images'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {slotCards.map((card, i) => {
            const role = slotToRole(card.slot);
            const existing = existingAssets.find((a) => a.role === role) ?? slotAssets[card.slot] ?? null;
            const pending = pendingUploads.find((p) => p.slot === card.slot);
            const isGeneratingThis = generatingSlot === card.slot;
            return (
              <BriefImageSlotCard
                key={card.slot}
                card={card}
                visualDirection={visualDirection}
                existingAsset={existing}
                pendingPreview={pending?.preview}
                generating={isGeneratingThis}
                generateDisabled={!!generatingSlot || generatingAll}
                generateProvider={imageProvider}
                showUpload={false}
                onGenerate={() => handleGenerateSlot(card)}
                onFileStage={(file) => handleFileStage(card.slot, file)}
                onUrlStage={(url) => handleUrlStage(card.slot, url)}
                onDeletePending={() => handleDeletePending(card.slot)}
                onAltTextChange={(val) => {
                  setSlotCards((prev) => {
                    const updated = [...prev];
                    if (updated[i]) updated[i] = { ...updated[i], altText: val };
                    return updated;
                  });
                }}
              />
            );
          })}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setPhase('approve')}
              disabled={generatingAll || !!generatingSlot}
              className="gap-2"
            >
              Continue to Approve
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setPhase('refine')}
              disabled={generatingAll || !!generatingSlot}
            >
              Back to Refine
            </Button>
          </div>
        </div>
      )}

      {/* ═══ PHASE 4: Approve (review + override + finalize) ═══ */}
      {phase === 'approve' && imagesMode === 'brief' && (
        <div className="space-y-4">
          {slotCards.map((card, i) => {
            const role = slotToRole(card.slot);
            const existing = existingAssets.find((a) => a.role === role) ?? slotAssets[card.slot] ?? null;
            const pending = pendingUploads.find((p) => p.slot === card.slot);
            const isGeneratingThis = generatingSlot === card.slot;
            return (
              <BriefImageSlotCard
                key={card.slot}
                card={card}
                visualDirection={visualDirection}
                existingAsset={existing}
                pendingPreview={pending?.preview}
                generating={isGeneratingThis}
                generateDisabled={!!generatingSlot || generatingAll}
                generateProvider={imageProvider}
                showUpload
                onGenerate={() => handleGenerateSlot(card)}
                onFileStage={(file) => handleFileStage(card.slot, file)}
                onUrlStage={(url) => handleUrlStage(card.slot, url)}
                onDeletePending={() => handleDeletePending(card.slot)}
                onAltTextChange={(val) => {
                  setSlotCards((prev) => {
                    const updated = [...prev];
                    if (updated[i]) updated[i] = { ...updated[i], altText: val };
                    return updated;
                  });
                }}
              />
            );
          })}

          <div className="flex items-center gap-3">
            <Button onClick={handleFinish} disabled={finishing} className="gap-2">
              {finishing ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
              ) : (
                <><Check className="h-4 w-4" />Finish &amp; Save</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setPhase('images')}
              disabled={finishing}
            >
              Back to Generate
            </Button>
          </div>
        </div>
      )}

      {/* ═══ PHASE 4: Approve (no-briefs mode — upload only) ═══ */}
      {phase === 'approve' && imagesMode === 'no-briefs' && (
        <div className="space-y-4">
          {noBriefSections.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Loading sections…
              </CardContent>
            </Card>
          ) : noBriefSections.map((section) => {
            const role = slotToRole(section.slot);
            const existing = existingAssets.find((a) => a.role === role) ?? null;
            const pending = pendingUploads.find((p) => p.slot === section.slot);
            return (
              <NoBriefImageSlotCard
                key={section.slot}
                section={section}
                existingAsset={existing}
                pendingPreview={pending?.preview}
                onFileStage={(file) => handleFileStage(section.slot, file)}
                onUrlStage={(url) => handleUrlStage(section.slot, url)}
                onDeletePending={() => handleDeletePending(section.slot)}
              />
            );
          })}

          <div className="flex items-center gap-3">
            <Button onClick={handleFinish} disabled={finishing} className="gap-2">
              {finishing ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
              ) : (
                <><Check className="h-4 w-4" />Finish &amp; Save</>
              )}
            </Button>
            <Button variant="outline" onClick={() => setPhase('briefs')} disabled={finishing}>
              Back to Briefs
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}

/* ── Brief Image Slot Card sub-component ── */

interface BriefImageSlotCardProps {
  card: SlotCard;
  visualDirection: VisualDirection | null;
  existingAsset: ContentAsset | null;
  pendingPreview?: string;
  generating: boolean;
  generateDisabled: boolean;
  generateProvider: ImageProvider;
  /** When false, hides the Upload File / paste-URL / drag-drop affordances.
   *  Used by the Generate phase to keep the UI focused on AI generation;
   *  the Approve phase passes true to allow overrides. */
  showUpload?: boolean;
  onGenerate: () => void;
  onFileStage: (file: File) => void;
  onUrlStage: (url: string) => void;
  onDeletePending: () => void;
  onAltTextChange: (val: string) => void;
}

function BriefImageSlotCard({
  card, visualDirection, existingAsset, pendingPreview,
  generating, generateDisabled, generateProvider,
  showUpload = true,
  onGenerate, onFileStage, onUrlStage, onDeletePending, onAltTextChange,
}: BriefImageSlotCardProps) {
  const [urlInput, setUrlInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Staged upload wins over saved asset so the user sees what they just picked.
  const preview = pendingPreview ?? existingAsset?.url;
  const previewKey = pendingPreview ?? existingAsset?.id ?? 'none';
  const isStaged = !!pendingPreview;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={card.slot === 'featured' ? 'default' : 'outline'} className="text-[10px]">
              {card.slot}
            </Badge>
            <span className="text-sm font-medium">{card.sectionTitle}</span>
            {preview && <Check className="h-3.5 w-3.5 text-green-500" />}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {expanded && (
          <div className="text-xs text-muted-foreground p-2 rounded bg-muted/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Prompt:</span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-1.5 text-[10px] gap-1"
                onClick={() => {
                  const full = buildFullPrompt(card, visualDirection);
                  void navigator.clipboard.writeText(full);
                  toast.success(`Copied full prompt for ${card.slot}`);
                }}
              >
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>
            <div>{card.promptBrief}</div>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={previewKey}
              src={preview}
              alt={card.sectionTitle}
              className="w-full max-h-56 rounded-lg border object-cover"
            />
            {existingAsset?.altText && !isStaged && (
              <p className="text-[10px] text-muted-foreground italic">{existingAsset.altText}</p>
            )}
            {isStaged && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onDeletePending}>
                <Trash2 className="h-3 w-3" /> Remove Staged
              </Button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={onGenerate}
            disabled={generateDisabled}
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : generateProvider === 'manual' ? (
              <ClipboardPaste className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {generateProvider === 'manual'
              ? 'Emit prompt (manual)'
              : existingAsset ? 'Regenerate with AI' : 'Generate with AI'}
          </Button>

          {showUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFileStage(file);
                }}
              />
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> Upload File
              </Button>

              <div className="flex items-center gap-1.5">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="…or paste image URL"
                  className="text-xs h-8 w-56"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  disabled={!urlInput.trim()}
                  onClick={() => { onUrlStage(urlInput); setUrlInput(''); }}
                >
                  <Link2 className="h-3.5 w-3.5" /> Add URL
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Drag-drop zone when no preview yet (only when uploads allowed) */}
        {showUpload && !preview && (
          <div
            className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/20'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file?.type.startsWith('image/')) onFileStage(file);
              else toast.error('Drop an image file');
            }}
          >
            <Upload className="h-5 w-5 mx-auto text-muted-foreground/60" />
            <div className="text-xs text-muted-foreground mt-1">Drag & drop image here</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── No-Brief Image Slot Card sub-component ── */

interface NoBriefImageSlotCardProps {
  section: { slot: string; sectionTitle: string; keyPoints: string[]; body: string };
  existingAsset: ContentAsset | null;
  pendingPreview?: string;
  onFileStage: (file: File) => void;
  onUrlStage: (url: string) => void;
  onDeletePending: () => void;
}

function NoBriefImageSlotCard({
  section, existingAsset, pendingPreview,
  onFileStage, onUrlStage, onDeletePending,
}: NoBriefImageSlotCardProps) {
  const [urlInput, setUrlInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Staged upload wins over saved asset so the user sees what they just picked.
  const preview = pendingPreview ?? existingAsset?.url;
  const previewKey = pendingPreview ?? existingAsset?.id ?? 'none';
  const isStaged = !!pendingPreview;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={section.slot === 'featured' ? 'default' : 'outline'} className="text-[10px]">
              {section.slot}
            </Badge>
            <span className="text-sm font-medium">{section.sectionTitle}</span>
            {preview && <Check className="h-3.5 w-3.5 text-green-500" />}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} disabled={!section.body}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {section.keyPoints.length > 0 && (
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
            {section.keyPoints.map((kp, i) => <li key={i}>{kp}</li>)}
          </ul>
        )}

        {expanded && section.body && (
          <div className="text-xs p-2 rounded bg-muted/50 space-y-2 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between sticky top-0 bg-muted/50 py-0.5">
              <span className="font-medium">Section content:</span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-1.5 text-[10px] gap-1"
                onClick={() => {
                  void navigator.clipboard.writeText(section.body);
                  toast.success('Section content copied');
                }}
              >
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>
            <div className="whitespace-pre-wrap">{section.body}</div>
          </div>
        )}

        {preview && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={previewKey}
              src={preview}
              alt={section.sectionTitle}
              className="w-full max-h-56 rounded-lg border object-cover"
            />
            {isStaged && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onDeletePending}>
                <Trash2 className="h-3 w-3" /> Remove Staged
              </Button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileStage(file);
            }}
          />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload File
          </Button>
          <div className="flex items-center gap-1.5">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="…or paste image URL"
              className="text-xs h-8 w-56"
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              disabled={!urlInput.trim()}
              onClick={() => { onUrlStage(urlInput); setUrlInput(''); }}
            >
              <Link2 className="h-3.5 w-3.5" /> Add URL
            </Button>
          </div>
        </div>

        {!preview && (
          <div
            className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/20'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file?.type.startsWith('image/')) onFileStage(file);
              else toast.error('Drop an image file');
            }}
          >
            <Upload className="h-5 w-5 mx-auto text-muted-foreground/60" />
            <div className="text-xs text-muted-foreground mt-1">Drag & drop image here</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Utilities ── */

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data:image/...;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
