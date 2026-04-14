/**
 * F4-005 — Stock footage providers (Pexels + Pixabay).
 *
 * APIs gratuitas, só precisam de API key (registro grátis). Usadas pro
 * dark channel video gerar b-roll footage com base em keywords.
 */

export interface StockClip {
  provider: 'pexels' | 'pixabay';
  id: string;
  url: string;             // video file URL (mp4)
  thumbnailUrl: string;
  duration: number;        // seconds
  width: number;
  height: number;
  tags: string[];
}

export async function searchPexels(query: string, limit = 10): Promise<StockClip[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const res = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${limit}`,
    { headers: { Authorization: key } },
  );
  if (!res.ok) return [];
  interface PexelsVideo {
    id: number;
    duration: number;
    width: number;
    height: number;
    image: string;
    video_files: Array<{ link: string; quality: string; width: number; height: number }>;
    tags?: string[];
  }
  const json = await res.json() as { videos?: PexelsVideo[] };
  return (json.videos ?? []).map((v) => {
    const hd = v.video_files.find((f) => f.quality === 'hd') ?? v.video_files[0];
    return {
      provider: 'pexels' as const,
      id: String(v.id),
      url: hd.link,
      thumbnailUrl: v.image,
      duration: v.duration,
      width: v.width,
      height: v.height,
      tags: v.tags ?? [],
    };
  });
}

export async function searchPixabay(query: string, limit = 10): Promise<StockClip[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const res = await fetch(
    `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&per_page=${limit}`,
  );
  if (!res.ok) return [];
  interface PixabayVideo {
    id: number;
    duration: number;
    videos: {
      large?: { url: string; width: number; height: number };
      medium?: { url: string; width: number; height: number };
    };
    picture_id?: string;
    tags?: string;
  }
  const json = await res.json() as { hits?: PixabayVideo[] };
  return (json.hits ?? []).map((v) => {
    const file = v.videos.large ?? v.videos.medium;
    return {
      provider: 'pixabay' as const,
      id: String(v.id),
      url: file?.url ?? '',
      thumbnailUrl: v.picture_id ? `https://i.vimeocdn.com/video/${v.picture_id}_640x360.jpg` : '',
      duration: v.duration,
      width: file?.width ?? 0,
      height: file?.height ?? 0,
      tags: (v.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    };
  });
}

/** Busca em ambos em paralelo, dedupe por provider+id. */
export async function searchStock(query: string, limit = 10): Promise<StockClip[]> {
  const [pexels, pixabay] = await Promise.all([
    searchPexels(query, limit).catch(() => []),
    searchPixabay(query, limit).catch(() => []),
  ]);
  return [...pexels, ...pixabay];
}
