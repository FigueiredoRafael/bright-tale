/**
 * F4-008 — Whisper captions (OpenAI Whisper API).
 *
 * Gera legendas .srt/.vtt a partir do áudio TTS. OpenAI Whisper API é
 * paga mas barata ($0.006/min). Para grandes volumes, considerar
 * whisper.cpp self-hosted no worker FFmpeg.
 */
// Named import, not default: Vercel's CJS resolver returns the module namespace
// object for the default import, failing with TS2709 (type) and TS2351 (value).
import { OpenAI } from 'openai';

export interface TranscriptionResult {
  text: string;
  srt: string;        // SubRip format
  vtt: string;        // WebVTT format
  languageDetected?: string;
  durationSeconds: number;
}

export async function transcribeAudio(audio: Buffer, filename = 'audio.mp3'): Promise<TranscriptionResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY required for Whisper transcription');
  const client = new OpenAI({ apiKey: key });

  // File wrapper pro SDK do OpenAI.
  const file = new File([new Uint8Array(audio)], filename, { type: 'audio/mpeg' });

  // Pede SRT direto (OpenAI suporta múltiplos response_formats).
  const srtRes = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'srt',
  });
  const srt = typeof srtRes === 'string' ? srtRes : '';

  // Segundo call pro VTT. Poderia converter SRT→VTT localmente, mas é só
  // trocar headers — mais simples re-chamar.
  const vttRes = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'vtt',
  });
  const vtt = typeof vttRes === 'string' ? vttRes : '';

  // Extrair plain text do SRT.
  const text = srt
    .split('\n')
    .filter((l) => !!l && !/^\d+$/.test(l) && !/^\d+:\d+/.test(l))
    .join(' ')
    .trim();

  // Approx duration from last SRT timestamp.
  const matches = [...srt.matchAll(/(\d{2}):(\d{2}):(\d{2}),\d+/g)];
  const last = matches[matches.length - 1];
  const durationSeconds = last
    ? Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3])
    : 0;

  return { text, srt, vtt, durationSeconds };
}
