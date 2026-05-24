'use client';

/**
 * PreviewEngineVideo — read-only video bundle preview.
 *
 * Renders three sections:
 *   1. Inventory strip — horizontal pills showing ready/missing status for each bundle item.
 *   2. Viewer-style card — YouTube-like mini-player with thumbnail placeholder, title,
 *      channel header, description excerpt, and pinned comment.
 *   3. Teleprompter — structured script reading view: HOOK / PROBLEM / CHAPTER N
 *      (with matching lower-third cue inline) / OUTRO.
 *
 * Pure read — no mutation surfaces. Footer has a single CTA that advances the orchestrator.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Check, AlertCircle, Play, Mic, Clock, Image as ImageIcon, Camera, Type,
  FileText, MessageSquare, Hash,
} from 'lucide-react';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface LowerThird {
  at: string;
  label: string;
}

interface ScriptChapter {
  title: string;
  content: string;
  duration?: string;
}

interface ScriptBlock {
  hook?: { content?: string };
  problem?: { content?: string };
  chapters?: ScriptChapter[];
  outro?: { cta?: string };
}

export interface VideoDraftJson {
  video_title?: string;
  video_description?: string;
  pinned_comment?: string;
  tags?: string[];
  lower_thirds?: LowerThird[];
  script?: ScriptBlock;
  estimated_duration?: string;
  channel?: {
    name?: string;
    subscribers?: string;
  };
}

export interface PreviewEngineVideoProps {
  /** The draft_json field from the loaded draft — may contain any shape. */
  draftJson: Record<string, unknown> | null;
  /** Called when the user clicks "Approve bundle → Publish". */
  onApprove: () => void;
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function parseLowerThirds(v: unknown): LowerThird[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is LowerThird =>
      x !== null &&
      typeof x === 'object' &&
      typeof (x as Record<string, unknown>).at === 'string' &&
      typeof (x as Record<string, unknown>).label === 'string',
  );
}

function parseChapters(v: unknown): ScriptChapter[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is ScriptChapter =>
      x !== null &&
      typeof x === 'object' &&
      typeof (x as Record<string, unknown>).title === 'string' &&
      typeof (x as Record<string, unknown>).content === 'string',
  );
}

function parseVideoDraftJson(raw: Record<string, unknown> | null): VideoDraftJson {
  if (!raw) return {};
  const script = raw.script as Record<string, unknown> | undefined;
  return {
    video_title: asString(raw.video_title),
    video_description: asString(raw.video_description),
    pinned_comment: typeof raw.pinned_comment === 'string' ? raw.pinned_comment : undefined,
    tags: asStringArray(raw.tags),
    lower_thirds: parseLowerThirds(raw.lower_thirds),
    estimated_duration: asString(raw.estimated_duration),
    channel:
      raw.channel && typeof raw.channel === 'object'
        ? {
            name: asString((raw.channel as Record<string, unknown>).name),
            subscribers: asString((raw.channel as Record<string, unknown>).subscribers),
          }
        : undefined,
    script: script
      ? {
          hook: script.hook && typeof script.hook === 'object'
            ? { content: asString((script.hook as Record<string, unknown>).content) }
            : undefined,
          problem: script.problem && typeof script.problem === 'object'
            ? { content: asString((script.problem as Record<string, unknown>).content) }
            : undefined,
          chapters: parseChapters(script.chapters),
          outro: script.outro && typeof script.outro === 'object'
            ? { cta: asString((script.outro as Record<string, unknown>).cta) }
            : undefined,
        }
      : undefined,
  };
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

interface InventoryPillProps {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  ready: boolean;
}

function InventoryPill({ icon, label, detail, ready }: InventoryPillProps) {
  const testId = ready ? 'inventory-pill-ready' : 'inventory-pill-missing';
  return (
    <div
      data-testid={testId}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
        ready
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
      }`}
    >
      {ready ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {!ready && icon}
      <span className="font-medium">{label}</span>
      {detail && <span className="text-muted-foreground">· {detail}</span>}
      {!ready && <span className="italic">missing</span>}
    </div>
  );
}

interface ScriptSectionProps {
  label: string;
  title?: string;
  body: string;
  lowerThird?: LowerThird;
}

function ScriptSection({ label, title, body, lowerThird }: ScriptSectionProps) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {lowerThird && (
          <span className="text-[10px] rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 border border-amber-500/30 font-mono">
            ⌞ {lowerThird.at} · {lowerThird.label}
          </span>
        )}
      </div>
      {title && <h3 className="text-base font-semibold leading-snug">{title}</h3>}
      <p className="whitespace-pre-wrap text-sm">{body}</p>
    </section>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */

export function PreviewEngineVideo({ draftJson, onApprove }: PreviewEngineVideoProps) {
  const draft = parseVideoDraftJson(draftJson);

  const chapters = draft.script?.chapters ?? [];
  const lowerThirds = draft.lower_thirds ?? [];
  const tags = draft.tags ?? [];

  const hasThumbnail = false; // thumbnails come from assets — not in draft_json
  const hasBroll = chapters.some((c) => {
    const ch = c as unknown as Record<string, unknown>;
    return Array.isArray(ch.broll) && (ch.broll as unknown[]).length > 0;
  });
  const hasLowerThirds = lowerThirds.length > 0;
  const hasDescription = Boolean(draft.video_description);
  const hasTags = tags.length > 0;
  const hasPinnedComment = draft.pinned_comment !== undefined && draft.pinned_comment !== null;
  const duration = draft.estimated_duration || null;

  return (
    <div className="space-y-5">
      {/* Inventory strip */}
      <Card>
        <CardContent className="py-3">
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="preview-video-inventory"
          >
            <InventoryPill icon={<ImageIcon className="h-3 w-3" />} label="Thumbnail" ready={hasThumbnail} />
            <InventoryPill
              icon={<Camera className="h-3 w-3" />}
              label="B-roll"
              detail={hasBroll ? `${chapters.length} chapters` : undefined}
              ready={hasBroll}
            />
            <InventoryPill
              icon={<Type className="h-3 w-3" />}
              label="Lower thirds"
              detail={hasLowerThirds ? String(lowerThirds.length) : undefined}
              ready={hasLowerThirds}
            />
            <InventoryPill icon={<FileText className="h-3 w-3" />} label="Description" ready={hasDescription} />
            <InventoryPill
              icon={<Hash className="h-3 w-3" />}
              label="Tags"
              detail={hasTags ? String(tags.length) : undefined}
              ready={hasTags}
            />
            <InventoryPill icon={<MessageSquare className="h-3 w-3" />} label="Pinned comment" ready={hasPinnedComment} />
          </div>
        </CardContent>
      </Card>

      {/* Split — viewer card / teleprompter */}
      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
        {/* Viewer-style card */}
        <div className="space-y-3" data-testid="preview-video-viewer-card">
          <Card className="overflow-hidden">
            <div className="aspect-video bg-black relative">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-rose-900 to-slate-800 flex items-center justify-center">
                <div className="text-center text-white px-4">
                  <p className="text-2xl font-black tracking-tight leading-none line-clamp-2">
                    {draft.video_title || 'Untitled video'}
                  </p>
                </div>
              </div>
              {duration && (
                <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                  {duration}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-white/20 backdrop-blur rounded-full p-3">
                  <Play className="h-6 w-6 text-white fill-white" />
                </div>
              </div>
            </div>
            <CardContent className="py-3 space-y-2">
              <p className="text-sm font-semibold leading-snug line-clamp-2">
                {draft.video_title || 'Untitled video'}
              </p>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-rose-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">{draft.channel?.name || 'Channel'}</p>
                  {draft.channel?.subscribers && (
                    <p className="text-[10px] text-muted-foreground">{draft.channel.subscribers} subscribers</p>
                  )}
                </div>
              </div>
              {draft.video_description && (
                <p className="text-[11px] text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                  {draft.video_description}
                </p>
              )}
            </CardContent>
          </Card>

          {hasPinnedComment && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5" /> Pinned comment
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] text-muted-foreground">
                {draft.pinned_comment}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Teleprompter */}
        <Card data-testid="preview-video-teleprompter">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mic className="h-4 w-4" /> Teleprompter
              {duration && (
                <Badge variant="outline" className="ml-auto text-[10px] gap-1">
                  <Clock className="h-3 w-3" /> {duration}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-[15px] leading-[1.7] max-h-[640px] overflow-y-auto">
            {draft.script?.hook?.content && (
              <ScriptSection label="HOOK · 0:00" body={draft.script.hook.content} />
            )}
            {draft.script?.problem?.content && (
              <ScriptSection label="PROBLEM" body={draft.script.problem.content} />
            )}
            {chapters.map((ch, i) => (
              <ScriptSection
                key={i}
                label={`CHAPTER ${i + 1}${ch.duration ? ` · ${ch.duration}` : ''}`}
                title={ch.title}
                body={ch.content}
                lowerThird={lowerThirds[i + 1]}
              />
            ))}
            {draft.script?.outro?.cta && (
              <ScriptSection label="OUTRO" body={draft.script.outro.cta} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer CTA */}
      <footer className="flex items-center justify-between border-t pt-3">
        <p className="text-xs text-muted-foreground">
          Bundle reviewed · ready to publish
        </p>
        <Button
          size="lg"
          data-testid="preview-video-cta"
          onClick={onApprove}
        >
          Approve bundle → Publish
        </Button>
      </footer>
    </div>
  );
}
