'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { AssetGallery } from '@/components/preview/AssetGallery';
import { ContextBanner } from './ContextBanner';
import type { BaseEngineProps, AssetsResult } from './types';

interface ContentAsset {
  id: string;
  url: string;
  webpUrl: string | null;
  role: string | null;
  altText: string | null;
  sourceType: string;
}

interface AssetsEngineProps extends BaseEngineProps {
  draftId: string;
  draftStatus: string;
}

export function AssetsEngine({
  channelId,
  context,
  draftId,
  draftStatus,
  onComplete,
  onBack,
}: AssetsEngineProps) {
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const inFlightRef = useRef(false);

  // Fetch assets on mount
  useEffect(() => {
    async function fetchAssets() {
      try {
        const res = await fetch(`/api/assets?draft_id=${draftId}`);
        const { data } = await res.json();
        const items = Array.isArray(data) ? data : (data?.assets ?? data?.items ?? []);
        if (items.length > 0) {
          setAssets(
            (items as Array<Record<string, unknown>>).map((a) => ({
              id: a.id as string,
              url: a.url as string,
              webpUrl: (a.webp_url as string) ?? null,
              role: (a.role as string) ?? null,
              altText: (a.alt_text as string) ?? null,
              sourceType: (a.source_type as string) ?? 'ai_generated',
            })),
          );
        }
      } catch (error) {
        toast.error('Failed to load assets');
      } finally {
        setLoading(false);
      }
    }

    void fetchAssets();
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

  async function handleGenerateAll() {
    await withGuard(async () => {
      try {
        setGenerating(true);
        const res = await fetch(`/api/content-drafts/${draftId}/generate-assets`, {
          method: 'POST',
        });
        const json = await res.json();
        if (json?.error) {
          toast.error(json.error.message ?? 'Failed to generate assets');
          return;
        }
        // Refetch assets
        const assetsRes = await fetch(`/api/assets?draft_id=${draftId}`);
        const assetsJson = await assetsRes.json();
        const items = Array.isArray(assetsJson.data)
          ? assetsJson.data
          : (assetsJson.data?.assets ?? assetsJson.data?.items ?? []);
        if (items.length > 0) {
          setAssets(
            (items as Array<Record<string, unknown>>).map((a) => ({
              id: a.id as string,
              url: a.url as string,
              webpUrl: (a.webp_url as string) ?? null,
              role: (a.role as string) ?? null,
              altText: (a.alt_text as string) ?? null,
              sourceType: (a.source_type as string) ?? 'ai_generated',
            })),
          );
        }
        toast.success('Assets generated');
      } catch (error) {
        toast.error('Failed to generate assets');
      } finally {
        setGenerating(false);
      }
    });
  }

  async function handleRegenerate(assetId: string) {
    await withGuard(async () => {
      try {
        const res = await fetch(`/api/assets/${assetId}/regenerate`, {
          method: 'POST',
        });
        const json = await res.json();
        if (json?.error) {
          toast.error(json.error.message ?? 'Failed to regenerate asset');
          return;
        }
        // Refetch assets
        const assetsRes = await fetch(`/api/assets?draft_id=${draftId}`);
        const assetsJson = await assetsRes.json();
        const items = Array.isArray(assetsJson.data)
          ? assetsJson.data
          : (assetsJson.data?.assets ?? assetsJson.data?.items ?? []);
        if (items.length > 0) {
          setAssets(
            (items as Array<Record<string, unknown>>).map((a) => ({
              id: a.id as string,
              url: a.url as string,
              webpUrl: (a.webp_url as string) ?? null,
              role: (a.role as string) ?? null,
              altText: (a.alt_text as string) ?? null,
              sourceType: (a.source_type as string) ?? 'ai_generated',
            })),
          );
        }
        toast.success('Asset regenerated');
      } catch (error) {
        toast.error('Failed to regenerate asset');
      }
    });
  }

  async function handleDelete(assetId: string) {
    await withGuard(async () => {
      try {
        const res = await fetch(`/api/assets/${assetId}`, {
          method: 'DELETE',
        });
        const json = await res.json();
        if (json?.error) {
          toast.error(json.error.message ?? 'Failed to delete asset');
          return;
        }
        setAssets(assets.filter((a) => a.id !== assetId));
        toast.success('Asset deleted');
      } catch (error) {
        toast.error('Failed to delete asset');
      }
    });
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading assets...</div>;
  }

  // Find featured image for context
  const featuredImageUrl = assets.find((a) => a.role === 'featured_image')?.url;

  return (
    <div className="space-y-6">
      <ContextBanner stage="assets" context={context} onBack={onBack} />

      <AssetGallery
        assets={assets}
        draftStatus={draftStatus}
        onGenerateAll={draftStatus === 'approved' ? handleGenerateAll : undefined}
        onRegenerate={draftStatus === 'approved' ? handleRegenerate : undefined}
        onDelete={draftStatus === 'approved' ? handleDelete : undefined}
      />

      {draftStatus === 'approved' && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="py-4">
            <Button
              onClick={() => {
                const result: AssetsResult = {
                  assetIds: assets.map((a) => a.id),
                  featuredImageUrl,
                };
                onComplete(result);
              }}
              disabled={generating}
              className="w-full gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Continue to Publish
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
