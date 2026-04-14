/**
 * F5-001 — YouTube upload (OAuth + Data API v3).
 *
 * SCAFFOLDED — requer setup de OAuth client no Google Cloud Console.
 *
 * Roadmap:
 * 1. GCP Console → Credentials → OAuth 2.0 client (Web app)
 *    - Authorized redirect URI: `{API_URL}/publishing/youtube/oauth/callback`
 *    - Scopes needed: `https://www.googleapis.com/auth/youtube.upload`,
 *      `https://www.googleapis.com/auth/youtube.readonly`
 *
 * 2. Setar envs:
 *    - YOUTUBE_OAUTH_CLIENT_ID
 *    - YOUTUBE_OAUTH_CLIENT_SECRET
 *
 * 3. Fluxo de upload:
 *    a. User autoriza → refresh_token salvo em `publishing_destinations.config`
 *    b. POST /publishing/youtube/upload { draftId, destinationId, title,
 *       description, tags, categoryId, privacyStatus }
 *    c. API refresh access_token → upload resumable do mp4 (lib/video output)
 *    d. Grava `published_url` + `published_at` no content_drafts
 *
 * Custo: **grátis**. Quota do YouTube Data API é 10k units/dia (default);
 * cada upload custa 1600 units → ~6 vídeos/dia por app instance. Se escalar,
 * pedir quota extra pelo formulário do Google.
 */

export interface YouTubeUploadParams {
  draftId: string;
  destinationId: string;       // publishing_destinations.id
  title: string;
  description: string;
  tags: string[];
  categoryId?: string;         // default "22" (People & Blogs)
  privacyStatus: 'private' | 'unlisted' | 'public';
  videoPath: string;           // URL ou path local do mp4
  thumbnailPath?: string;
}

export interface YouTubeUploadResult {
  videoId: string;
  url: string;
  uploadDurationMs: number;
}

export function isYouTubeConfigured(): boolean {
  return !!(process.env.YOUTUBE_OAUTH_CLIENT_ID && process.env.YOUTUBE_OAUTH_CLIENT_SECRET);
}

export function getOAuthUrl(state: string): string {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001';
  if (!clientId) throw new Error('YOUTUBE_OAUTH_CLIENT_ID não configurado');
  const scope = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
  ].join(' ');
  const redirectUri = `${apiUrl}/publishing/youtube/oauth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function uploadVideo(_params: YouTubeUploadParams): Promise<YouTubeUploadResult> {
  if (!isYouTubeConfigured()) {
    throw new Error(
      'YouTube OAuth não configurado. Set YOUTUBE_OAUTH_CLIENT_ID/SECRET em .env e implementar o upload resumable — ver apps/api/src/lib/publishing/youtube.ts',
    );
  }
  // Implementação real: usar googleapis SDK, resumable upload, com media body
  // no path do mp4 + snippet (title/description/tags/categoryId) + status
  // (privacyStatus).
  throw new Error('YouTube upload pending (F5-001). Scaffold only.');
}
