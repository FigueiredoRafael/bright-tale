'use client';

/**
 * VideoPublishPanel — issue #215 (S3) + issue #218 (S5) + issue #222 (S10)
 *
 * Renders the video-track publish surface:
 * - Target channel card (shared between modes)
 * - Mode toggle: bundle (default) / direct
 * - Asset checklist (shared between modes)
 * - Bundle actions: CTA active when manifest has ≥1 entry (S5)
 * - Per-image-row Download buttons: active when URL present in manifest (S5)
 * - Direct mode (S10): upload dropzone + YouTube-API-only fields + Publish CTA
 *   - Connected target: shows the form
 *   - No target: shows "Connect YouTube" prompt
 *
 * Download-trigger injection pattern (onDownloadZip / onDownloadImage):
 *   jsdom does not implement URL.createObjectURL or anchor.click(), so
 *   instead of calling those directly, we accept optional callbacks that
 *   the component invokes with the download payload. In production the
 *   PublishEngine passes a real browser-download implementation; in tests
 *   a spy is injected. This pattern mirrors the onCopyText injection from S1.
 *
 * Upload-path choice (S10): proxy-through-API.
 *   The video file is uploaded to the API route which streams it to YouTube.
 *   The OAuth token never leaves the API boundary. onPublish callback receives
 *   the form values; the parent (PublishEngine) calls the route.
 */

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Package,
  Youtube,
  Check,
  Copy,
  Download,
  Loader2,
  Rocket,
  Image as ImageIcon,
  FileText,
  MessageSquare,
  Hash,
  Type,
  Camera,
  Upload,
  AlertCircle,
  ExternalLink,
  RefreshCcw,
  Clock,
} from 'lucide-react';
import type { VideoAssetBundle } from '@brighttale/shared/schemas/videoAssetBundle';
import type { PublishTarget } from '@brighttale/shared';
import { buildZipBlob } from '@/lib/video-bundle/zip';

// ── Types ─────────────────────────────────────────────────────────────────────

type PublishMode = 'bundle' | 'direct';

interface Channel {
  name: string;
  handle: string;
  subscribers: string;
}

interface ScriptChapter {
  broll?: string[];
}

interface LowerThird {
  at: string;
  label: string;
}

interface ThumbnailIdea {
  title: string;
}

/**
 * Result shape returned by the onPublish callback.
 * Mirrors the discriminated union from publishToYouTube.
 */
export type YouTubePublishResult =
  | { ok: true; videoId: string; url: string }
  | { ok: false; code: 'YOUTUBE_AUTH_FAILED' | 'YOUTUBE_QUOTA_EXCEEDED' | 'YOUTUBE_REJECTED'; message: string };

export interface DirectFormValues {
  visibility: 'public' | 'unlisted' | 'private';
  categoryId: string;
  madeForKids: boolean;
  language: string;
  videoFile?: File;
}

interface VideoPublishPanelProps {
  /**
   * draft_json from the content_drafts row — may be empty on first mount.
   * Typed as unknown so callers with Record<string,unknown> don't need a cast;
   * the component narrows all fields via optional chaining internally.
   */
  draftJson: unknown;
  /**
   * The content_draft id — passed to the publish route.
   */
  draftId?: string;
  /**
   * Optional VideoAssetBundle manifest from AssetsEngine (S4).
   * When present with ≥1 entry, enables the "Download bundle (.zip)" CTA
   * and per-image download buttons.
   */
  manifest?: VideoAssetBundle;
  /**
   * Connected YouTube publish target from S8.
   * When present: Direct mode renders the form.
   * When absent: Direct mode renders "Connect YouTube" prompt.
   */
  youtubeTarget?: PublishTarget;
  /**
   * Optional override for clipboard write — injected in tests since jsdom
   * does not implement navigator.clipboard. Defaults to navigator.clipboard.writeText.
   */
  onCopyText?: (text: string) => void;
  /**
   * Optional override for ZIP download trigger.
   *
   * Rationale: jsdom does not implement URL.createObjectURL or anchor.click(),
   * so the component calls this callback with the ZIP Blob instead of directly
   * triggering a browser download. In production, PublishEngine passes a real
   * download implementation (createObjectURL + click). In tests, a spy is
   * injected. This pattern mirrors the onCopyText injection from S1.
   *
   * Defaults to a real browser-download implementation when not provided.
   */
  onDownloadZip?: (blob: Blob, filename: string) => void;
  /**
   * Optional override for single-image download trigger (same rationale as onDownloadZip).
   * Called with the image URL and suggested filename.
   * Defaults to a real browser-download implementation when not provided.
   */
  onDownloadImage?: (url: string, filename: string) => void;
  /**
   * Callback called when the user submits the Direct publish form.
   * Parent (PublishEngine) is responsible for calling the API route.
   * Returns a discriminated union so the component can display the correct state.
   */
  onPublish?: (values: DirectFormValues) => Promise<YouTubePublishResult>;
}

const COMING_NEXT_TOOLTIP = 'Coming next — ZIP download lands in #218';

// ── Component ─────────────────────────────────────────────────────────────────

/** Safely read a string field from an unknown record */
function str(obj: unknown, key: string): string {
  if (obj !== null && typeof obj === 'object' && key in (obj as object)) {
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === 'string' ? val : '';
  }
  return '';
}

/** Safely read an array field from an unknown record */
function arr<T>(obj: unknown, key: string): T[] {
  if (obj !== null && typeof obj === 'object' && key in (obj as object)) {
    const val = (obj as Record<string, unknown>)[key];
    return Array.isArray(val) ? (val as T[]) : [];
  }
  return [];
}

/** Safely read a nested object from an unknown record */
function nested(obj: unknown, key: string): unknown {
  if (obj !== null && typeof obj === 'object' && key in (obj as object)) {
    return (obj as Record<string, unknown>)[key];
  }
  return null;
}

/** Trigger a browser download from a Blob. */
function browserDownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Trigger a browser download from a URL. */
function browserDownloadUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function VideoPublishPanel({
  draftJson,
  draftId,
  manifest,
  youtubeTarget,
  onCopyText,
  onDownloadZip,
  onDownloadImage,
  onPublish,
}: VideoPublishPanelProps) {
  const [mode, setMode] = useState<PublishMode>('bundle');
  const [isDownloading, setIsDownloading] = useState(false);

  // Default to navigator.clipboard.writeText when not injected.
  // The try/catch guard handles environments where the Clipboard API is unavailable.
  const copyText = onCopyText ?? ((text: string) => {
    try {
      void navigator.clipboard.writeText(text);
    } catch {
      // silent — older browsers or non-HTTPS contexts
    }
  });

  const downloadZip = onDownloadZip ?? ((blob: Blob, filename: string) => {
    browserDownloadBlob(blob, filename);
  });

  const downloadImage = onDownloadImage ?? ((url: string, filename: string) => {
    browserDownloadUrl(url, filename);
  });

  const channelRaw = nested(draftJson, 'channel');
  const channel: Channel = {
    name: str(channelRaw, 'name') || 'Channel',
    handle: str(channelRaw, 'handle'),
    subscribers: str(channelRaw, 'subscribers'),
  };

  const videoTitle = str(draftJson, 'video_title');
  const videoDescription = str(draftJson, 'video_description');
  const pinnedComment = str(draftJson, 'pinned_comment');
  const tags = arr<string>(draftJson, 'tags');
  const thumbnailIdeas = arr<ThumbnailIdea>(draftJson, 'thumbnail_ideas');
  const lowerThirds = arr<LowerThird>(draftJson, 'lower_thirds');
  const scriptRaw = nested(draftJson, 'script');
  const chapters = arr<ScriptChapter>(scriptRaw, 'chapters');

  const totalBroll = chapters.reduce<number>(
    (acc, ch) => acc + (ch.broll?.length ?? 0),
    0,
  );

  // Manifest presence determines CTA and per-image button states
  const hasManifest = manifest !== undefined && (manifest.images.length + manifest.texts.length) > 0;

  // Build a lookup of filename → url from manifest images
  const imageUrlByFilename = new Map<string, string>(
    (manifest?.images ?? [])
      .filter((img) => img.url !== undefined)
      .map((img) => [img.filename, img.url as string]),
  );

  async function handleDownloadBundle() {
    if (!manifest || isDownloading) return;
    setIsDownloading(true);
    try {
      const blob = await buildZipBlob(manifest);
      const safeTitle = manifest.meta.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      downloadZip(blob, `${safeTitle}-bundle.zip`);
    } finally {
      setIsDownloading(false);
    }
  }

  function handleDownloadImage(filename: string) {
    const url = imageUrlByFilename.get(filename);
    if (url) {
      downloadImage(url, filename);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Publish</h2>
          <p className="text-xs text-muted-foreground">
            Bundle handoff (default): upload to YouTube Studio yourself. Direct: upload video + send metadata via API.
          </p>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </header>

      {/* Shared: target channel card */}
      <Card data-testid="video-publish-channel-card">
        <CardContent className="py-3 flex items-center gap-3">
          <Youtube className="h-5 w-5 text-rose-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{channel.name}</p>
            <p className="text-xs text-muted-foreground">
              {channel.handle}
              {channel.handle && channel.subscribers ? ' · ' : ''}
              {channel.subscribers ? `${channel.subscribers} subs` : ''}
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">connected</Badge>
        </CardContent>
      </Card>

      {/* Asset checklist — shared between modes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {mode === 'bundle'
              ? <Package className="h-4 w-4" />
              : <Rocket className="h-4 w-4" />}
            {mode === 'bundle' ? 'Bundle contents' : 'Pre-flight checklist'}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y" data-testid="video-publish-checklist">
          <AssetRow
            icon={<ImageIcon className="h-4 w-4" />}
            label="Thumbnail"
            detail={`${thumbnailIdeas.length} concepts · 1 selected`}
            kind="image"
            copyTestId={undefined}
            dlTestId="dl-btn-thumbnail"
            dlTooltipTestId="dl-tooltip-thumbnail"
            dlFilename="thumbnail-01.png"
            copyContent={undefined}
            onCopyText={copyText}
            onDownloadImage={handleDownloadImage}
            imageUrlByFilename={imageUrlByFilename}
          />
          <AssetRow
            icon={<Camera className="h-4 w-4" />}
            label="B-roll prompts / images"
            detail={`${totalBroll} items`}
            kind="image"
            copyTestId={undefined}
            dlTestId="dl-btn-broll"
            dlTooltipTestId="dl-tooltip-broll"
            dlFilename="broll-ch01-01.png"
            copyContent={undefined}
            onCopyText={copyText}
            onDownloadImage={handleDownloadImage}
            imageUrlByFilename={imageUrlByFilename}
          />
          <AssetRow
            icon={<Type className="h-4 w-4" />}
            label="Lower thirds (timestamps + text)"
            detail={`${lowerThirds.length} cues`}
            kind="text"
            copyTestId="copy-btn-lower-thirds"
            dlTestId={undefined}
            dlTooltipTestId={undefined}
            dlFilename={undefined}
            copyContent={lowerThirds.map((lt) => `${lt.at} ${lt.label}`).join('\n')}
            onCopyText={copyText}
            onDownloadImage={handleDownloadImage}
            imageUrlByFilename={imageUrlByFilename}
          />
          <AssetRow
            icon={<Type className="h-4 w-4" />}
            label="Title"
            detail={`${videoTitle.length}/100`}
            kind="text"
            copyTestId="copy-btn-title"
            dlTestId={undefined}
            dlTooltipTestId={undefined}
            dlFilename={undefined}
            copyContent={videoTitle}
            onCopyText={copyText}
            onDownloadImage={handleDownloadImage}
            imageUrlByFilename={imageUrlByFilename}
          />
          <AssetRow
            icon={<FileText className="h-4 w-4" />}
            label="Description (with chapters)"
            detail={`${videoDescription.length} chars`}
            kind="text"
            copyTestId="copy-btn-description"
            dlTestId={undefined}
            dlTooltipTestId={undefined}
            dlFilename={undefined}
            copyContent={videoDescription}
            onCopyText={copyText}
            onDownloadImage={handleDownloadImage}
            imageUrlByFilename={imageUrlByFilename}
          />
          <AssetRow
            icon={<Hash className="h-4 w-4" />}
            label="Tags"
            detail={`${tags.length} tags`}
            kind="text"
            copyTestId="copy-btn-tags"
            dlTestId={undefined}
            dlTooltipTestId={undefined}
            dlFilename={undefined}
            copyContent={tags.join(', ')}
            onCopyText={copyText}
            onDownloadImage={handleDownloadImage}
            imageUrlByFilename={imageUrlByFilename}
          />
          <AssetRow
            icon={<MessageSquare className="h-4 w-4" />}
            label="Pinned comment"
            detail="ready"
            kind="text"
            copyTestId="copy-btn-pinned-comment"
            dlTestId={undefined}
            dlTooltipTestId={undefined}
            dlFilename={undefined}
            copyContent={pinnedComment}
            onCopyText={copyText}
            onDownloadImage={handleDownloadImage}
            imageUrlByFilename={imageUrlByFilename}
          />
        </CardContent>
      </Card>

      {/* Mode-specific actions */}
      {mode === 'bundle'
        ? (
          <BundleActions
            hasManifest={hasManifest}
            isDownloading={isDownloading}
            onDownload={handleDownloadBundle}
          />
        )
        : (
          youtubeTarget
            ? (
              <DirectPublishForm
                draftId={draftId}
                draftJson={draftJson}
                youtubeTarget={youtubeTarget}
                onPublish={onPublish}
              />
            )
            : <ConnectYouTubePrompt />
        )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ModeToggle({
  mode,
  onChange,
}: {
  mode: PublishMode;
  onChange: (m: PublishMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-full border bg-muted p-0.5 text-xs"
      data-testid="video-publish-mode-toggle"
    >
      <button
        type="button"
        onClick={() => onChange('bundle')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition ${
          mode === 'bundle'
            ? 'bg-background shadow-sm font-medium'
            : 'text-muted-foreground'
        }`}
      >
        <Package className="h-3.5 w-3.5" /> Bundle handoff
      </button>
      <button
        type="button"
        onClick={() => onChange('direct')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition ${
          mode === 'direct'
            ? 'bg-background shadow-sm font-medium'
            : 'text-muted-foreground'
        }`}
      >
        <Youtube className="h-3.5 w-3.5" /> Direct publish
      </button>
    </div>
  );
}

interface AssetRowProps {
  icon: React.ReactNode;
  label: string;
  detail: string;
  kind: 'image' | 'text';
  copyTestId: string | undefined;
  copyContent: string | undefined;
  dlTestId: string | undefined;
  dlTooltipTestId: string | undefined;
  dlFilename: string | undefined;
  imageUrlByFilename: Map<string, string>;
  /** Injected by parent — defaults to navigator.clipboard.writeText */
  onCopyText: (text: string) => void;
  onDownloadImage: (filename: string) => void;
}

function AssetRow({
  icon,
  label,
  detail,
  kind,
  copyTestId,
  copyContent,
  dlTestId,
  dlTooltipTestId,
  dlFilename,
  imageUrlByFilename,
  onCopyText,
  onDownloadImage,
}: AssetRowProps) {
  function handleCopy() {
    if (copyContent !== undefined) {
      onCopyText(copyContent);
    }
  }

  const hasUrl = dlFilename !== undefined && imageUrlByFilename.has(dlFilename);

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
        <Check className="h-3.5 w-3.5" />
      </div>
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground truncate">{detail}</p>
      </div>
      <div className="flex gap-1">
        {kind === 'text' && copyContent !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={handleCopy}
            data-testid={copyTestId}
          >
            <Copy className="h-3 w-3" /> Copy
          </Button>
        )}
        {kind === 'image' && dlTestId && dlTooltipTestId && dlFilename && (
          hasUrl ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => onDownloadImage(dlFilename)}
              data-testid={dlTestId}
            >
              <Download className="h-3 w-3" />
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* Wrap in span so Tooltip works on disabled button */}
                  <span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      disabled
                      data-testid={dlTestId}
                      aria-describedby={dlTooltipTestId}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {COMING_NEXT_TOOLTIP}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        )}
        {/* Tooltip text rendered inline for test accessibility (portals are hard to query) */}
        {kind === 'image' && dlTooltipTestId && !hasUrl && (
          <span className="sr-only" data-testid={dlTooltipTestId}>
            {COMING_NEXT_TOOLTIP}
          </span>
        )}
      </div>
    </div>
  );
}

function BundleActions({
  hasManifest,
  isDownloading,
  onDownload,
}: {
  hasManifest: boolean;
  isDownloading: boolean;
  onDownload: () => void;
}) {
  return (
    <div className="space-y-3" data-testid="video-publish-bundle-actions">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium">Download everything at once</p>
            <p className="text-[11px] text-muted-foreground">
              ZIP with images + .txt with title, description, tags, pinned comment, lower-third cues.
            </p>
          </div>
          {hasManifest ? (
            <Button
              size="lg"
              className="gap-2"
              disabled={isDownloading}
              onClick={onDownload}
              data-testid="bundle-download-cta"
            >
              {isDownloading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              {isDownloading ? 'Building ZIP…' : 'Download bundle (.zip)'}
            </Button>
          ) : (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="lg" className="gap-2" disabled data-testid="bundle-download-cta">
                        <Download className="h-4 w-4" /> Download bundle (.zip)
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {COMING_NEXT_TOOLTIP}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* Tooltip text rendered inline for test accessibility */}
              <span className="sr-only" data-testid="bundle-download-tooltip">
                {COMING_NEXT_TOOLTIP}
              </span>
            </>
          )}
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted-foreground text-center">
        Next step: upload the video in YouTube Studio and paste these assets into the corresponding fields.
      </p>
    </div>
  );
}

// ── Direct mode: Connect YouTube prompt ───────────────────────────────────────

function ConnectYouTubePrompt() {
  return (
    <div
      className="rounded-lg border border-dashed p-6 flex flex-col items-center justify-center gap-3 text-center"
      data-testid="yt-connect-prompt"
    >
      <Youtube className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">Connect YouTube to publish directly</p>
      <p className="text-xs text-muted-foreground">
        Link your YouTube channel in Channel Settings to enable direct publish.
      </p>
      <Button variant="outline" size="sm" className="gap-2 mt-1">
        <ExternalLink className="h-3.5 w-3.5" />
        Connect YouTube
      </Button>
    </div>
  );
}

// ── Direct mode: Publish form ─────────────────────────────────────────────────

type DirectPublishState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; videoId: string; url: string }
  | { kind: 'error'; code: string; message: string };

interface DirectPublishFormProps {
  draftId?: string;
  draftJson: unknown;
  youtubeTarget: PublishTarget;
  onPublish?: (values: DirectFormValues) => Promise<YouTubePublishResult>;
}

function DirectPublishForm({ draftJson, onPublish }: DirectPublishFormProps) {
  const [state, setState] = useState<DirectPublishState>({ kind: 'idle' });
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('private');
  const [categoryId, setCategoryId] = useState('22');
  const [madeForKids, setMadeForKids] = useState(false);
  const [language, setLanguage] = useState('en');
  const [videoFile, setVideoFile] = useState<File | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill title from draft_json
  const draftTitle =
    draftJson !== null && typeof draftJson === 'object' && 'video_title' in (draftJson as object)
      ? String((draftJson as Record<string, unknown>).video_title ?? '')
      : '';

  async function handlePublish() {
    setState({ kind: 'submitting' });
    const values: DirectFormValues = { visibility, categoryId, madeForKids, language, videoFile };
    if (onPublish) {
      const result = await onPublish(values);
      if (result.ok) {
        setState({ kind: 'success', videoId: result.videoId, url: result.url });
      } else {
        setState({ kind: 'error', code: result.code, message: result.message });
      }
    } else {
      // No onPublish provided — dry-run stub for standalone renders
      setState({ kind: 'success', videoId: 'preview-only', url: '#' });
    }
  }

  if (state.kind === 'success') {
    return (
      <div
        className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-5 flex flex-col gap-3"
        data-testid="yt-success-card"
      >
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <Check className="h-5 w-5" />
          <p className="text-sm font-medium">Published to YouTube</p>
        </div>
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs underline text-emerald-700 dark:text-emerald-400 break-all"
        >
          {state.url}
        </a>
      </div>
    );
  }

  if (state.kind === 'error') {
    if (state.code === 'YOUTUBE_AUTH_FAILED') {
      return (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-5 flex flex-col gap-3"
          data-testid="yt-error-auth-failed"
        >
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm font-medium">Authentication failed</p>
          </div>
          <p className="text-xs text-muted-foreground">{state.message}</p>
          <Button variant="outline" size="sm" className="gap-2 self-start">
            <RefreshCcw className="h-3.5 w-3.5" />
            Reconnect channel
          </Button>
        </div>
      );
    }

    if (state.code === 'YOUTUBE_QUOTA_EXCEEDED') {
      return (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-5 flex flex-col gap-3"
          data-testid="yt-error-quota"
        >
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Clock className="h-5 w-5" />
            <p className="text-sm font-medium">YouTube quota exceeded</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Try again tomorrow — YouTube resets daily upload quotas at midnight Pacific.
          </p>
        </div>
      );
    }

    // YOUTUBE_REJECTED — surface reason verbatim
    return (
      <div
        className="rounded-lg border border-destructive/40 bg-destructive/5 p-5 flex flex-col gap-3"
        data-testid="yt-error-rejected"
      >
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm font-medium">YouTube rejected the upload</p>
        </div>
        <p className="text-xs text-muted-foreground break-all">{state.message}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setState({ kind: 'idle' })}
          className="self-start"
        >
          Try again
        </Button>
      </div>
    );
  }

  const isSubmitting = state.kind === 'submitting';

  return (
    <div className="space-y-4" data-testid="video-publish-direct-form">
      {/* Video file dropzone */}
      <div
        className="rounded-lg border-2 border-dashed p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/50 transition-colors"
        data-testid="yt-video-dropzone"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        role="button"
        tabIndex={0}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">
          {videoFile ? videoFile.name : 'Click or drag to upload video (.mp4)'}
        </p>
        <p className="text-xs text-muted-foreground">Max 2 GB — proxied via API</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/*"
          className="hidden"
          onChange={(e) => setVideoFile(e.target.files?.[0])}
        />
      </div>

      {/* Pre-filled title from draft */}
      {draftTitle && (
        <p className="text-xs text-muted-foreground">
          Title: <span className="font-medium text-foreground">{draftTitle}</span>
        </p>
      )}

      {/* YouTube-API-only fields */}
      <div className="space-y-3">
        {/* Visibility */}
        <div className="space-y-1">
          <Label htmlFor="yt-visibility" className="text-xs">Visibility</Label>
          <Select
            value={visibility}
            onValueChange={(v) => setVisibility(v as typeof visibility)}
          >
            <SelectTrigger id="yt-visibility" data-testid="yt-field-visibility" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="unlisted">Unlisted</SelectItem>
              <SelectItem value="public">Public</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Category */}
        <div className="space-y-1">
          <Label htmlFor="yt-category" className="text-xs">Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="yt-category" data-testid="yt-field-category" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="22">People &amp; Blogs</SelectItem>
              <SelectItem value="28">Science &amp; Technology</SelectItem>
              <SelectItem value="27">Education</SelectItem>
              <SelectItem value="24">Entertainment</SelectItem>
              <SelectItem value="25">News &amp; Politics</SelectItem>
              <SelectItem value="26">Howto &amp; Style</SelectItem>
              <SelectItem value="19">Travel &amp; Events</SelectItem>
              <SelectItem value="17">Sports</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Language */}
        <div className="space-y-1">
          <Label htmlFor="yt-language" className="text-xs">Language</Label>
          <Input
            id="yt-language"
            data-testid="yt-field-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="en"
            className="h-8 text-xs"
          />
        </div>

        {/* Made for kids */}
        <div className="flex items-center gap-2" data-testid="yt-field-made-for-kids">
          <Checkbox
            id="yt-made-for-kids"
            checked={madeForKids}
            onCheckedChange={(v) => setMadeForKids(Boolean(v))}
          />
          <Label htmlFor="yt-made-for-kids" className="text-xs cursor-pointer">
            Made for kids (COPPA)
          </Label>
        </div>
      </div>

      {/* Publish CTA */}
      <Button
        data-testid="yt-publish-cta"
        onClick={handlePublish}
        disabled={isSubmitting}
        className="w-full gap-2"
        size="lg"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Publishing…
          </>
        ) : (
          <>
            <Youtube className="h-4 w-4" />
            Publish to YouTube
          </>
        )}
      </Button>
    </div>
  );
}
