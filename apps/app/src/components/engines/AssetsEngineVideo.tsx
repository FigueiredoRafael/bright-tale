'use client';

/**
 * AssetsEngineVideo — issue #213
 *
 * Video-track read-only asset layout:
 * - Mode toggle (generate here / prompts-only) — local state only, defaults to prompts-only
 * - Thumbnail concept grid (draft_json.thumbnail_ideas)
 * - Per-chapter cards with b-roll prompts + lower-third (draft_json.script.chapters)
 * - Hook visual card (draft_json.thumbnail.facePromptHint)
 * - Text bundle: title, description, tags, pinned comment — each with a Copy button
 * - Generate/Regenerate buttons disabled with "Coming next" tooltip (S6/S7)
 *
 * Prototype reference: apps/app/src/app/[locale]/(app)/prototype/video-engines/AssetsPanel.tsx
 * Labels translated from Portuguese to English.
 */

import { useState } from 'react';
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
   * Optional clipboard override — injected in tests since jsdom does not
   * implement navigator.clipboard. Defaults to navigator.clipboard.writeText.
   */
  onCopyText?: (text: string) => void;
}

const COMING_NEXT_TOOLTIP = 'Coming next — image generation lands in S6/S7';

// ── Component ─────────────────────────────────────────────────────────────────

export function AssetsEngineVideo({ draftJson, onCopyText }: AssetsEngineVideoProps) {
  const [mode, setMode] = useState<ImageMode>('prompts-only');

  const draft = normalizeDraftJson(draftJson);

  function handleCopy(text: string) {
    if (onCopyText) {
      onCopyText(text);
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => undefined);
    }
  }

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
          {/* Disabled generate button with tooltip */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    data-testid="video-assets-generate-btn"
                    className="gap-1.5 text-xs"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate all
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {COMING_NEXT_TOOLTIP}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* sr-only span for reliable test assertion (Radix portal workaround) */}
          <span
            className="sr-only"
            data-testid="video-assets-generate-tooltip-text"
          >
            {COMING_NEXT_TOOLTIP}
          </span>

          <ModeToggle mode={mode} onChange={setMode} />
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
            {(draft.thumbnail_ideas ?? []).map((t, i) => (
              <ImageConcept
                key={i}
                mode={mode}
                title={t.title}
                mood={t.mood}
                brief={t.brief}
                selected={i === 0}
                onCopyText={handleCopy}
              />
            ))}
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
}: {
  mode: ImageMode;
  title: string;
  mood?: string;
  brief: string;
  selected?: boolean;
  onCopyText: (text: string) => void;
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

  // generate mode — placeholder preview
  return (
    <figure className="space-y-1.5">
      <div
        className={`aspect-video rounded border relative overflow-hidden ${selected ? 'ring-2 ring-primary' : ''}`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-rose-900 text-white flex items-center justify-center text-xs font-bold p-2 text-center">
          {title}
        </div>
        {selected && (
          <Badge className="absolute top-1 right-1 text-[9px]">selected</Badge>
        )}
      </div>
      <figcaption className="text-[11px] text-muted-foreground line-clamp-2">{brief}</figcaption>
      <div className="flex gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex-1">
                <Button size="sm" variant="ghost" disabled className="h-7 text-xs w-full gap-1">
                  <Sparkles className="h-3 w-3" /> Regenerate
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{COMING_NEXT_TOOLTIP}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
