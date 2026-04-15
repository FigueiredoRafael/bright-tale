'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ContentAsset {
  id: string;
  url: string;
  webpUrl: string | null;
  role: string | null;
  altText: string | null;
  sourceType: string;
}

interface AssetGalleryProps {
  assets: ContentAsset[];
  draftStatus: string;
  onGenerateAll?: () => void;
  onUpload?: (role: string) => void;
  onRegenerate?: (assetId: string) => void;
  onDelete?: (assetId: string) => void;
}

const ROLE_LABELS: Record<string, string> = {
  featured_image: 'Featured Image',
  body_section_1: 'Body Section 1',
  body_section_2: 'Body Section 2',
  body_section_3: 'Body Section 3',
  body_section_4: 'Body Section 4',
  body_section_5: 'Body Section 5',
  thumbnail: 'Thumbnail',
  thumbnail_alt: 'Thumbnail Alt',
  meta_og: 'OG Image',
};

export function AssetGallery({
  assets,
  draftStatus,
  onGenerateAll,
  onUpload,
  onRegenerate,
  onDelete,
}: AssetGalleryProps) {
  const isApproved = draftStatus === 'approved' || draftStatus === 'published' || draftStatus === 'scheduled';
  // Assets arrive newest-first (DESC). Keep first occurrence per role so the
  // most recent upload wins and stale duplicates don't overwrite it.
  const assetsByRole = new Map<string, ContentAsset>();
  for (const asset of assets) {
    if (asset.role && !assetsByRole.has(asset.role)) {
      assetsByRole.set(asset.role, asset);
    }
  }

  const roles = ['featured_image', 'body_section_1', 'body_section_2', 'body_section_3'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Assets</h3>
        {isApproved && onGenerateAll && (
          <Button size="sm" onClick={onGenerateAll}>
            Generate All Missing
          </Button>
        )}
      </div>

      {!isApproved && (
        <p className="text-sm text-muted-foreground">
          Assets can be generated or uploaded after the draft is approved.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        {roles.map((role) => {
          const asset = assetsByRole.get(role);
          return (
            <Card key={role} className="overflow-hidden">
              <CardContent className="p-0">
                {asset ? (
                  <div className="relative group">
                    <img
                      src={asset.webpUrl ?? asset.url}
                      alt={asset.altText ?? role}
                      className="w-full h-40 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      {onRegenerate && (
                        <Button size="sm" variant="secondary" onClick={() => onRegenerate(asset.id)}>
                          Regenerate
                        </Button>
                      )}
                      {onDelete && (
                        <Button size="sm" variant="destructive" onClick={() => onDelete(asset.id)}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-40 flex flex-col items-center justify-center bg-muted/50 gap-2">
                    {isApproved && onUpload ? (
                      <Button size="sm" variant="outline" onClick={() => onUpload(role)}>
                        Upload
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Empty</span>
                    )}
                  </div>
                )}
                <div className="p-2 flex items-center justify-between">
                  <span className="text-xs font-medium">{ROLE_LABELS[role] ?? role}</span>
                  {asset && (
                    <Badge variant="outline" className="text-[10px]">
                      {asset.sourceType === 'ai_generated' ? 'AI' : asset.sourceType === 'manual_upload' ? 'Upload' : 'Unsplash'}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
