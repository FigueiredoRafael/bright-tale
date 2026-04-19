'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Search, Image, FileAudio, Video, Download, Trash2 } from 'lucide-react';

interface Asset {
  id: string;
  asset_type: string;
  source: string;
  original_url: string | null;
  storage_path: string | null;
  alt_text: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  image: Image,
  audio: FileAudio,
  video: Video,
};

const TYPE_COLORS: Record<string, string> = {
  image: 'bg-blue-500/10 text-blue-500',
  audio: 'bg-purple-500/10 text-purple-500',
  video: 'bg-red-500/10 text-red-500',
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchAssets = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/assets?${params}`);
      const json = await res.json();

      if (json.data) {
        const items = Array.isArray(json.data)
          ? json.data
          : (json.data.assets ?? json.data.items ?? []);
        setAssets(Array.isArray(items) ? items : []);
        setTotal(json.data.total ?? items.length ?? 0);
      }
    } catch {
      toast.error('Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this asset?')) return;

    try {
      const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
      const json = await res.json();

      if (json.error) {
        toast.error(json.error.message);
      } else {
        toast.success('Asset deleted');
        fetchAssets();
      }
    } catch {
      toast.error('Failed to delete asset');
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assets</h1>
          <p className="text-muted-foreground text-sm">
            {total} asset{total !== 1 ? 's' : ''} in your library
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search assets..."
          className="pl-10"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image aria-hidden className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No assets yet</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Assets will appear here when you generate images or upload files
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {assets.map((asset) => {
              const TypeIcon = TYPE_ICONS[asset.asset_type] ?? Image;
              const colorClass = TYPE_COLORS[asset.asset_type] ?? 'bg-gray-500/10 text-gray-500';

              return (
                <Card key={asset.id} className="group overflow-hidden">
                  <div className="aspect-square bg-muted flex items-center justify-center relative">
                    {asset.asset_type === 'image' && asset.original_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={asset.original_url}
                        alt={asset.alt_text ?? 'Asset'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <TypeIcon className="h-12 w-12 text-muted-foreground" />
                    )}

                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      {asset.original_url && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => window.open(asset.original_url!, '_blank')}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(asset.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={colorClass}>
                        {asset.asset_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {asset.source}
                      </span>
                    </div>
                    {asset.alt_text && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {asset.alt_text}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {total > 20 && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground self-center">
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= Math.ceil(total / 20)}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
