'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2, ArrowRight, Eye, X, Plus, ImageIcon, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSelector } from '@xstate/react';
import { usePipelineActor } from '@/hooks/usePipelineActor';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { usePipelineAbort } from '@/components/pipeline/PipelineAbortProvider';
import { ContextBanner } from './ContextBanner';
import { markdownToHtml } from '@/lib/utils';
import { derivePreview } from '@/lib/pipeline/derivePreview';
import type { PipelineContext, PipelineStage, PreviewResult } from './types';

interface ContentAsset {
  id: string;
  source_url: string | null;
  webp_url: string | null;
  alt_text: string | null;
  role: string | null;
}

interface ImageSlot {
  role: string;
  sectionTitle: string;
  index: number;
}

interface DraftData {
  id: string;
  title: string | null;
  draft_json: Record<string, unknown> | null;
  review_feedback_json: Record<string, unknown> | null;
}

/* ── Helpers ── */

function extractOutlineFromDraft(draftJson: Record<string, unknown> | null): string[] {
  if (!draftJson || typeof draftJson !== 'object') return [];

  // Try blog-specific structure first, then direct
  const sources = [
    draftJson.blog && typeof draftJson.blog === 'object'
      ? (draftJson.blog as Record<string, unknown>).outline
      : undefined,
    draftJson.outline,
  ];

  for (const outline of sources) {
    if (!outline) continue;

    // Array of objects: [{ h2: "...", key_points: [...] }]
    if (Array.isArray(outline)) {
      const headings: string[] = [];
      for (const item of outline) {
        if (item && typeof item === 'object') {
          const h2 = (item as Record<string, unknown>).h2;
          if (typeof h2 === 'string') headings.push(h2);
        }
      }
      if (headings.length > 0) return headings;
    }

    // Markdown string with ## headings
    if (typeof outline === 'string') {
      const headings: string[] = [];
      for (const line of outline.split('\n')) {
        const match = line.match(/^#{2}\s+(.+)$/);
        if (match) headings.push(match[1]);
      }
      if (headings.length > 0) return headings;
    }
  }

  // Fallback: extract H2s directly from full_draft markdown
  const fullDraft = extractFullDraft(draftJson);
  if (fullDraft) {
    const headings: string[] = [];
    for (const line of fullDraft.split('\n')) {
      const match = line.match(/^#{2}\s+(.+)$/);
      if (match) headings.push(match[1]);
    }
    if (headings.length > 0) return headings;
  }

  return [];
}

function extractFullDraft(draftJson: Record<string, unknown> | null): string {
  if (!draftJson || typeof draftJson !== 'object') return '';

  // Try blog-specific structure
  if (draftJson.blog && typeof draftJson.blog === 'object') {
    const fullDraft = (draftJson.blog as Record<string, unknown>).full_draft;
    if (typeof fullDraft === 'string') return fullDraft;
  }

  // Try direct full_draft field
  const fullDraft = draftJson.full_draft as unknown;
  if (typeof fullDraft === 'string') return fullDraft;

  return '';
}

// extractPublicationPlan has been extracted to @/lib/pipeline/derivePreview as derivePreview().

function buildImageSlots(outlineHeadings: string[]): ImageSlot[] {
  const slots: ImageSlot[] = [
    {
      role: 'featured_image',
      sectionTitle: 'Featured Image',
      index: -1,
    },
  ];

  for (let i = 0; i < outlineHeadings.length; i++) {
    slots.push({
      role: `body_section_${i + 1}`,
      sectionTitle: outlineHeadings[i] || `Section ${i + 1}`,
      index: i,
    });
  }

  return slots;
}

function composedHtmlFromMarkdown(
  markdown: string,
  imageMap: Record<string, string>,
  assets: Map<string, ContentAsset>,
): string {
  let html = markdownToHtml(markdown);

  // Insert featured image at the top if available
  if (imageMap.featured_image && assets.has(imageMap.featured_image)) {
    const asset = assets.get(imageMap.featured_image)!;
    const imgUrl = asset.webp_url ?? asset.source_url ?? '';
    const altText = asset.alt_text ?? 'Featured image';
    const featuredImg = `<figure style="margin: 2rem 0;"><img src="${imgUrl}" alt="${altText}" style="width: 100%; max-width: 800px; border-radius: 8px;" /><figcaption style="font-size: 0.875rem; color: #666; margin-top: 0.5rem;">${altText}</figcaption></figure>`;
    html = featuredImg + html;
  }

  // Insert body section images after h2 tags (1-indexed to match asset roles)
  const h2Regex = /<h2[^>]*>([^<]+)<\/h2>/g;
  let h2Index = 0;
  html = html.replace(h2Regex, (match) => {
    h2Index += 1;
    const slotRole = `body_section_${h2Index}`;
    const result = match;

    const assetId = imageMap[slotRole];
    if (assetId && assets.has(assetId)) {
      const asset = assets.get(assetId)!;
      const imgUrl = asset.webp_url ?? asset.source_url ?? '';
      const altText = asset.alt_text ?? 'Section image';
      const sectionImg = `<figure style="margin: 1.5rem 0;"><img src="${imgUrl}" alt="${altText}" style="width: 100%; max-width: 800px; border-radius: 8px;" /><figcaption style="font-size: 0.875rem; color: #666; margin-top: 0.5rem;">${altText}</figcaption></figure>`;
      return result + sectionImg;
    }

    return result;
  });

  return html;
}

/* ── Component ── */

/* PreviewEngine reads everything from the pipeline actor — no pipeline-state props.
 * The component is rendered by PipelineOrchestrator only; standalone usage would
 * require <StandaloneEngineHost stage="preview"> like ReviewEngine/AssetsEngine. */
export function PreviewEngine() {
  const actor = usePipelineActor();
  const abortController = usePipelineAbort();
  const channelId = useSelector(actor, (s) => s.context.channelId);
  const projectId = useSelector(actor, (s) => s.context.projectId);
  const brainstormResult = useSelector(actor, (s) => s.context.stageResults.brainstorm);
  const researchResult  = useSelector(actor, (s) => s.context.stageResults.research);
  const draftResult     = useSelector(actor, (s) => s.context.stageResults.draft);
  const reviewResult    = useSelector(actor, (s) => s.context.stageResults.review);
  const assetsResult    = useSelector(actor, (s) => s.context.stageResults.assets);
  const draftId = draftResult?.draftId ?? '';

  // Overview-mode / autopilot selectors
  const overviewMode = useSelector(actor, (s) => s.context.mode === 'overview');
  const previewEnabled = useSelector(actor, (s) => s.context.autopilotConfig?.preview?.enabled);

  const trackerContext: PipelineContext = {
    channelId: channelId ?? undefined,
    projectId,
    ideaId: brainstormResult?.ideaId,
    ideaTitle: brainstormResult?.ideaTitle,
    ideaVerdict: brainstormResult?.ideaVerdict,
    ideaCoreTension: brainstormResult?.ideaCoreTension,
    brainstormSessionId: brainstormResult?.brainstormSessionId,
    researchSessionId: researchResult?.researchSessionId,
    researchLevel: researchResult?.researchLevel,
    researchPrimaryKeyword: researchResult?.primaryKeyword,
    researchSecondaryKeywords: researchResult?.secondaryKeywords,
    researchSearchIntent: researchResult?.searchIntent,
    draftId,
    draftTitle: draftResult?.draftTitle,
    personaId: draftResult?.personaId,
    personaName: draftResult?.personaName,
    personaSlug: draftResult?.personaSlug,
    personaWpAuthorId: draftResult?.personaWpAuthorId,
    reviewScore: reviewResult?.score,
    reviewVerdict: reviewResult?.verdict,
    assetIds: assetsResult?.assetIds,
    featuredImageUrl: assetsResult?.featuredImageUrl,
  };

  function navigate(toStage?: PipelineStage) {
    actor.send({ type: 'NAVIGATE', toStage: toStage ?? 'assets' });
  }

  // Fetch state
  const [busy, setBusy] = useState(true);
  const [draft, setDraft] = useState<DraftData | null>(null);
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tracker = usePipelineTracker('preview', trackerContext);

  // Draft data
  const [markdown, setMarkdown] = useState('');
  const [outlineHeadings, setOutlineHeadings] = useState<string[]>([]);

  // Publication plan from feedback
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoSlug, setSeoSlug] = useState('');
  const [seoMetaDesc, setSeoMetaDesc] = useState('');
  const [publishDate, setPublishDate] = useState('');

  // Image assignment
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  const [altTexts, setAltTexts] = useState<Record<string, string>>({});

  // New category/tag inputs
  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');

  // Load draft, assets, and feedback data
  useEffect(() => {
    (async () => {
      try {
        setBusy(true);
        setLoadError(null);

        // Fetch draft
        const draftRes = await fetch(`/api/content-drafts/${draftId}`, {
          signal: abortController?.signal,
        });
        const draftJson = await draftRes.json();
        if (draftJson?.error) {
          setLoadError(draftJson.error.message ?? 'Failed to load draft');
          setBusy(false);
          return;
        }

        const draftData = draftJson.data as DraftData;
        setDraft(draftData);

        // Extract markdown and outline
        const fullDraft = extractFullDraft(draftData.draft_json);
        const headings = extractOutlineFromDraft(draftData.draft_json);
        setMarkdown(fullDraft);
        setOutlineHeadings(headings);

        // Build image slots
        const slots = buildImageSlots(headings);
        setImageSlots(slots);

        // Use server-side resolved SEO defaults when available, otherwise fall back to client extraction
        const resolvedSeo = (draftData as unknown as Record<string, unknown>).resolved_seo as {
          title: string; slug: string; meta_description: string;
          primary_keyword: string; secondary_keywords: string[];
          categories: string[]; tags: string[];
        } | undefined;

        if (resolvedSeo) {
          setCategories(resolvedSeo.categories);
          setTags(resolvedSeo.tags);
          setSeoTitle(resolvedSeo.title);
          setSeoSlug(resolvedSeo.slug);
          setSeoMetaDesc(resolvedSeo.meta_description);
        } else {
          const pubPlan = derivePreview(draftData.review_feedback_json, []);
          const dj = draftData.draft_json as Record<string, unknown> | null;
          const djBlog = (dj?.blog ?? dj) as Record<string, unknown> | undefined;

          setCategories(pubPlan.categories.length > 0 ? pubPlan.categories : []);
          setTags(pubPlan.tags.length > 0 ? pubPlan.tags : []);
          setSeoTitle(
            pubPlan.seo.title
            || draftData.title
            || (djBlog?.title as string)
            || ''
          );
          setSeoSlug(
            pubPlan.seo.slug
            || (djBlog?.slug as string)
            || (dj?.slug as string)
            || ''
          );
          setSeoMetaDesc(
            pubPlan.seo.meta_description
            || pubPlan.seo.metaDescription
            || (djBlog?.meta_description as string)
            || (dj?.meta_description as string)
            || ''
          );
        }

        const pubPlan = derivePreview(draftData.review_feedback_json, []);
        setPublishDate(pubPlan.publishDate ?? '');

        // Fetch assets
        const assetsRes = await fetch(`/api/assets?content_id=${draftId}`, {
          signal: abortController?.signal,
        });
        const assetsJson = await assetsRes.json();
        if (assetsJson?.error) {
          setLoadError(assetsJson.error.message ?? 'Failed to load assets');
          setBusy(false);
          return;
        }

        const assetList = (assetsJson.data?.assets ?? []) as ContentAsset[];
        setAssets(assetList);

        // Auto-assign assets by role
        const newImageMap: Record<string, string> = {};
        const newAltTexts: Record<string, string> = {};

        for (const slot of slots) {
          // Find asset with matching role
          const matchingAsset = assetList.find((a) => a.role === slot.role);
          if (matchingAsset) {
            newImageMap[slot.role] = matchingAsset.id;
            newAltTexts[matchingAsset.id] = matchingAsset.alt_text ?? '';
          }
        }

        setImageMap(newImageMap);
        setAltTexts(newAltTexts);

        setBusy(false);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoadError(err instanceof Error ? err.message : 'Unknown error');
        setBusy(false);
      }
    })();
  }, [draftId, abortController?.signal]);

  // ── Overview-mode auto-derive gate ─────────────────────────────────────────
  // Fires exactly once after data is loaded (busy=false, draft≠null).
  //   preview.enabled=true  → gate user in via PREVIEW_GATE_TRIGGERED
  //   preview.enabled=false → derive metadata immediately, fire PREVIEW_COMPLETE
  const initialBehaviorRef = useRef(false);
  useEffect(() => {
    if (initialBehaviorRef.current) return;
    if (!overviewMode) return;
    if (busy || draft === null) return;

    initialBehaviorRef.current = true;

    if (previewEnabled === true) {
      actor.send({ type: 'STAGE_PROGRESS', stage: 'preview', partial: { status: 'Awaiting your review' } });
      actor.send({ type: 'PREVIEW_GATE_TRIGGERED' });
      return;
    }

    actor.send({ type: 'STAGE_PROGRESS', stage: 'preview', partial: { status: 'Composing preview' } });
    // Auto-derive path: build a full PreviewResult from feedback + loaded assets.
    const feedbackJson = reviewResult?.feedbackJson ?? null;
    const derivedMeta = derivePreview(feedbackJson, assets);

    // Build imageMap and altTexts from auto-assigned assets (role → id).
    const autoImageMap: Record<string, string> = {};
    const autoAltTexts: Record<string, string> = {};
    for (const asset of assets) {
      if (asset.role) {
        autoImageMap[asset.role] = asset.id;
        autoAltTexts[asset.id] = asset.alt_text ?? '';
      }
    }

    const result: PreviewResult = {
      imageMap: autoImageMap,
      altTexts: autoAltTexts,
      categories: derivedMeta.categories,
      tags: derivedMeta.tags,
      seoOverrides: {
        title: derivedMeta.seo.title ?? draftResult?.draftTitle ?? '',
        slug: derivedMeta.seo.slug ?? '',
        metaDescription: derivedMeta.seo.meta_description ?? derivedMeta.seo.metaDescription ?? '',
      },
      suggestedPublishDate: derivedMeta.publishDate ?? undefined,
      // composedHtml is omitted for auto-derived results (no UI render needed)
      composedHtml: '',
      autoDerived: true,
    };

    actor.send({ type: 'PREVIEW_COMPLETE', result });
  }, [overviewMode, previewEnabled, busy, draft, actor, assets, reviewResult, draftResult]);

  // Build asset map for quick lookup
  const assetMap = useMemo(() => {
    const map = new Map<string, ContentAsset>();
    for (const asset of assets) {
      map.set(asset.id, asset);
    }
    return map;
  }, [assets]);

  // Compose live preview HTML
  const composedHtml = useMemo(() => {
    return composedHtmlFromMarkdown(markdown, imageMap, assetMap);
  }, [markdown, imageMap, assetMap]);

  // Handlers
  const handleAssignImage = (slotRole: string, assetId: string | undefined) => {
    const newMap = { ...imageMap };
    if (assetId) {
      newMap[slotRole] = assetId;
    } else {
      delete newMap[slotRole];
    }
    setImageMap(newMap);
  };

  const handleUpdateAltText = (assetId: string, altText: string) => {
    setAltTexts((prev) => ({ ...prev, [assetId]: altText }));
  };

  const handleAddCategory = () => {
    if (newCategory.trim()) {
      setCategories((prev) => [...prev, newCategory.trim()]);
      setNewCategory('');
    }
  };

  const handleRemoveCategory = (idx: number) => {
    setCategories((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddTag = () => {
    if (newTag.trim()) {
      setTags((prev) => [...prev, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (idx: number) => {
    setTags((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleApprove = () => {
    // Build result
    const result: PreviewResult = {
      imageMap,
      altTexts,
      categories,
      tags,
      seoOverrides: {
        title: seoTitle,
        slug: seoSlug,
        metaDescription: seoMetaDesc,
      },
      suggestedPublishDate: publishDate || undefined,
      composedHtml,
    };

    tracker.trackCompleted({
      draftId,
      imageMap,
      categories,
      tags,
      seoOverrides: result.seoOverrides,
    });

    actor.send({ type: 'PREVIEW_COMPLETE', result });
  };

  /* ── Render ── */

  if (loadError) {
    return (
      <div className="space-y-4">
        <ContextBanner stage="preview" context={trackerContext} onBack={navigate} />
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Error Loading Preview</p>
                <p className="text-sm text-muted-foreground mt-1">{loadError}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (busy || !draft) {
    return (
      <div className="space-y-4">
        <ContextBanner stage="preview" context={trackerContext} onBack={navigate} />
        <Card>
          <CardContent className="pt-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading preview data...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ContextBanner stage="preview" context={trackerContext} onBack={navigate} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Panel: Live Preview (larger) */}
        <div className="lg:col-span-3">
          <Card className="sticky top-4">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                Live Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 px-6">
              <div
                className="prose prose-sm max-w-none dark:prose-invert overflow-y-auto max-h-[80vh] pr-2 [&_img]:rounded-lg [&_img]:my-4 [&_figure]:my-4 [&_figcaption]:text-center [&_figcaption]:text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: composedHtml }}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Panel: Controls (compact) */}
        <div className="lg:col-span-2 space-y-4">

          {/* Image Assignments — compact cards */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Images
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {imageSlots.map((slot) => {
                const assignedAssetId = imageMap[slot.role];
                const assignedAsset = assignedAssetId ? assetMap.get(assignedAssetId) : null;
                const isFeatured = slot.role === 'featured_image';

                return (
                  <div key={slot.role} className={`rounded-lg border p-2 space-y-1.5 ${isFeatured ? 'border-primary/30 bg-primary/5' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={isFeatured ? 'default' : 'secondary'} className="text-[9px] shrink-0 px-1.5">
                        {isFeatured ? 'Featured' : `S${slot.index + 1}`}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground line-clamp-1">{slot.sectionTitle}</span>
                    </div>

                    <div className="flex gap-2 items-start">
                      <div className="h-10 w-14 rounded bg-muted shrink-0 overflow-hidden">
                        {assignedAsset?.source_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={assignedAsset.webp_url ?? assignedAsset.source_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <ImageIcon className="h-3 w-3 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <Select
                          value={assignedAssetId ?? '__none__'}
                          onValueChange={(val) => handleAssignImage(slot.role, val === '__none__' ? undefined : val)}
                        >
                          <SelectTrigger className="text-[11px] h-6">
                            <SelectValue placeholder="Select image..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No image</SelectItem>
                            {assets.map((asset) => (
                              <SelectItem key={asset.id} value={asset.id}>
                                {asset.role?.replace(/_/g, ' ') ?? asset.alt_text ?? asset.id.slice(0, 8)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {assignedAssetId && (
                          <Input
                            className="text-[11px] h-6"
                            value={altTexts[assignedAssetId] ?? ''}
                            onChange={(e) => handleUpdateAltText(assignedAssetId, e.target.value)}
                            placeholder="Alt text..."
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Categories + Tags — single card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Taxonomy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Categories */}
              <div>
                <Label className="text-xs text-muted-foreground">Categories</Label>
                <div className="flex flex-wrap gap-1 mt-1 min-h-[22px]">
                  {categories.length === 0 && (
                    <span className="text-[10px] text-muted-foreground/50 italic">No categories — add below</span>
                  )}
                  {categories.map((cat, idx) => (
                    <Badge key={idx} variant="secondary" className="gap-1 pr-1 text-[10px]">
                      {cat}
                      <button onClick={() => handleRemoveCategory(idx)} className="hover:opacity-70">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  <Input
                    className="text-xs h-7"
                    placeholder="Add category..."
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  />
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 shrink-0" onClick={handleAddCategory} disabled={!newCategory.trim()}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {/* Tags */}
              <div>
                <Label className="text-xs text-muted-foreground">Tags</Label>
                <div className="flex flex-wrap gap-1 mt-1 min-h-[22px]">
                  {tags.length === 0 && (
                    <span className="text-[10px] text-muted-foreground/50 italic">No tags — add below</span>
                  )}
                  {tags.map((tag, idx) => (
                    <Badge key={idx} variant="outline" className="gap-1 pr-1 text-[10px]">
                      {tag}
                      <button onClick={() => handleRemoveTag(idx)} className="hover:opacity-70">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  <Input
                    className="text-xs h-7"
                    placeholder="Add tag..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  />
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 shrink-0" onClick={handleAddTag} disabled={!newTag.trim()}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SEO + Publish Date — single card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">SEO & Publishing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div>
                <Label className="text-xs text-muted-foreground">Title</Label>
                <Input className="text-xs h-7 mt-0.5" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder="SEO title..." />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Slug</Label>
                <Input className="text-xs h-7 mt-0.5" value={seoSlug} onChange={(e) => setSeoSlug(e.target.value)} placeholder="url-slug..." />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Meta Description</Label>
                <Textarea className="text-xs mt-0.5 min-h-14" value={seoMetaDesc} onChange={(e) => setSeoMetaDesc(e.target.value)} placeholder="Meta description..." />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Publish Date</Label>
                <Input className="text-xs h-7 mt-0.5" type="datetime-local" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-2 sticky bottom-4">
            <Button variant="outline" onClick={() => navigate('assets')} size="sm">
              Back
            </Button>
            <Button onClick={handleApprove} size="sm" className="flex-1 gap-2">
              Approve & Publish <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
