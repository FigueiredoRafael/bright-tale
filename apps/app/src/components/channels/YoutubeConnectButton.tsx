'use client';

/**
 * YoutubeConnectButton (issue #217)
 *
 * Shows a "Connect YouTube" button when the channel has no connected YouTube
 * publish target, or a "Connected" badge + channel handle when it does.
 *
 * Clicking the button calls POST /api/channels/:id/youtube/connect, which
 * returns a Google OAuth consent URL. The user is then redirected to that URL.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Youtube, Loader2, CheckCircle2 } from 'lucide-react';

interface YoutubeConnectButtonProps {
  channelId: string;
  isConnected: boolean;
  /** Connected channel handle or display name (e.g. "@mychannel") */
  displayName?: string;
}

export function YoutubeConnectButton({
  channelId,
  isConnected,
  displayName,
}: YoutubeConnectButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/channels/${channelId}/youtube/connect`, {
        method: 'POST',
      });

      const json = (await res.json()) as {
        data: { url: string } | null;
        error: { code: string; message: string } | null;
      };

      if (!res.ok || json.error || !json.data?.url) {
        throw new Error(json.error?.message ?? 'Failed to start YouTube connection');
      }

      // Redirect to Google OAuth consent page
      window.location.href = json.data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect YouTube');
      setLoading(false);
    }
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-2">
        <Badge
          variant="secondary"
          className="gap-1.5 text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
          data-testid="yt-connected-badge"
        >
          <CheckCircle2 className="h-3 w-3" />
          Connected
        </Badge>
        {displayName && (
          <span className="text-sm text-muted-foreground">{displayName}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
        onClick={handleConnect}
        disabled={loading}
        data-testid="yt-connect-button"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Youtube className="h-4 w-4" />
        )}
        {loading ? 'Connecting…' : 'Connect YouTube'}
      </Button>
      {error && (
        <p
          className="text-xs text-destructive"
          data-testid="yt-connect-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
