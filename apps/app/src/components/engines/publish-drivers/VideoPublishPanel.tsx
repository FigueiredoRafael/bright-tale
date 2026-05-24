'use client';

/**
 * VideoPublishPanel — issue #215
 *
 * Renders the video-track publish surface:
 * - Target channel card (shared between modes)
 * - Mode toggle: bundle (default) / direct
 * - Asset checklist (shared between modes)
 * - Bundle actions when in bundle mode (CTA disabled — ZIP lands in #218)
 * - Direct placeholder when in direct mode (full wiring lands in #222)
 *
 * Prototype reference: apps/app/src/app/[locale]/(app)/prototype/video-engines/PublishPanel.tsx
 * Labels translated from Portuguese to English.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Rocket,
  Image as ImageIcon,
  FileText,
  MessageSquare,
  Hash,
  Type,
  Camera,
} from 'lucide-react';
import { YoutubeConnectButton } from '@/components/channels/YoutubeConnectButton';

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

interface VideoPublishPanelProps {
  /**
   * draft_json from the content_drafts row — may be empty on first mount.
   * Typed as unknown so callers with Record<string,unknown> don't need a cast;
   * the component narrows all fields via optional chaining internally.
   */
  draftJson: unknown;
  /**
   * Optional override for clipboard write — injected in tests since jsdom
   * does not implement navigator.clipboard. Defaults to navigator.clipboard.writeText.
   */
  onCopyText?: (text: string) => void;
  /**
   * Channel id — required for the YouTube OAuth connect flow (issue #217).
   * When not provided, direct mode falls back to a placeholder.
   */
  channelId?: string;
  /**
   * Whether the channel already has an active YouTube OAuth publish target.
   * When true, direct mode shows the connected state instead of the connect CTA.
   */
  youtubeConnected?: boolean;
  /**
   * Display name for the connected YouTube channel (handle or display name).
   */
  youtubeDisplayName?: string;
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

export function VideoPublishPanel({
  draftJson,
  onCopyText,
  channelId,
  youtubeConnected = false,
  youtubeDisplayName,
}: VideoPublishPanelProps) {
  const [mode, setMode] = useState<PublishMode>('bundle');

  // Default to navigator.clipboard.writeText when not injected.
  // The try/catch guard handles environments where the Clipboard API is unavailable.
  const copyText = onCopyText ?? ((text: string) => {
    try {
      void navigator.clipboard.writeText(text);
    } catch {
      // silent — older browsers or non-HTTPS contexts
    }
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
            copyContent={undefined}
            onCopyText={copyText}
          />
          <AssetRow
            icon={<Camera className="h-4 w-4" />}
            label="B-roll prompts / images"
            detail={`${totalBroll} items`}
            kind="image"
            copyTestId={undefined}
            dlTestId="dl-btn-broll"
            dlTooltipTestId="dl-tooltip-broll"
            copyContent={undefined}
            onCopyText={copyText}
          />
          <AssetRow
            icon={<Type className="h-4 w-4" />}
            label="Lower thirds (timestamps + text)"
            detail={`${lowerThirds.length} cues`}
            kind="text"
            copyTestId="copy-btn-lower-thirds"
            dlTestId={undefined}
            dlTooltipTestId={undefined}
            copyContent={lowerThirds.map((lt) => `${lt.at} ${lt.label}`).join('\n')}
            onCopyText={copyText}
          />
          <AssetRow
            icon={<Type className="h-4 w-4" />}
            label="Title"
            detail={`${videoTitle.length}/100`}
            kind="text"
            copyTestId="copy-btn-title"
            dlTestId={undefined}
            dlTooltipTestId={undefined}
            copyContent={videoTitle}
            onCopyText={copyText}
          />
          <AssetRow
            icon={<FileText className="h-4 w-4" />}
            label="Description (with chapters)"
            detail={`${videoDescription.length} chars`}
            kind="text"
            copyTestId="copy-btn-description"
            dlTestId={undefined}
            dlTooltipTestId={undefined}
            copyContent={videoDescription}
            onCopyText={copyText}
          />
          <AssetRow
            icon={<Hash className="h-4 w-4" />}
            label="Tags"
            detail={`${tags.length} tags`}
            kind="text"
            copyTestId="copy-btn-tags"
            dlTestId={undefined}
            dlTooltipTestId={undefined}
            copyContent={tags.join(', ')}
            onCopyText={copyText}
          />
          <AssetRow
            icon={<MessageSquare className="h-4 w-4" />}
            label="Pinned comment"
            detail="ready"
            kind="text"
            copyTestId="copy-btn-pinned-comment"
            dlTestId={undefined}
            dlTooltipTestId={undefined}
            copyContent={pinnedComment}
            onCopyText={copyText}
          />
        </CardContent>
      </Card>

      {/* Mode-specific actions */}
      {mode === 'bundle'
        ? <BundleActions />
        : <DirectPlaceholder
            channelId={channelId}
            youtubeConnected={youtubeConnected}
            youtubeDisplayName={youtubeDisplayName}
          />}
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
  /** Injected by parent — defaults to navigator.clipboard.writeText */
  onCopyText: (text: string) => void;
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
  onCopyText,
}: AssetRowProps) {
  function handleCopy() {
    if (copyContent !== undefined) {
      onCopyText(copyContent);
    }
  }

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
        {kind === 'image' && dlTestId && dlTooltipTestId && (
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
        )}
        {/* Tooltip text rendered inline for test accessibility (portals are hard to query) */}
        {kind === 'image' && dlTooltipTestId && (
          <span className="sr-only" data-testid={dlTooltipTestId}>
            {COMING_NEXT_TOOLTIP}
          </span>
        )}
      </div>
    </div>
  );
}

function BundleActions() {
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
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted-foreground text-center">
        Next step: upload the video in YouTube Studio and paste these assets into the corresponding fields.
      </p>
    </div>
  );
}

interface DirectPlaceholderProps {
  channelId?: string;
  youtubeConnected?: boolean;
  youtubeDisplayName?: string;
}

function DirectPlaceholder({
  channelId,
  youtubeConnected = false,
  youtubeDisplayName,
}: DirectPlaceholderProps) {
  // When a channelId is provided, show the live OAuth connect affordance
  if (channelId) {
    return (
      <div className="rounded-lg border p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Direct publish to YouTube</p>
            <p className="text-xs text-muted-foreground">
              Upload your video directly from BrightTale. Requires an OAuth connection.
            </p>
          </div>
          <YoutubeConnectButton
            channelId={channelId}
            isConnected={youtubeConnected}
            displayName={youtubeDisplayName}
          />
        </div>
        {youtubeConnected && (
          <p className="text-xs text-muted-foreground">
            Full direct upload wiring lands in issue #222.
          </p>
        )}
      </div>
    );
  }

  // Fallback: no channelId — show the original placeholder
  return (
    <div
      className="rounded-lg border border-dashed p-6 flex flex-col items-center justify-center gap-2 text-center"
      data-testid="video-publish-direct-placeholder"
    >
      <Youtube className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">Direct publish — coming soon</p>
      <p className="text-xs text-muted-foreground">
        Full direct-publish wiring lands in issue #222.
      </p>
    </div>
  );
}
