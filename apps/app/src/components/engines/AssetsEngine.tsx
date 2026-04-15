'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, Database } from 'lucide-react';
import { toast } from 'sonner';
import { AssetGallery } from '@/components/preview/AssetGallery';
import { ContextBanner } from './ContextBanner';
import { ImportPicker } from './ImportPicker';
import { Badge } from '@/components/ui/badge';
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
  draftId?: string;
  draftStatus?: string;
}

export function AssetsEngine({
  mode: engineMode,
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

  // Import mode: show ImportPicker when mode='import' and no draftId
  if (engineMode === 'import' && !draftId) {
    return (
      <div className="space-y-6">
        <ContextBanner stage="assets" context={context} onBack={onBack} />

        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Assets</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Import assets from your library.
            </p>
          </div>

          <ImportPicker
            entityType="content-assets"
            channelId={channelId}
            searchPlaceholder="Search assets..."
            emptyMessage="No assets in library yet"
            renderItem={(item: Record<string, unknown>): React.ReactNode => {
              const url = item.url as string | undefined;
              const altText = item.alt_text as string | undefined;
              const role = item.role as string | undefined;
              const sourceType = item.source_type as string | undefined;

              return (
                <div className="p-3 rounded-lg border hover:border-primary/50 transition-colors">
                  <div className="flex items-start gap-3">
                    {url && (
                      <img
                        src={url}
                        alt={altText || ''}
                        className="h-16 w-16 rounded object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {role && (
                          <Badge variant="outline" className="text-[10px]">
                            {role}
                          </Badge>
                        )}
                        {sourceType && (
                          <Badge variant="secondary" className="text-[10px]">
                            {sourceType}
                          </Badge>
                        )}
                      </div>
                      {altText && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {altText}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            }}
            onSelect={(item) => {
              onComplete({
                assetIds: [item.id as string],
                featuredImageUrl: (item.url as string | undefined) || undefined,
              } as AssetsResult);
            }}
          />
        </div>
      </div>
    );
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
        draftStatus={draftStatus ?? ''}
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
