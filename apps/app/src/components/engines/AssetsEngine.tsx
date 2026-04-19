'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, ArrowRight, Check, Upload, Image as ImageIcon,
  Sparkles, Palette, Trash2, Link2, ChevronDown, ChevronUp, Copy,
  ClipboardPaste,
} from 'lucide-react';
import { toast } from 'sonner';
import { AssetGallery } from '@/components/preview/AssetGallery';
import { ManualOutputDialog } from './ManualOutputDialog';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { ContextBanner } from './ContextBanner';
import { ImportPicker } from './ImportPicker';
import type { BaseEngineProps, AssetsResult } from './types';

/* ── Types ── */

type AssetPhase = 'prompts' | 'refined' | 'upload' | 'done';

interface SlotCard {
  slot: string;
  sectionTitle: string;
  promptBrief: string;
  styleRationale: string;
  aspectRatio: string;
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

interface AssetsEngineProps extends BaseEngineProps {
  draftId?: string;
  draftStatus?: string;
}

/* ── Helpers ── */

function slotToRole(slot: string): string {
  if (slot === 'featured') return 'featured_image';
  return `body_${slot}`;
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

export function AssetsEngine({
  mode: engineMode,
  channelId,
  context,
  draftId,
  draftStatus,
  onComplete,
  onBack,
}: AssetsEngineProps) {
  const [phase, setPhase] = useState<AssetPhase>('prompts');
  const [maxPhaseReached, setMaxPhaseReached] = useState<AssetPhase>('prompts');
  const [visualDirection, setVisualDirection] = useState<VisualDirection | null>(null);
  const [slotCards, setSlotCards] = useState<SlotCard[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [uploadedAssets, setUploadedAssets] = useState<UploadedAsset[]>([]);
  const [existingAssets, setExistingAssets] = useState<ContentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [generatingSlot, setGeneratingSlot] = useState<string | null>(null);
  const [slotAssets, setSlotAssets] = useState<Record<string, ContentAsset>>({});
  const inFlightRef = useRef(false);
  const tracker = usePipelineTracker('assets', context);

  // maxPhaseReached starts at 'done' if existing assets were found on mount
  // (handled in fetchAssets below)

  // Track furthest phase reached so stepper steps can be clicked
  function goToPhase(p: AssetPhase) {
    setPhase(p);
    const order: AssetPhase[] = ['prompts', 'refined', 'upload', 'done'];
    if (order.indexOf(p) > order.indexOf(maxPhaseReached)) {
      setMaxPhaseReached(p);
    }
  }

  // Fetch existing assets on mount → skip to done if present
  useEffect(() => {
    async function fetchAssets() {
      try {
        const res = await fetch(`/api/assets?content_id=${draftId}`);
        const { data } = await res.json();
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
          setPhase('done');
          setMaxPhaseReached('done');
        }
      } catch {
        // No existing assets, start fresh
      } finally {
        setLoading(false);
      }
    }
    if (draftId) void fetchAssets();
    else setLoading(false);
  }, [draftId]);

  async function withGuard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    try {
      return await fn();
    } finally {
      inFlightRef.current = false;
    }
  }

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
    goToPhase('refined');
    toast.success(`Imported ${result.slots.length} prompt briefs`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Build inputContext for ManualModePanel ── */
  const [inputContext, setInputContext] = useState('');
  useEffect(() => {
    async function buildContext() {
      if (!draftId) return;
      try {
        const res = await fetch(`/api/content-drafts/${draftId}/asset-prompts`, {
          method: 'POST',
        });
        const { data } = await res.json();
        if (data) {
          const ctx = JSON.stringify({ BC_ASSETS_INPUT: data }, null, 2);
          setInputContext(ctx);
        }
      } catch {
        // Fallback: use basic context
        setInputContext(JSON.stringify({
          BC_ASSETS_INPUT: {
            title: context.ideaTitle ?? 'Untitled',
            content_type: 'blog',
            outline: [],
            channel_context: {},
          },
        }, null, 2));
      }
    }
    void buildContext();
  }, [draftId, context.ideaTitle]);

  /* ── AI Generate All (existing path) ── */
  async function handleGenerateAll() {
    await withGuard(async () => {
      try {
        tracker.trackStarted({ draftId, mode: 'generate' });
        setGenerating(true);
        const res = await fetch(`/api/content-drafts/${draftId}/generate-assets`, {
          method: 'POST',
        });
        const json = await res.json();
        if (json?.error) {
          tracker.trackFailed(json.error.message ?? 'Failed to generate assets');
          toast.error(json.error.message ?? 'Failed to generate assets');
          return;
        }
        // Refetch assets
        const assetsRes = await fetch(`/api/assets?content_id=${draftId}`);
        const assetsJson = await assetsRes.json();
        const items = Array.isArray(assetsJson.data)
          ? assetsJson.data
          : (assetsJson.data?.assets ?? assetsJson.data?.items ?? []);
        const mapped = items.length > 0
          ? (items as Array<Record<string, unknown>>).map((a) => ({
              id: a.id as string,
              url: (a.source_url as string) ?? (a.url as string) ?? '',
              webpUrl: (a.webp_url as string) ?? null,
              role: (a.role as string) ?? null,
              altText: (a.alt_text as string) ?? null,
              sourceType: (a.source as string) ?? 'ai_generated',
            }))
          : [];
        if (mapped.length > 0) {
          setExistingAssets(mapped);
        }
        goToPhase('done');
        toast.success('Assets generated');
        const assetIds = mapped.map((a) => a.id);
        const featuredUrl = mapped.find((a) => a.role === 'featured_image')?.url;
        tracker.trackCompleted({
          draftId,
          assetCount: mapped.length,
          assetIds,
          featuredImageUrl: featuredUrl,
        });
      } catch (e) {
        tracker.trackFailed(e instanceof Error ? e.message : 'Failed to generate assets');
        toast.error('Failed to generate assets');
      } finally {
        setGenerating(false);
      }
    });
  }

  /* ── AI generate a single slot image ── */
  async function handleGenerateSlot(card: SlotCard) {
    if (generatingSlot) return;
    const prompt = buildFullPrompt(card, visualDirection);
    if (prompt.trim().length < 10) {
      toast.error('Prompt too short');
      return;
    }
    setGeneratingSlot(card.slot);
    try {
      // Delete any existing asset for this role so the new one replaces it
      const role = slotToRole(card.slot);
      const existing = existingAssets.find((a) => a.role === role);
      if (existing) {
        await fetch(`/api/assets/${existing.id}`, { method: 'DELETE' }).catch(() => null);
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
        }),
      });
      const json = await res.json();
      if (json?.error) {
        toast.error(json.error.message ?? 'Image generation failed');
        return;
      }
      const asset = Array.isArray(json.data) ? json.data[0] : json.data;
      if (!asset) {
        toast.error('No image returned');
        return;
      }
      const mapped: ContentAsset = {
        id: asset.id as string,
        url: (asset.source_url as string) ?? (asset.url as string) ?? '',
        webpUrl: (asset.webp_url as string) ?? null,
        role: (asset.role as string) ?? role,
        altText: (asset.alt_text as string) ?? card.sectionTitle,
        sourceType: (asset.source as string) ?? 'generated',
      };
      setSlotAssets((prev) => ({ ...prev, [card.slot]: mapped }));
      setExistingAssets((prev) => [...prev.filter((a) => a.role !== role), mapped]);
      tracker.trackAction('generated', { draftId, role, slot: card.slot });
      toast.success(`Generated image for ${card.slot}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Image generation failed');
    } finally {
      setGeneratingSlot(null);
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
      const saved: UploadedAsset[] = [];
      for (const pending of pendingUploads) {
        const card = slotCards.find((c) => c.slot === pending.slot);
        // Delete any existing asset for this role so we don't leave stale records
        const role = slotToRole(pending.slot);
        const existing = existingAssets.find((a) => a.role === role);
        if (existing) {
          await fetch(`/api/assets/${existing.id}`, { method: 'DELETE' }).catch(() => null);
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
            role: slotToRole(pending.slot),
            altText: card?.sectionTitle ?? '',
            prompt: card?.promptBrief ?? '',
            styleRationale: card?.styleRationale ?? '',
          };
        } else {
          uploadSource = 'url';
          body = {
            url: pending.sourceUrl,
            draftId,
            role: slotToRole(pending.slot),
            altText: card?.sectionTitle ?? '',
            prompt: card?.promptBrief ?? '',
            styleRationale: card?.styleRationale ?? '',
          };
        }
        const res = await fetch('/api/assets/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json?.error) {
          toast.error(`Failed to save ${pending.slot}: ${json.error.message ?? 'Unknown error'}`);
          continue;
        }
        // Revoke blob URL after successful save
        if (pending.preview?.startsWith('blob:')) URL.revokeObjectURL(pending.preview);
        const uploadedAsset = {
          id: json.data.id,
          slot: pending.slot,
          url: json.data.url ?? json.data.source_url,
          webpUrl: json.data.webp_url ?? null,
          role: slotToRole(pending.slot),
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
      setUploadedAssets((prev) => {
        const slots = new Set(saved.map((s) => s.slot));
        return [...prev.filter((a) => !slots.has(a.slot)), ...saved];
      });
      setPendingUploads([]);
      // Re-fetch all assets from DB so the gallery shows fresh URLs
      if (draftId) {
        const res = await fetch(`/api/assets?content_id=${draftId}`);
        const { data } = await res.json();
        const items = Array.isArray(data) ? data : (data?.assets ?? data?.items ?? []);
        if (items.length > 0) {
          setExistingAssets(
            (items as Array<Record<string, unknown>>).map((a) => ({
              id: a.id as string,
              url: (a.source_url as string) ?? (a.url as string) ?? '',
              webpUrl: (a.webp_url as string) ?? null,
              role: (a.role as string) ?? null,
              altText: (a.alt_text as string) ?? null,
              sourceType: (a.source as string) ?? 'manual_upload',
            })),
          );
        }
      }
      goToPhase('done');
      toast.success('Images saved');
      const allAssets = [...existingAssets, ...saved];
      const assetIds = allAssets.map((a) => a.id);
      const featuredUrl = allAssets.find((a) => a.role === 'featured_image')?.url;
      tracker.trackCompleted({
        draftId,
        assetCount: allAssets.length,
        assetIds,
        featuredImageUrl: featuredUrl,
      });
    } catch (e) {
      tracker.trackFailed(e instanceof Error ? e.message : 'Failed to save images');
      toast.error('Failed to save images');
    } finally {
      setFinishing(false);
      inFlightRef.current = false;
    }
  }

  /* ── Import mode ── */
  if (engineMode === 'import' && !draftId) {
    return (
      <div className="space-y-6">
        <ContextBanner stage="assets" context={context} onBack={onBack} />
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Assets</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Import assets from your library.
            </p>
          </div>
          <ImportPicker
            entityType="content-assets"
            channelId={channelId}
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
              onComplete({
                assetIds: [item.id as string],
                featuredImageUrl: (item.url as string | undefined) || undefined,
              } as AssetsResult);
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

  const phaseOrder: AssetPhase[] = ['prompts', 'refined', 'upload', 'done'];
  function phaseIndex(p: AssetPhase): number { return phaseOrder.indexOf(p); }
  const maxReachedIndex = phaseIndex(maxPhaseReached);

  const phases: { key: AssetPhase; label: string }[] = [
    { key: 'prompts', label: 'Prompt Briefs' },
    { key: 'refined', label: 'Refine Prompts' },
    { key: 'upload', label: 'Upload Images' },
    { key: 'done', label: 'Done' },
  ];

  return (
    <div className="space-y-6">
      <ContextBanner stage="assets" context={context} onBack={onBack} />

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ImageIcon className="h-5 w-5" /> Assets
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate prompt briefs, refine them, then upload images for each section.
        </p>
      </div>

      {/* Phase stepper — clickable for reached phases */}
      <div className="flex items-center gap-3">
        {phases.map((p, i) => {
          const reached = i <= maxReachedIndex;
          const active = phase === p.key;
          const past = phaseIndex(phase) > i;
          return (
            <div key={p.key} className="flex items-center gap-3">
              <button
                type="button"
                disabled={!reached}
                onClick={() => reached && goToPhase(p.key)}
                className={`flex items-center gap-1.5 text-sm transition-colors ${
                  active ? 'text-primary font-medium'
                    : reached ? 'text-muted-foreground hover:text-foreground cursor-pointer'
                    : 'text-muted-foreground/40 cursor-not-allowed'
                }`}
              >
                {past ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : active ? (
                  <div className="h-4 w-4 rounded-full border-2 border-primary flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  </div>
                ) : (
                  <div className={`h-4 w-4 rounded-full border-2 ${reached ? 'border-muted-foreground' : 'border-muted-foreground/30'}`} />
                )}
                {p.label}
              </button>
              {i < phases.length - 1 && <div className="h-px w-8 bg-border" />}
            </div>
          );
        })}
      </div>

      {/* ═══ PHASE 1: Prompt Briefs ═══ */}
      {phase === 'prompts' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 1: Get Prompt Briefs</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Generate structured image prompts for each section. Copy the input context into your AI tool, then paste the response back.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="manual" className="space-y-4">
              <TabsList>
                <TabsTrigger value="manual">
                  <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" /> Manual (External AI)
                </TabsTrigger>
                <TabsTrigger value="auto">
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Auto Generate All
                </TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="space-y-3">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Input Context (BC_ASSETS_INPUT)
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      disabled={!inputContext}
                      onClick={() => {
                        void navigator.clipboard.writeText(inputContext);
                        toast.success('Input context copied');
                      }}
                    >
                      <Copy className="h-3 w-3" /> Copy Context
                    </Button>
                  </div>
                  <Textarea
                    value={inputContext}
                    readOnly
                    rows={8}
                    className="text-xs font-mono bg-background/60"
                    placeholder="Building input context..."
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Run the context in ChatGPT / Claude, then paste the BC_ASSETS_OUTPUT JSON.
                  </p>
                  <Button
                    onClick={() => setManualDialogOpen(true)}
                    size="sm"
                    className="gap-1.5 shrink-0"
                    disabled={!inputContext}
                  >
                    <ClipboardPaste className="h-4 w-4" /> Paste Output
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="auto" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Auto-generate images using the configured AI image provider. Skips prompt refinement.
                </p>
                <Button
                  onClick={handleGenerateAll}
                  disabled={generating}
                  className="gap-2"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate All Images
                    </>
                  )}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Manual paste dialog for Phase 1 */}
      <ManualOutputDialog
        open={manualDialogOpen}
        onOpenChange={(open) => setManualDialogOpen(open)}
        title="Paste Asset Prompt Briefs"
        description="Run the input context in your external AI tool, then paste the BC_ASSETS_OUTPUT JSON here."
        submitLabel="Import Prompt Briefs"
        onSubmit={async (parsed) => {
          await handleManualImport(parsed);
          setManualDialogOpen(false);
        }}
      />

      {/* ═══ PHASE 2: Refine Prompts ═══ */}
      {phase === 'refined' && (
        <div className="space-y-4">
          {/* Visual direction banner */}
          {visualDirection && (
            <Card className="border-purple-500/30 bg-purple-500/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Palette className="h-5 w-5 text-purple-500 mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <div className="text-sm font-medium">Visual Direction</div>
                    <div className="text-xs text-muted-foreground">{visualDirection.style}</div>
                    <div className="text-xs text-muted-foreground">Mood: {visualDirection.mood}</div>
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

          {/* Slot cards */}
          {slotCards.map((card, i) => {
            const generatedAsset =
              slotAssets[card.slot]
              ?? existingAssets.find((a) => a.role === slotToRole(card.slot))
              ?? null;
            const isGeneratingThis = generatingSlot === card.slot;
            return (
            <Card key={card.slot}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant={card.slot === 'featured' ? 'default' : 'outline'} className="text-[10px]">
                    {card.slot}
                  </Badge>
                  <CardTitle className="text-sm">{card.sectionTitle}</CardTitle>
                  {generatedAsset && <Check className="h-3.5 w-3.5 text-green-500" />}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <Label className="text-xs">Prompt Brief</Label>
                    <div className="flex items-center gap-1.5">
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
                        <Copy className="h-3 w-3" />
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => handleGenerateSlot(card)}
                        disabled={!!generatingSlot}
                      >
                        {isGeneratingThis ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        {isGeneratingThis ? 'Generating…' : generatedAsset ? 'Regenerate' : 'Generate with AI'}
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={card.promptBrief}
                    onChange={(e) => {
                      const updated = [...slotCards];
                      updated[i] = { ...card, promptBrief: e.target.value };
                      setSlotCards(updated);
                    }}
                    rows={3}
                    className="text-sm"
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {card.styleRationale}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Aspect Ratio</Label>
                  <select
                    value={card.aspectRatio}
                    onChange={(e) => {
                      const updated = [...slotCards];
                      updated[i] = { ...card, aspectRatio: e.target.value };
                      setSlotCards(updated);
                    }}
                    className="text-xs border rounded px-2 py-1"
                  >
                    <option value="16:9">16:9</option>
                    <option value="1:1">1:1</option>
                    <option value="9:16">9:16</option>
                    <option value="4:3">4:3</option>
                  </select>
                </div>

                {generatedAsset && (
                  <div className="space-y-2 pt-1">
                    <Label className="text-xs text-muted-foreground">Generated preview</Label>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={generatedAsset.url}
                      alt={generatedAsset.altText ?? card.sectionTitle}
                      className="w-full max-h-56 rounded-lg border object-cover"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
            );
          })}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => goToPhase('upload')}
              className="gap-2"
            >
              Start Uploading
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => goToPhase('prompts')}
            >
              Paste New Prompts
            </Button>
          </div>
        </div>
      )}

      {/* ═══ PHASE 3: Upload Images ═══ */}
      {phase === 'upload' && (
        <div className="space-y-4">
          {/* Progress */}
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center justify-between text-sm">
                <span>{pendingCount} of {totalSlots} images staged</span>
                <span className="text-muted-foreground">
                  {featuredPending ? 'Featured image ready' : 'Featured image required'}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${totalSlots > 0 ? (pendingCount / totalSlots) * 100 : 0}%` }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Slot upload cards */}
          {slotCards.map((card) => {
            const pending = pendingUploads.find((p) => p.slot === card.slot);
            return (
              <SlotUploadCard
                key={card.slot}
                card={card}
                visualDirection={visualDirection}
                pendingPreview={pending?.preview}
                onFileUpload={(file) => handleFileStage(card.slot, file)}
                onUrlUpload={(url) => handleUrlStage(card.slot, url)}
                onDelete={() => handleDeletePending(card.slot)}
              />
            );
          })}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleFinish}
              disabled={!featuredPending || finishing}
              className="gap-2"
            >
              {finishing ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Saving...</>
              ) : (
                <><Check className="h-4 w-4" />Finish & Save</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => goToPhase('refined')}
              disabled={finishing}
            >
              Back to Refine
            </Button>
          </div>
        </div>
      )}

      {/* ═══ PHASE 4: Done ═══ */}
      {phase === 'done' && (
        <div className="space-y-4">
          {existingAssets.length > 0 ? (
            <AssetGallery
              assets={existingAssets}
              draftStatus={draftStatus ?? ''}
              onDelete={(assetId) => {
                setExistingAssets((prev) => prev.filter((a) => a.id !== assetId));
              }}
            />
          ) : uploadedAssets.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Uploaded Images</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {uploadedAssets.map((asset) => (
                    <div key={asset.id} className="space-y-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.url}
                        alt={asset.altText}
                        className="w-full rounded-lg border object-cover aspect-video"
                      />
                      <Badge variant="outline" className="text-[10px]">{asset.slot}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                const allIds = [
                  ...existingAssets.map((a) => a.id),
                  ...uploadedAssets.map((a) => a.id),
                ];
                const featuredUrl =
                  existingAssets.find((a) => a.role === 'featured_image')?.url
                  ?? uploadedAssets.find((a) => a.slot === 'featured')?.url;
                onComplete({
                  assetIds: allIds,
                  featuredImageUrl: featuredUrl,
                } as AssetsResult);
              }}
              className="gap-2"
            >
              Continue to Publish
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setPhase('upload')}
            >
              Add More Images
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Slot Upload Card sub-component ── */

interface SlotUploadCardProps {
  card: SlotCard;
  visualDirection: VisualDirection | null;
  pendingPreview?: string;
  onFileUpload: (file: File) => void;
  onUrlUpload: (url: string) => void;
  onDelete: () => void;
}

function SlotUploadCard({ card, visualDirection, pendingPreview, onFileUpload, onUrlUpload, onDelete }: SlotUploadCardProps) {
  const [urlInput, setUrlInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      onFileUpload(file);
    } else {
      toast.error('Drop an image file');
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={card.slot === 'featured' ? 'default' : 'outline'} className="text-[10px]">
              {card.slot}
            </Badge>
            <span className="text-sm font-medium">{card.sectionTitle}</span>
            {pendingPreview && <Check className="h-4 w-4 text-green-500" />}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Prompt preview (collapsible) */}
        {expanded && (
          <div className="text-xs text-muted-foreground p-2 rounded bg-muted/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Prompt:</span>
              <Button
                variant="outline"
                size="sm"
                className="h-5 px-1.5 text-[10px] gap-1"
                onClick={() => {
                  const full = buildFullPrompt(card, visualDirection);
                  void navigator.clipboard.writeText(full);
                  toast.success(`Copied full prompt for ${card.slot}`);
                }}
              >
                <Copy className="h-3 w-3" />
                Copy Full Prompt
              </Button>
            </div>
            <div>{card.promptBrief}</div>
          </div>
        )}

        {pendingPreview ? (
          /* Image preview (staged, not yet saved) */
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingPreview}
              alt={card.sectionTitle}
              className="w-full max-h-48 rounded-lg border object-cover"
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
              Remove
            </Button>
          </div>
        ) : (
          /* Upload controls with drag-and-drop zone */
          <div
            className={`space-y-3 rounded-lg border-2 border-dashed p-3 transition-colors ${
              dragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/20'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {dragging ? (
              <div className="flex flex-col items-center justify-center py-4 gap-2 pointer-events-none">
                <Upload className="h-6 w-6 text-primary" />
                <span className="text-sm text-primary font-medium">Drop image here</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onFileUpload(file);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3 w-3" />
                    Upload File
                  </Button>
                  <span className="text-xs text-muted-foreground">or drag & drop</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="Paste image URL..."
                    className="text-xs h-8"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    disabled={!urlInput.trim()}
                    onClick={() => {
                      onUrlUpload(urlInput);
                      setUrlInput('');
                    }}
                  >
                    <Link2 className="h-3 w-3" />
                    Upload
                  </Button>
                </div>
              </>
            )}
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
