'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ConnectedTarget {
  id: string;
  displayName: string;
  configJson: {
    channelTitle?: string;
    channelHandle?: string;
  } | null;
}

interface Props {
  channelId: string;
  connectedTarget: ConnectedTarget | null;
}

/**
 * YoutubeConnectButton — S8
 *
 * Shows "Connect YouTube" when not yet connected, or channel name + handle
 * when a youtube publish target exists. Clicking initiates the Google OAuth flow.
 */
export function YoutubeConnectButton({ channelId, connectedTarget }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/channels/${channelId}/youtube/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const { data, error: apiError } = (await res.json()) as {
        data: { url: string } | null;
        error: { code: string; message: string } | null;
      };

      if (apiError || !data) {
        setError(apiError?.message ?? 'Failed to start YouTube connection');
        return;
      }

      // Redirect to Google consent screen
      window.location.assign(data.url);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (connectedTarget) {
    const title = connectedTarget.configJson?.channelTitle ?? connectedTarget.displayName;
    const handle = connectedTarget.configJson?.channelHandle;

    return (
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium">{title}</p>
          {handle && <p className="text-xs text-muted-foreground">{handle}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={handleConnect} disabled={loading}>
          {loading ? 'Connecting...' : 'Reconnect'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleConnect} disabled={loading} variant="default">
        {loading ? 'Connecting...' : 'Connect YouTube'}
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
