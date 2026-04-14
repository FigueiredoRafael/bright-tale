/**
 * F4-006/007 — Video render pipeline (scaffold).
 *
 * IMPLEMENTAÇÃO PENDENTE — depende de deploy de FFmpeg worker.
 *
 * Arquitetura esperada:
 *
 * 1. **Worker:** Serviço separado rodando num host com FFmpeg + armazenamento
 *    (sugestão: Fly.io machine com volumes, ou Render background worker).
 *    Worker pega jobs via Inngest (`video/render`) e processa offline.
 *
 * 2. **API trigger:** `POST /content-drafts/:id/render` enfileira o job.
 *
 * 3. **Assets input:** worker baixa stock clips (F4-005), TTS audio (F4-003),
 *    Whisper captions (F4-008), e imagens (F4-042).
 *
 * 4. **Composição:** templates FFmpeg pre-definidos (talking head, dark
 *    channel, shorts vertical). Audio track alinhado com texto, cortes
 *    baseados nos chapters do draft, legendas queimadas ou .srt separado.
 *
 * 5. **Output:** mp4 H.264 720p ou 1080p, subido pro Supabase Storage
 *    (bucket `rendered-videos`), URL salva em `content_drafts.draft_json.render`.
 *
 * Custo estimado:
 * - Fly.io machine dedicada com FFmpeg: ~$8/mês + egress
 * - Render times: 30s–3min por vídeo de 5 min
 */

export interface RenderJob {
  draftId: string;
  style: 'talking_head' | 'dark_channel' | 'shorts_vertical';
  teleprompterScript: string;
  chapters?: Array<{ timestamp?: string; title?: string; content?: string }>;
  audioUrl?: string;           // TTS output
  captionUrl?: string;         // Whisper SRT
  stockClips?: Array<{ url: string; timing?: string }>;
  images?: Array<{ url: string; timing?: string }>;
  resolution: '720p' | '1080p' | '4k';
  format: 'horizontal' | 'vertical';
}

export interface RenderResult {
  videoUrl: string;
  durationSeconds: number;
  sizeBytes: number;
  renderDurationMs: number;
}

export function isRenderWorkerAvailable(): boolean {
  return !!process.env.VIDEO_WORKER_URL;
}

/**
 * Stub — envia o job pro worker se configurado, ou lança erro instrutivo.
 */
export async function requestRender(_job: RenderJob): Promise<RenderResult> {
  if (!isRenderWorkerAvailable()) {
    throw new Error(
      'Video render worker não configurado. Setar VIDEO_WORKER_URL ou implementar o worker — ver apps/api/src/lib/video/render.ts pro roadmap.',
    );
  }
  throw new Error('Video rendering pending (F4-006/007). Scaffold only.');
}
