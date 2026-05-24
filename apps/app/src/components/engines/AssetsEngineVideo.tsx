'use client';

/**
 * AssetsEngineVideo — issue #213 / S6 (#219)
 *
 * Video-track read-only asset layout:
 * - Mode toggle (generate here / prompts-only) — persisted to draft_json.assetSettings.imageMode
 * - Thumbnail concept grid (draft_json.thumbnail_ideas)
 * - Per-chapter cards with b-roll prompts + lower-third (draft_json.script.chapters)
 * - Hook visual card (draft_json.thumbnail.facePromptHint)
 * - Text bundle: title, description, tags, pinned comment — each with a Copy button
 * - Generate/Regenerate buttons disabled with "Coming next" tooltip (S7)
 *
 * S6: imageMode persists to draft_json.assetSettings.imageMode via optimistic
 * PATCH on toggle flip. Revert + toast on failure.
 *
 * Prototype reference: apps/app/src/app/[locale]/(app)/prototype/video-engines/AssetsPanel.tsx
 * Labels translated from Portuguese to English.
 */

import { useState, useCallback } from 'react';
import { toast as sonnerToast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Image as ImageIcon,
  Sparkles,
  Copy,
  Wand2,
  Type,
  MessageSquare,
  Hash,
  FileText,
  Camera,
  GripVertical,
  ChevronDown,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ImageMode = 'generate' | 'prompts-only';

interface ThumbnailIdea {
  title: string;
  brief: string;
  mood?: string;
}

interface ScriptChapter {
  title: string;
  duration: string;
  broll?: string[];
  b_roll?: string[];
  b_roll_suggestions?: string[];
}

interface LowerThird {
  at: string;
  label: string;
}

interface Thumbnail {
  facePromptHint?: string;
  headline?: string;
}

interface VideoDraftJson {
  title_options?: string[];
  video_title?: string;
  video_description?: string;
  tags?: string[];
  pinned_comment?: string;
  thumbnail_ideas?: ThumbnailIdea[];
  thumbnail?: Thumbnail;
  lower_thirds?: LowerThird[];
  script?: {
    chapters?: ScriptChapter[];
  };
}

export interface AssetsEngineVideoProps {
  /**
   * draft_json from the content_drafts row — typed as unknown so callers
   * with Record<string,unknown> don't need a cast; narrowed internally.
   */
  draftJson: unknown;
  /**
   * ID of the content_draft row. Required for persisting imageMode via PATCH.
   * When absent, mode changes are local-only (no persistence).
   */
  draftId?: string;
  /**
   * Optional clipboard override — injected in tests since jsdom does not
   * implement navigator.clipboard. Defaults to navigator.clipboard.writeText.
   */
  onCopyText?: (text: string) => void;
  /**
   * Optional toast callback — injected in tests to capture error toasts.
   * In production, falls back to the `sonner` toast library.
   */
  onToast?: (message: string) => void;
}

const COMING_NEXT_TOOLTIP = 'Requires generate mode';

/** Shape of a generated image keyed by slot+index string like "thumbnail-0", "broll-0-1". */
type GeneratedImages = Record<string, string>; // slot-key → data URL

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the persisted imageMode from draft_json.assetSettings, or undefined. */
function readPersistedMode(draftJson: unknown): ImageMode | undefined {
  if (!draftJson || typeof draftJson !== 'object') return undefined;
  const obj = draftJson as Record<string, unknown>;
  const settings = obj['assetSettings'];
  if (!settings || typeof settings !== 'object') return undefined;
  const mode = (settings as Record<string, unknown>)['imageMode'];
  if (mode === 'generate' || mode === 'prompts-only') return mode;
  return undefined;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AssetsEngineVideo({ draftJson, draftId, onCopyText, onToast }: AssetsEngineVideoProps) {
  const draft = normalizeDraftJson(draftJson);

  // S6: read persisted mode from draft_json.assetSettings.imageMode; default prompts-only.
  // AssetsEngine passes key={localDraft ? draftId : 'pending'} so this component
  // remounts once the draft loads — at that point draftJson carries the real data
  // and the lazy initializer reads the persisted mode correctly.
  const [mode, setMode] = useState<ImageMode>(
    () => readPersistedMode(draftJson) ?? 'prompts-only',
  );

  // S7: per-concept generated image URLs, keyed by slot index string.
  const [generatedImages, setGeneratedImages] = useState<GeneratedImages>({});
  // S7: tracks which concepts are currently generating (to show loading state).
  const [generatingSlots, setGeneratingSlots] = useState<Set<string>>(new Set());

  function fireToast(message: string) {
    if (onToast) {
      onToast(message);
    } else {
      sonnerToast.error(message);
    }
  }

  async function handleModeChange(newMode: ImageMode) {
    const previous = mode;
    // Optimistic update
    setMode(newMode);

    if (!draftId) return;

    try {
      const res = await fetch(`/api/content-drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetSettings: { imageMode: newMode } }),
      });
      const body = (await res.json()) as { data: unknown; error: unknown };
      if (!res.ok || body.error) {
        // Revert on failure
        setMode(previous);
        fireToast('Could not save image mode. Please try again.');
      }
    } catch {
      setMode(previous);
      fireToast('Could not save image mode. Please try again.');
    }
  }

  function handleCopy(text: string) {
    if (onCopyText) {
      onCopyText(text);
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => undefined);
    }
  }

  // S7: Regenerate a single concept image by calling POST /api/assets/generate/video.
  const handleRegenerate = useCallback(async (slotKey: string, slot: 'thumbnail' | 'broll' | 'hook', prompt: string, chapterIndex?: number) => {
    if (!draftId || mode !== 'generate') return;

    setGeneratingSlots((prev) => {
      const next = new Set(prev);
      next.add(slotKey);
      return next;
    });

    function showError(message: string) {
      if (onToast) {
        onToast(message);
      } else {
        sonnerToast.error(message);
      }
    }

    try {
      const res = await fetch('/api/assets/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId,
          slot,
          prompt,
          chapterIndex,
          mode: 'generate',
        }),
      });
      const body = (await res.json()) as { data: { imageUrl?: string }; error: { message?: string } | null };
      if (!res.ok || body.error) {
        showError(body.error?.message ?? 'Image generation failed. Please try again.');
      } else if (body.data.imageUrl) {
        setGeneratedImages((prev) => ({ ...prev, [slotKey]: body.data.imageUrl as string }));
      }
    } catch {
      showError('Image generation failed. Please try again.');
    } finally {
      setGeneratingSlots((prev) => {
        const next = new Set(prev);
        next.delete(slotKey);
        return next;
      });
    }
  }, [draftId, mode, onToast]);

  const primaryTitle = draft.video_title ?? draft.title_options?.[0] ?? '';
  const altTitles = draft.title_options?.slice(primaryTitle === draft.video_title ? 0 : 1) ?? [];

  return (
    <div className="space-y-5">
      {/* Header with mode toggle */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Asset bundle</h1>
          <p className="text-xs text-muted-foreground">
            Everything that ships to your editor + YouTube. Images follow the selected mode;
            text is always generated here.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Generate all button — disabled when mode is prompts-only */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mode === 'prompts-only'}
                    data-testid="video-assets-generate-btn"
                    className="gap-1.5 text-xs"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate all
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {mode === 'prompts-only' ? COMING_NEXT_TOOLTIP : 'Generate all images'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* sr-only span for reliable test assertion (Radix portal workaround) */}
          <span
            className="sr-only"
            data-testid="video-assets-generate-tooltip-text"
          >
            {mode === 'prompts-only' ? COMING_NEXT_TOOLTIP : 'Generate all images'}
          </span>

          <ModeToggle mode={mode} onChange={handleModeChange} />
        </div>
      </header>

      {/* Thumbnail concepts grid */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> Thumbnail
            <Badge variant="outline" className="ml-auto text-[10px]">
              {draft.thumbnail_ideas?.length ?? 0} concepts
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-3"
            data-testid="video-assets-thumbnail-grid"
          >
            {(draft.thumbnail_ideas ?? []).map((t, i) => {
              const slotKey = `thumbnail-${i}`;
              return (
                <ImageConcept
                  key={i}
                  mode={mode}
                  title={t.title}
                  mood={t.mood}
                  brief={t.brief}
                  selected={i === 0}
                  onCopyText={handleCopy}
                  generatedImageUrl={generatedImages[slotKey]}
                  isGenerating={generatingSlots.has(slotKey)}
                  onRegenerate={() => handleRegenerate(slotKey, 'thumbnail', t.brief)}
                  regenerateTestId={`video-assets-regenerate-${slotKey}`}
                  generatedImageTestId={`video-assets-generated-image-${slotKey}`}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Per-chapter cards */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Camera className="h-4 w-4" /> Chapters · B-roll + lower thirds
            <Badge variant="outline" className="ml-auto text-[10px]">
              {draft.script?.chapters?.length ?? 0} chapters
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="overflow-x-auto -mx-1 px-1 pb-2"
            data-testid="video-assets-chapters"
          >
            <div className="flex items-stretch gap-3 min-w-max">
              {(draft.script?.chapters ?? []).map((ch, i) => (
                <ChapterCard
                  key={i}
                  mode={mode}
                  index={i + 1}
                  title={ch.title}
                  duration={ch.duration}
                  brollPrompts={ch.broll ?? ch.b_roll ?? ch.b_roll_suggestions ?? []}
                  lowerThird={draft.lower_thirds?.[i]?.label ?? ''}
                  lowerThirdAt={draft.lower_thirds?.[i]?.at ?? ''}
                  onCopyText={handleCopy}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hook visual */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wand2 className="h-4 w-4" /> Hook visual (first 3 seconds)
          </CardTitle>
        </CardHeader>
        <CardContent data-testid="video-assets-hook">
          <ImageConcept
            mode={mode}
            title="Opening frame"
            mood="Pattern interrupt"
            brief={draft.thumbnail?.facePromptHint ?? ''}
            onCopyText={handleCopy}
            generatedImageUrl={generatedImages['hook-0']}
            isGenerating={generatingSlots.has('hook-0')}
            onRegenerate={() => handleRegenerate('hook-0', 'hook', draft.thumbnail?.facePromptHint ?? '')}
            regenerateTestId="video-assets-regenerate-hook-0"
            generatedImageTestId="video-assets-generated-image-hook-0"
          />
        </CardContent>
      </Card>

      {/* Text bundle */}
      <section
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
        data-testid="video-assets-text-bundle"
      >
        <TextBlock
          icon={<Type className="h-4 w-4" />}
          title="Video title"
          body={primaryTitle}
          alternatives={altTitles}
          testId="video-assets-text-title"
          copyTestId="video-assets-copy-title"
          onCopy={handleCopy}
        />
        <TextBlock
          icon={<Hash className="h-4 w-4" />}
          title="Tags"
          body={(draft.tags ?? []).join(', ')}
          tagged
          testId="video-assets-text-tags"
          copyTestId="video-assets-copy-tags"
          onCopy={handleCopy}
        />
        <TextBlock
          icon={<FileText className="h-4 w-4" />}
          title="Description (with chapters)"
          body={draft.video_description ?? ''}
          big
          testId="video-assets-text-description"
          copyTestId="video-assets-copy-description"
          onCopy={handleCopy}
        />
        <TextBlock
          icon={<MessageSquare className="h-4 w-4" />}
          title="Pinned comment"
          body={draft.pinned_comment ?? ''}
          testId="video-assets-text-pinned-comment"
          copyTestId="video-assets-copy-pinned-comment"
          onCopy={handleCopy}
        />
      </section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: ImageMode; onChange: (m: ImageMode) => void }) {
  return (
    <div
      className="inline-flex rounded-full border bg-muted p-0.5 text-xs"
      data-testid="video-assets-mode-toggle"
      data-mode={mode}
    >
      <button
        type="button"
        aria-label="Generate here"
        onClick={() => onChange('generate')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition ${
          mode === 'generate' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'
        }`}
      >
        <Sparkles className="h-3.5 w-3.5" /> Generate here
      </button>
      <button
        type="button"
        aria-label="Prompts only"
        onClick={() => onChange('prompts-only')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition ${
          mode === 'prompts-only' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'
        }`}
      >
        <Copy className="h-3.5 w-3.5" /> Prompts only
      </button>
    </div>
  );
}

function ImageConcept({
  mode,
  title,
  mood,
  brief,
  selected,
  onCopyText,
  generatedImageUrl,
  isGenerating,
  onRegenerate,
  regenerateTestId,
  generatedImageTestId,
}: {
  mode: ImageMode;
  title: string;
  mood?: string;
  brief: string;
  selected?: boolean;
  onCopyText: (text: string) => void;
  generatedImageUrl?: string;
  isGenerating?: boolean;
  onRegenerate?: () => void;
  regenerateTestId?: string;
  generatedImageTestId?: string;
}) {
  if (mode === 'prompts-only') {
    return (
      <div className="rounded border p-3 space-y-2 bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">{title}</p>
          {selected && <Badge className="text-[10px]">selected</Badge>}
        </div>
        {mood && (
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{mood}</p>
        )}
        <Textarea defaultValue={brief} rows={3} className="font-mono text-[11px]" />
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 w-full text-xs"
          onClick={() => onCopyText(brief)}
        >
          <Copy className="h-3 w-3" /> Copy prompt
        </Button>
      </div>
    );
  }

  // generate mode — show generated image if available, else placeholder
  return (
    <figure className="space-y-1.5">
      <div
        className={`aspect-video rounded border relative overflow-hidden ${selected ? 'ring-2 ring-primary' : ''}`}
      >
        {generatedImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={generatedImageUrl}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover"
            data-testid={generatedImageTestId}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-rose-900 text-white flex items-center justify-center text-xs font-bold p-2 text-center">
            {isGenerating ? (
              <span className="animate-pulse">Generating…</span>
            ) : (
              title
            )}
          </div>
        )}
        {selected && !generatedImageUrl && (
          <Badge className="absolute top-1 right-1 text-[9px]">selected</Badge>
        )}
      </div>
      <figcaption className="text-[11px] text-muted-foreground line-clamp-2">{brief}</figcaption>
      <div className="flex gap-1">
        {/* S7: Regenerate button — enabled in generate mode */}
        <Button
          size="sm"
          variant="ghost"
          disabled={isGenerating}
          className="h-7 text-xs flex-1 gap-1"
          data-testid={regenerateTestId}
          onClick={onRegenerate}
        >
          <Sparkles className="h-3 w-3" />
          {isGenerating ? 'Generating…' : 'Regenerate'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs flex-1 gap-1"
          onClick={() => onCopyText(brief)}
        >
          <Copy className="h-3 w-3" /> Prompt
        </Button>
      </div>
    </figure>
  );
}

function ChapterCard({
  mode,
  index,
  title,
  duration,
  brollPrompts,
  lowerThird,
  lowerThirdAt,
  onCopyText,
}: {
  mode: ImageMode;
  index: number;
  title: string;
  duration: string;
  brollPrompts: string[];
  lowerThird: string;
  lowerThirdAt: string;
  onCopyText: (text: string) => void;
}) {
  return (
    <Card className="w-[280px] shrink-0">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">
            CH {index}
          </Badge>
          <span className="flex items-center gap-1">
            <GripVertical className="h-3 w-3" /> {duration}
          </span>
        </div>
        <p className="text-xs font-medium leading-snug line-clamp-2">{title}</p>

        {/* B-roll */}
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            B-roll · {brollPrompts.length}
          </p>
          {brollPrompts.slice(0, 2).map((b, i) => (
            <div key={i} className="rounded border bg-muted/30 p-1.5 space-y-1">
              {mode === 'generate' && (
                <div className="aspect-video rounded bg-gradient-to-br from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center">
                  <Camera className="h-4 w-4 opacity-50" />
                </div>
              )}
              <p className="text-[10px] text-muted-foreground line-clamp-2">{b}</p>
              <button
                type="button"
                className="text-[10px] text-primary hover:underline w-full text-left flex items-center gap-1"
                onClick={() => onCopyText(b)}
              >
                <Copy className="h-2.5 w-2.5" /> {mode === 'generate' ? 'copy prompt' : 'copy'}
              </button>
            </div>
          ))}
        </div>

        {/* Lower third */}
        {lowerThird && (
          <div className="rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2 py-1.5 space-y-0.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-mono">{lowerThirdAt}</span>
              <span className="uppercase tracking-wider opacity-70">lower third</span>
            </div>
            <p className="text-[11px] font-medium">{lowerThird}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TextBlock({
  icon,
  title,
  body,
  alternatives,
  tagged,
  big,
  testId,
  copyTestId,
  onCopy,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  alternatives?: string[];
  tagged?: boolean;
  big?: boolean;
  testId: string;
  copyTestId: string;
  onCopy: (text: string) => void;
}) {
  return (
    <Card className={big ? 'md:col-span-2' : ''} data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon}
          {title}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1 text-xs"
            data-testid={copyTestId}
            onClick={() => onCopy(body)}
          >
            <Copy className="h-3 w-3" /> Copy
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {tagged ? (
          <div className="flex flex-wrap gap-1">
            {body.split(',').map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">
                #{t.trim()}
              </Badge>
            ))}
          </div>
        ) : (
          <Textarea defaultValue={body} rows={big ? 8 : 3} className="text-xs" />
        )}
        {alternatives && alternatives.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
              <ChevronDown className="h-3 w-3" /> {alternatives.length} alternatives
            </summary>
            <ul className="mt-1.5 space-y-1">
              {alternatives.map((alt) => (
                <li
                  key={alt}
                  className="rounded border px-2 py-1 hover:bg-muted cursor-pointer text-[11px]"
                >
                  {alt}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeDraftJson(raw: unknown): Partial<VideoDraftJson> {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  // Unwrap nested draft_json wrapper if present
  if (typeof obj.draft_json === 'object' && obj.draft_json !== null) {
    return normalizeDraftJson(obj.draft_json);
  }
  return obj as Partial<VideoDraftJson>;
}
