'use client';

import { useEffect, useMemo, useState } from 'react';
import { EditableText } from '@/components/preview/EditableText';
import {
  Clock,
  Camera,
  Film,
  Image as ImageIcon,
  Megaphone,
  MessageSquare,
  Mic,
  Music,
  Volume2,
  Wand2,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MarkdownPreview } from '@/components/preview/MarkdownPreview';
import type {
  VideoOutput,
  VideoScriptSection,
  VideoEditorSection,
  ThumbnailIdea,
} from '@brighttale/shared/types/agents';

type Path = (string | number)[];

interface VideoDraftViewerProps {
  /**
   * Raw draft_json from the API or a parsed user paste. The viewer unwraps
   * common legacy wrappers (video_script, video, blog) before rendering, so
   * callers don't have to know the exact storage shape.
   */
  output: VideoOutput | Record<string, unknown>;
  className?: string;
  /**
   * When provided, fields become inline-editable. The callback is invoked
   * (debounced) with the full updated draft_json after each change.
   */
  onSave?: (next: Record<string, unknown>) => void | Promise<void>;
  /** Debounce delay before firing onSave (ms). Default 800. */
  saveDebounceMs?: number;
}

/**
 * Immutable deep-set: returns a new object with `value` placed at `path`.
 * Creates intermediate objects/arrays as needed based on the next key shape.
 */
function setIn<T extends Record<string, unknown>>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  if (Array.isArray(obj)) {
    const copy = obj.slice() as unknown as T;
    const idx = head as number;
    (copy as unknown as unknown[])[idx] = setIn(
      ((obj as unknown as unknown[])[idx] as Record<string, unknown>) ?? (typeof rest[0] === 'number' ? [] : {}),
      rest,
      value,
    );
    return copy;
  }
  const source = (obj as Record<string, unknown>) ?? {};
  const nextChild = setIn(
    (source[head as string] as Record<string, unknown>) ?? (typeof rest[0] === 'number' ? [] : {}),
    rest,
    value,
  );
  return { ...source, [head as string]: nextChild } as T;
}

function unwrapVideoOutput(raw: VideoOutput | Record<string, unknown>): VideoOutput {
  const obj = raw as Record<string, unknown>;
  // Top-level signals — if any of these are present, raw is already the VideoOutput.
  const hasTopLevel =
    'script' in obj ||
    'teleprompter_script' in obj ||
    'video_title' in obj ||
    'thumbnail_ideas' in obj ||
    'editor_script' in obj;
  if (hasTopLevel) return obj as unknown as VideoOutput;
  // Legacy wrappers — earlier seeds emitted { video_script: { ... } } or { video: { ... } }.
  const videoScript = obj.video_script as Record<string, unknown> | undefined;
  if (videoScript && typeof videoScript === 'object') return videoScript as unknown as VideoOutput;
  const video = obj.video as Record<string, unknown> | undefined;
  if (video && typeof video === 'object') return video as unknown as VideoOutput;
  return obj as unknown as VideoOutput;
}

const EMOTION_VARIANT: Record<string, string> = {
  curiosity: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  shock: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
  intrigue: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
};

export function VideoDraftViewer({
  output: rawOutput,
  className = '',
  onSave,
  saveDebounceMs = 800,
}: VideoDraftViewerProps) {
  const editable = typeof onSave === 'function';

  // Local state seeded from the unwrapped output so edits are immediate.
  // Resync uses the React 19 "setState during render" pattern when the
  // upstream prop reference changes — avoids setState-in-effect cascades.
  const initialOutput = useMemo(
    () => unwrapVideoOutput(rawOutput) as VideoOutput & Record<string, unknown>,
    [rawOutput],
  );
  const [output, setOutput] = useState(initialOutput);
  const [trackedUpstream, setTrackedUpstream] = useState(initialOutput);
  if (initialOutput !== trackedUpstream) {
    setTrackedUpstream(initialOutput);
    setOutput(initialOutput);
  }

  // Debounced save: fires onSave with the full draft_json some ms after the
  // last edit. Skip when output is identical to the latest upstream snapshot
  // (no local changes pending — typically right after a resync).
  useEffect(() => {
    if (!editable) return;
    if (output === trackedUpstream) return;
    const timer = setTimeout(() => {
      void onSave!(output);
    }, saveDebounceMs);
    return () => clearTimeout(timer);
  }, [output, trackedUpstream, editable, onSave, saveDebounceMs]);

  function update(path: Path, value: unknown) {
    setOutput((prev) => setIn(prev, path, value));
  }

  const titlePrimary = output.video_title?.primary ?? output.title_options?.[0] ?? 'Untitled video';
  const duration = output.estimated_duration ?? output.total_duration_estimate ?? null;

  // Detect legacy / non-conforming drafts so we can prompt a regeneration.
  const isLegacyShape =
    !output.script &&
    !output.teleprompter_script &&
    !output.editor_script &&
    !output.thumbnail_ideas &&
    !output.video_description;
  const titleAlternatives = useMemo(() => {
    const alts = Array.isArray(output.video_title?.alternatives) ? output.video_title.alternatives : [];
    const fromOptions = Array.isArray(output.title_options) ? output.title_options : [];
    const merged = [...alts, ...fromOptions.filter((t) => t !== output.video_title?.primary)];
    return Array.from(new Set(merged.filter((t): t is string => typeof t === 'string')));
  }, [output.video_title, output.title_options]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="rounded-lg border bg-gradient-to-br from-primary/5 via-background to-background p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            {editable ? (
              <EditableText
                as="h2"
                value={titlePrimary}
                onChange={(v) => update(['video_title', 'primary'], v)}
                placeholder="Untitled video"
                staticClassName="block text-xl font-bold tracking-tight leading-tight mb-2 px-1"
                inputClassName="text-xl font-bold tracking-tight leading-tight mb-2"
                ariaLabel="Video title"
              />
            ) : (
              <h2 className="text-xl font-bold tracking-tight leading-tight mb-2">{titlePrimary}</h2>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {duration && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {duration}
                </span>
              )}
              {output.thumbnail?.emotion && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${EMOTION_VARIANT[output.thumbnail.emotion] ?? 'border-border'}`}
                >
                  {output.thumbnail.emotion}
                </span>
              )}
              {Array.isArray(output.lower_thirds) && output.lower_thirds.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {output.lower_thirds.length} lower thirds
                </span>
              )}
            </div>
          </div>
        </div>
        {isLegacyShape && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">Legacy draft format</div>
                <div>
                  This draft was generated before the BC_VIDEO agent update. The structured
                  fields (script, editor script, thumbnails, teleprompter) are missing.
                  Click <strong>Produce Another Format</strong> below to regenerate with
                  the updated prompt.
                </div>
              </div>
            </div>
          </div>
        )}
        {output.content_warning && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{output.content_warning}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="script" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="script" className="gap-1.5">
            <Film className="h-3.5 w-3.5" /> Script
          </TabsTrigger>
          <TabsTrigger value="editor" className="gap-1.5">
            <Camera className="h-3.5 w-3.5" /> Editor
          </TabsTrigger>
          <TabsTrigger value="thumbnails" className="gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" /> Thumbnails
          </TabsTrigger>
          <TabsTrigger value="publish" className="gap-1.5">
            <Megaphone className="h-3.5 w-3.5" /> Publish
          </TabsTrigger>
        </TabsList>

        <TabsContent value="script" className="space-y-3 mt-0">
          <ScriptTab output={output} editable={editable} update={update} />
        </TabsContent>
        <TabsContent value="editor" className="space-y-3 mt-0">
          <EditorTab output={output} />
        </TabsContent>
        <TabsContent value="thumbnails" className="space-y-3 mt-0">
          <ThumbnailsTab output={output} />
        </TabsContent>
        <TabsContent value="publish" className="space-y-3 mt-0">
          <PublishTab
            output={output}
            titleAlternatives={titleAlternatives}
            editable={editable}
            update={update}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tab: Script ──────────────────────────────────────────────────────────────

interface EditingProps {
  editable?: boolean;
  update?: (path: Path, value: unknown) => void;
}

function ScriptTab({
  output,
  editable,
  update,
}: { output: VideoOutput } & EditingProps) {
  const script = output.script as VideoOutput['script'] | undefined;
  if (!script || typeof script !== 'object') {
    return (
      <EmptyState
        icon={<Film className="h-5 w-5" />}
        message="Structured script missing from this output. Check the Publish tab for the teleprompter."
      />
    );
  }
  const audioDirection = script.audio_direction;

  return (
    <div className="space-y-3">
      {script.hook && (
        <ScriptSectionCard
          label="Hook"
          tone="hook"
          section={script.hook}
          basePath={['script', 'hook']}
          editable={editable}
          update={update}
        />
      )}
      {script.problem && (
        <ScriptSectionCard
          label="Problem"
          tone="problem"
          section={script.problem}
          basePath={['script', 'problem']}
          editable={editable}
          update={update}
        />
      )}
      {script.teaser && (
        <ScriptSectionCard
          label="Teaser"
          tone="teaser"
          section={script.teaser}
          basePath={['script', 'teaser']}
          editable={editable}
          update={update}
        />
      )}

      {Array.isArray(script.chapters) && script.chapters.length > 0 && (
        <>
          <SectionHeader>Chapters</SectionHeader>
          <div className="space-y-2">
            {script.chapters.map((ch, i) => (
              <ChapterCard
                key={`ch-${ch?.chapter_number ?? i}`}
                chapter={ch}
                basePath={['script', 'chapters', i]}
                editable={editable}
                update={update}
              />
            ))}
          </div>
        </>
      )}

      {script.affiliate_segment && (
        <AffiliateCard
          segment={script.affiliate_segment}
          basePath={['script', 'affiliate_segment']}
          editable={editable}
          update={update}
        />
      )}

      {script.outro && (
        <OutroCard
          outro={script.outro}
          basePath={['script', 'outro']}
          editable={editable}
          update={update}
        />
      )}

      {audioDirection && (
        <Card className="bg-muted/40">
          <CardContent className="py-3 flex items-start gap-2">
            <Music className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed flex-1">
              <span className="font-medium text-foreground">Audio direction · </span>
              {editable && update ? (
                <EditableText
                  value={audioDirection}
                  multiline
                  onChange={(v) => update(['script', 'audio_direction'], v)}
                  placeholder="Editor selects mood and music…"
                  staticClassName="inline-block px-1"
                />
              ) : (
                audioDirection
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const TONE_BORDER: Record<string, string> = {
  hook: 'border-l-4 border-l-orange-500/70',
  problem: 'border-l-4 border-l-muted-foreground/40',
  teaser: 'border-l-4 border-l-primary/70',
};

function ScriptSectionCard({
  label,
  tone,
  section,
  basePath,
  editable,
  update,
}: {
  label: string;
  tone: keyof typeof TONE_BORDER;
  section: VideoScriptSection;
  basePath: Path;
} & EditingProps) {
  return (
    <Card className={TONE_BORDER[tone]}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </CardTitle>
          {section.duration && <DurationBadge value={section.duration} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {editable && update ? (
          <EditableText
            as="p"
            multiline
            value={section.content}
            onChange={(v) => update([...basePath, 'content'], v)}
            placeholder="Section content…"
            staticClassName="block text-sm leading-relaxed whitespace-pre-line px-1 py-0.5"
            inputClassName="text-sm leading-relaxed"
          />
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-line">{section.content}</p>
        )}
        {(section.visual_notes || (editable && update)) && (
          <div className="text-xs text-muted-foreground italic border-t pt-2">
            <span className="font-medium not-italic">Visual notes · </span>
            {editable && update ? (
              <EditableText
                value={section.visual_notes ?? ''}
                multiline
                onChange={(v) => update([...basePath, 'visual_notes'], v)}
                placeholder="Add visual notes…"
                staticClassName="inline-block px-1"
              />
            ) : (
              section.visual_notes
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChapterCard({
  chapter,
  basePath,
  editable,
  update,
}: {
  chapter: NonNullable<VideoOutput['script']['chapters']>[number];
  basePath: Path;
} & EditingProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold px-1.5">
              {chapter.chapter_number}
            </span>
            {editable && update ? (
              <EditableText
                value={chapter.title}
                onChange={(v) => update([...basePath, 'title'], v)}
                placeholder="Chapter title…"
                staticClassName="text-sm font-semibold truncate flex-1 px-1 py-0.5"
                inputClassName="text-sm font-semibold"
                ariaLabel="Chapter title"
              />
            ) : (
              <CardTitle className="text-sm font-semibold truncate">{chapter.title}</CardTitle>
            )}
          </div>
          {chapter.duration && <DurationBadge value={chapter.duration} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {(chapter.key_stat_or_quote || (editable && update)) && (
          <div className="rounded-md border-l-4 border-l-primary bg-primary/5 px-3 py-2 text-xs">
            <span className="font-semibold text-primary">Key stat · </span>
            {editable && update ? (
              <EditableText
                value={chapter.key_stat_or_quote ?? ''}
                onChange={(v) => update([...basePath, 'key_stat_or_quote'], v)}
                placeholder="Key statistic or quote…"
                staticClassName="inline-block px-1 text-foreground/90"
              />
            ) : (
              <span className="text-foreground/90">{chapter.key_stat_or_quote}</span>
            )}
          </div>
        )}
        {editable && update ? (
          <EditableText
            as="p"
            multiline
            value={chapter.content}
            onChange={(v) => update([...basePath, 'content'], v)}
            placeholder="Chapter content…"
            staticClassName="block text-sm leading-relaxed whitespace-pre-line px-1 py-0.5"
            inputClassName="text-sm leading-relaxed"
          />
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-line">{chapter.content}</p>
        )}
        {Array.isArray(chapter.b_roll_suggestions) && chapter.b_roll_suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              B-roll
            </span>
            {chapter.b_roll_suggestions.map((b, i) => (
              <Badge key={i} variant="outline" className="text-[11px] font-normal">
                {typeof b === 'string' ? b : JSON.stringify(b)}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AffiliateCard({
  segment,
  basePath,
  editable,
  update,
}: {
  segment: NonNullable<VideoOutput['script']['affiliate_segment']>;
  basePath: Path;
} & EditingProps) {
  const ed = editable && update;
  return (
    <Card className="border-l-4 border-l-amber-500/70 bg-amber-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Affiliate Segment
          </CardTitle>
          {segment.timestamp && <DurationBadge value={segment.timestamp} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {(segment.transition_in || ed) && (
          <div className="text-xs text-muted-foreground italic">
            <span className="font-medium not-italic">In · </span>
            {ed ? (
              <EditableText
                value={segment.transition_in ?? ''}
                multiline
                onChange={(v) => update!([...basePath, 'transition_in'], v)}
                placeholder="Transition in…"
                staticClassName="inline-block px-1"
              />
            ) : (
              segment.transition_in
            )}
          </div>
        )}
        {ed ? (
          <EditableText
            as="p"
            multiline
            value={segment.script}
            onChange={(v) => update!([...basePath, 'script'], v)}
            placeholder="Affiliate script…"
            staticClassName="block text-sm leading-relaxed whitespace-pre-line px-1 py-0.5"
            inputClassName="text-sm leading-relaxed"
          />
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-line">{segment.script}</p>
        )}
        {(segment.transition_out || ed) && (
          <div className="text-xs text-muted-foreground italic">
            <span className="font-medium not-italic">Out · </span>
            {ed ? (
              <EditableText
                value={segment.transition_out ?? ''}
                multiline
                onChange={(v) => update!([...basePath, 'transition_out'], v)}
                placeholder="Transition out…"
                staticClassName="inline-block px-1"
              />
            ) : (
              segment.transition_out
            )}
          </div>
        )}
        {(segment.visual_notes || ed) && (
          <div className="text-xs text-muted-foreground italic border-t pt-2">
            <span className="font-medium not-italic">Visual notes · </span>
            {ed ? (
              <EditableText
                value={segment.visual_notes ?? ''}
                multiline
                onChange={(v) => update!([...basePath, 'visual_notes'], v)}
                placeholder="Visual notes…"
                staticClassName="inline-block px-1"
              />
            ) : (
              segment.visual_notes
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OutroCard({
  outro,
  basePath,
  editable,
  update,
}: {
  outro: NonNullable<VideoOutput['script']['outro']>;
  basePath: Path;
} & EditingProps) {
  const ed = editable && update;
  return (
    <Card className="border-l-4 border-l-emerald-500/70">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Outro
          </CardTitle>
          {outro.duration && <DurationBadge value={outro.duration} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {(outro.recap || ed) && (
          ed ? (
            <EditableText
              as="p"
              multiline
              value={outro.recap ?? ''}
              onChange={(v) => update!([...basePath, 'recap'], v)}
              placeholder="Recap line…"
              staticClassName="block text-sm leading-relaxed whitespace-pre-line italic px-1 py-0.5"
              inputClassName="text-sm leading-relaxed italic"
            />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-line italic">{outro.recap}</p>
          )
        )}
        {(outro.cta || ed) && (
          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
            <span className="font-semibold">CTA · </span>
            {ed ? (
              <EditableText
                value={outro.cta ?? ''}
                onChange={(v) => update!([...basePath, 'cta'], v)}
                placeholder="Subscribe call-to-action…"
                staticClassName="inline-block px-1"
              />
            ) : (
              outro.cta
            )}
          </div>
        )}
        {(outro.end_screen_prompt || ed) && (
          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
            <span className="font-semibold">End screen prompt · </span>
            {ed ? (
              <EditableText
                value={outro.end_screen_prompt ?? ''}
                onChange={(v) => update!([...basePath, 'end_screen_prompt'], v)}
                placeholder="End-screen comment prompt…"
                staticClassName="inline-block px-1"
              />
            ) : (
              outro.end_screen_prompt
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tab: Editor ──────────────────────────────────────────────────────────────

function EditorTab({ output }: { output: VideoOutput }) {
  const editor = output.editor_script;
  if (!editor) {
    return (
      <EmptyState
        icon={<Camera className="h-5 w-5" />}
        message="No editor script generated for this output."
      />
    );
  }

  const sections: Array<{ key: string; label: string; section?: VideoEditorSection }> = [
    { key: 'hook', label: 'Hook', section: editor.hook },
    { key: 'problem', label: 'Problem', section: editor.problem },
    { key: 'teaser', label: 'Teaser', section: editor.teaser },
  ];

  return (
    <div className="space-y-3">
      {editor.color_grading && (
        <Card className="border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-background">
          <CardContent className="py-3 flex items-start gap-2">
            <Wand2 className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <span className="font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                Color grading ·{' '}
              </span>
              <span className="text-foreground/90">{editor.color_grading}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Accordion type="multiple" defaultValue={['hook']} className="space-y-2">
        {sections.map(
          ({ key, label, section }) =>
            section && (
              <EditorAccordionItem key={key} value={key} label={label} section={section} />
            ),
        )}

        {Array.isArray(editor.chapters) &&
          editor.chapters.map((ch, idx) => (
            <EditorAccordionItem
              key={`ch-${idx}`}
              value={`ch-${idx}`}
              label={`Chapter ${idx + 1}`}
              section={ch}
            />
          ))}

        {editor.affiliate_segment && (
          <EditorAccordionItem
            value="affiliate"
            label="Affiliate Segment"
            section={editor.affiliate_segment}
          />
        )}
        {editor.outro && (
          <EditorAccordionItem value="outro" label="Outro" section={editor.outro} />
        )}
      </Accordion>
    </div>
  );
}

function EditorAccordionItem({
  value,
  label,
  section,
}: {
  value: string;
  label: string;
  section: VideoEditorSection;
}) {
  return (
    <AccordionItem value={value} className="rounded-md border bg-card px-3">
      <AccordionTrigger className="py-3 hover:no-underline">
        <span className="text-sm font-semibold">{label}</span>
      </AccordionTrigger>
      <AccordionContent className="pb-3 space-y-3 text-sm">
        {section.A_roll && (
          <EditorRow icon={<Camera className="h-3.5 w-3.5" />} label="A-roll">
            {section.A_roll}
          </EditorRow>
        )}
        {(() => {
          // B-roll can come back as string[], a single string, or null — LLMs drift.
          const br = section.B_roll as unknown;
          if (Array.isArray(br) && br.length > 0) {
            return (
              <EditorRow icon={<Film className="h-3.5 w-3.5" />} label="B-roll">
                <ul className="list-disc list-inside space-y-0.5 text-foreground/90">
                  {br.map((b, i) => (
                    <li key={i}>{typeof b === 'string' ? b : JSON.stringify(b)}</li>
                  ))}
                </ul>
              </EditorRow>
            );
          }
          if (typeof br === 'string' && br.length > 0) {
            return (
              <EditorRow icon={<Film className="h-3.5 w-3.5" />} label="B-roll">
                {br}
              </EditorRow>
            );
          }
          return null;
        })()}
        {(() => {
          // text_overlays can come back as VideoTextOverlay[], a single string, or null.
          const to = section.text_overlays as unknown;
          if (Array.isArray(to) && to.length > 0) {
            return (
              <EditorRow label="Text overlays">
                <div className="space-y-1.5">
                  {to.map((raw, i) => {
                    if (!raw || typeof raw !== 'object') {
                      return (
                        <div key={i} className="rounded-sm bg-muted/40 px-2 py-1.5 text-sm">
                          {String(raw)}
                        </div>
                      );
                    }
                    const t = raw as { time?: string; text?: string; style?: string };
                    return (
                      <div key={i} className="flex items-start gap-2 rounded-sm bg-muted/40 px-2 py-1.5">
                        {t.time && (
                          <Badge variant="secondary" className="font-mono text-[11px]">
                            {t.time}
                          </Badge>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{t.text ?? ''}</div>
                          {t.style && (
                            <div className="text-[11px] text-muted-foreground italic">{t.style}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </EditorRow>
            );
          }
          if (typeof to === 'string' && to.length > 0) {
            return (
              <EditorRow label="Text overlays">
                <div className="text-sm italic text-foreground/90">{to}</div>
              </EditorRow>
            );
          }
          return null;
        })()}
        {section.SFX && (
          <EditorRow icon={<Volume2 className="h-3.5 w-3.5" />} label="SFX">
            {section.SFX}
          </EditorRow>
        )}
        {section.BGM && (
          <EditorRow icon={<Music className="h-3.5 w-3.5" />} label="BGM">
            {section.BGM}
          </EditorRow>
        )}
        {section.Transitions && (
          <EditorRow label="Transitions">{section.Transitions}</EditorRow>
        )}
        {section.Visual_effects && (
          <EditorRow label="Visual effects">{section.Visual_effects}</EditorRow>
        )}
        {section.Pacing_notes && (
          <EditorRow label="Pacing">{section.Pacing_notes}</EditorRow>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function EditorRow({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex items-center gap-1 min-w-[110px] text-[11px] font-medium uppercase tracking-wide text-muted-foreground shrink-0 pt-0.5">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex-1 text-sm text-foreground/90 leading-relaxed">{children}</div>
    </div>
  );
}

// ─── Tab: Thumbnails ──────────────────────────────────────────────────────────

function ThumbnailsTab({ output }: { output: VideoOutput }) {
  const ideas = Array.isArray(output.thumbnail_ideas) ? output.thumbnail_ideas : [];
  const primary = output.thumbnail;

  if (!primary && ideas.length === 0) {
    return (
      <EmptyState
        icon={<ImageIcon className="h-5 w-5" />}
        message="No thumbnail concepts generated."
      />
    );
  }

  return (
    <div className="space-y-4">
      {primary && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">
                Primary thumbnail
              </CardTitle>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${EMOTION_VARIANT[primary.emotion] ?? 'border-border'}`}
              >
                {primary.emotion}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold tracking-tight">{primary.text_overlay}</div>
            <p className="text-sm leading-relaxed">{primary.visual_concept}</p>
            <Separator />
            <p className="text-xs italic text-muted-foreground">
              <span className="font-medium not-italic">Why it works · </span>
              {primary.why_it_works}
            </p>
          </CardContent>
        </Card>
      )}

      {ideas.length > 0 && (
        <>
          <SectionHeader>Concept variations · {ideas.length}</SectionHeader>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {ideas.map((idea, i) => (
              <ThumbnailCard key={i} idea={idea} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ThumbnailCard({ idea }: { idea: ThumbnailIdea }) {
  const palette = parsePalette(idea.color_palette);
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base font-bold leading-tight">{idea.text_overlay}</CardTitle>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${EMOTION_VARIANT[idea.emotion] ?? 'border-border'}`}
          >
            {idea.emotion}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <p className="text-foreground/90 leading-relaxed">{idea.concept}</p>
        {palette.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Palette
            </span>
            {palette.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]"
                title={c.label}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full border"
                  style={{ backgroundColor: c.hex }}
                />
                {c.label}
              </span>
            ))}
          </div>
        )}
        {idea.composition && (
          <p className="text-[11px] text-muted-foreground italic border-t pt-2">
            <span className="font-medium not-italic">Composition · </span>
            {idea.composition}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Best-effort parser: split palette string into labeled color chips.
// Recognizes common color names; falls back to a neutral chip otherwise.
const COLOR_NAME_TO_HEX: Record<string, string> = {
  black: '#0a0a0a',
  white: '#ffffff',
  gray: '#9ca3af',
  grey: '#9ca3af',
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  green: '#22c55e',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  pink: '#ec4899',
  brown: '#92400e',
  beige: '#f5f5dc',
  gold: '#d4af37',
  silver: '#c0c0c0',
  navy: '#1e3a8a',
  neon: '#39ff14',
};

function parsePalette(raw: string): Array<{ label: string; hex: string }> {
  if (!raw) return [];
  return raw
    .split(/[,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((label) => {
      const lower = label.toLowerCase();
      const match = Object.keys(COLOR_NAME_TO_HEX).find((name) => lower.includes(name));
      return { label, hex: match ? COLOR_NAME_TO_HEX[match] : '#a3a3a3' };
    });
}

// ─── Tab: Publish ─────────────────────────────────────────────────────────────

function PublishTab({
  output,
  titleAlternatives,
  editable,
  update,
}: {
  output: VideoOutput;
  titleAlternatives: string[];
} & EditingProps) {
  const ed = editable && update;
  const teleprompter = output.teleprompter_script ?? '';
  const wordCount = teleprompter ? teleprompter.split(/\s+/).filter(Boolean).length : 0;
  const estMinutes = wordCount > 0 ? (wordCount / 150).toFixed(1) : null;

  return (
    <div className="space-y-4">
      {/* Title block */}
      {(output.video_title || ed) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Titles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ed ? (
              <EditableText
                value={output.video_title?.primary ?? ''}
                onChange={(v) => update!(['video_title', 'primary'], v)}
                placeholder="Primary title…"
                staticClassName="block text-lg font-bold leading-tight px-1 py-0.5"
                inputClassName="text-lg font-bold leading-tight"
                ariaLabel="Primary title"
              />
            ) : (
              <div className="text-lg font-bold leading-tight">{output.video_title?.primary}</div>
            )}
            {(titleAlternatives.length > 0 || ed) && (
              <div className="space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Alternatives (A/B test)
                </span>
                <ul className="space-y-1 text-sm">
                  {titleAlternatives.map((t, i) => (
                    <li key={i} className="rounded-sm border bg-muted/30 px-3 py-1.5">
                      {ed ? (
                        <EditableText
                          value={t}
                          onChange={(v) => {
                            const alts = Array.isArray(output.video_title?.alternatives)
                              ? [...output.video_title.alternatives]
                              : [];
                            // Find index of this alternative in source array (by string match)
                            const srcIdx = alts.findIndex((a) => a === t);
                            if (srcIdx >= 0) {
                              alts[srcIdx] = v;
                              update!(['video_title', 'alternatives'], alts);
                            }
                          }}
                          placeholder="Alternative title…"
                          staticClassName="inline-block px-1 w-full"
                        />
                      ) : (
                        t
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Description */}
      {(output.video_description || ed) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              YouTube description
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ed ? (
              <EditableText
                value={output.video_description ?? ''}
                multiline
                onChange={(v) => update!(['video_description'], v)}
                placeholder="YouTube description (markdown)…"
                staticClassName="block text-sm leading-relaxed whitespace-pre-wrap rounded-md border bg-muted/20 p-3 min-h-[120px]"
                inputClassName="text-sm font-mono"
                maxHeight={400}
              />
            ) : (
              <ScrollArea className="h-[280px] rounded-md border bg-muted/20 p-3">
                <MarkdownPreview content={output.video_description ?? ''} className="text-sm" />
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pinned comment */}
      {(output.pinned_comment || ed) && (
        <Card className="border-l-4 border-l-blue-500/70">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                Pinned comment
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {ed ? (
              <EditableText
                as="p"
                multiline
                value={output.pinned_comment ?? ''}
                onChange={(v) => update!(['pinned_comment'], v)}
                placeholder="Engagement comment…"
                staticClassName="block text-sm leading-relaxed whitespace-pre-line px-1 py-0.5"
                inputClassName="text-sm leading-relaxed"
              />
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-line">{output.pinned_comment}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Teleprompter */}
      {(teleprompter || ed) && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Teleprompter script
                </CardTitle>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>{wordCount.toLocaleString()} words</span>
                {estMinutes && (
                  <>
                    <span>·</span>
                    <span>~{estMinutes} min @ 150 wpm</span>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <CopyButton text={teleprompter} />
              <Button variant="outline" size="sm" disabled className="gap-1.5" title="Coming in Wave 2">
                <Volume2 className="h-3.5 w-3.5" />
                Generate Audio (Wave 2)
              </Button>
            </div>
            {ed ? (
              <EditableText
                multiline
                value={teleprompter}
                onChange={(v) => update!(['teleprompter_script'], v)}
                placeholder="Teleprompter script…"
                staticClassName="block font-mono text-xs leading-relaxed whitespace-pre-wrap rounded-md border bg-muted/20 p-3 min-h-[200px]"
                inputClassName="font-mono text-xs leading-relaxed"
                maxHeight={500}
              />
            ) : (
              <ScrollArea className="h-[320px] rounded-md border bg-muted/20 p-3">
                <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {teleprompter}
                </pre>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lower thirds (only if present) */}
      {Array.isArray(output.lower_thirds) && output.lower_thirds.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Lower thirds · {output.lower_thirds.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {output.lower_thirds.map((lt, i) => (
                <div key={i} className="flex items-start gap-2 rounded-sm border bg-muted/20 px-2.5 py-2">
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {lt.timestamp}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    {ed ? (
                      <EditableText
                        value={lt.line1}
                        onChange={(v) => update!(['lower_thirds', i, 'line1'], v)}
                        placeholder="Primary text…"
                        staticClassName="block text-sm font-semibold px-1"
                        inputClassName="text-sm font-semibold"
                      />
                    ) : (
                      <div className="text-sm font-semibold">{lt.line1}</div>
                    )}
                    {(lt.line2 || ed) && (
                      ed ? (
                        <EditableText
                          value={lt.line2 ?? ''}
                          onChange={(v) => update!(['lower_thirds', i, 'line2'], v)}
                          placeholder="Secondary text (optional)…"
                          staticClassName="block text-xs text-muted-foreground px-1"
                        />
                      ) : (
                        <div className="text-xs text-muted-foreground">{lt.line2}</div>
                      )
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 pt-1">
                    {lt.duration_seconds}s
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // ignore — older browsers without clipboard API
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {children}
      </span>
      <Separator className="flex-1" />
    </div>
  );
}

function DurationBadge({ value }: { value: string }) {
  return (
    <Badge variant="secondary" className="font-mono text-[11px] gap-1">
      <Clock className="h-3 w-3" />
      {value}
    </Badge>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
      <div className="flex flex-col items-center gap-2">
        {icon}
        <span>{message}</span>
      </div>
    </div>
  );
}
