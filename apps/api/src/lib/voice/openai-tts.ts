/**
 * F4-002 — OpenAI TTS provider. Fallback econômico pro ElevenLabs.
 *
 * Custo (2025): $15/1M chars (tts-1) ou $30/1M chars (tts-1-hd). Um vídeo de
 * 5 min custa ~$0.07 (tts-1) vs ~$0.22 (ElevenLabs).
 *
 * Qualidade aceitável pra narração rápida, mas emotion range é limitada.
 * Recomendado só quando budget é prioridade absoluta.
 */
import OpenAI from 'openai';
import type { VoiceProvider, VoiceSynthesisParams, VoiceSynthesisResult, VoiceOption } from './provider.js';

const VOICES: VoiceOption[] = [
  { id: 'alloy', label: 'Alloy', gender: 'neutral' },
  { id: 'echo', label: 'Echo', gender: 'male' },
  { id: 'fable', label: 'Fable', gender: 'male' },
  { id: 'onyx', label: 'Onyx', gender: 'male' },
  { id: 'nova', label: 'Nova', gender: 'female' },
  { id: 'shimmer', label: 'Shimmer', gender: 'female' },
];

export class OpenAITtsProvider implements VoiceProvider {
  readonly name = 'openai-tts';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: 'tts-1' | 'tts-1-hd' = 'tts-1') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async synthesize(params: VoiceSynthesisParams): Promise<VoiceSynthesisResult> {
    const response = await this.client.audio.speech.create({
      model: this.model,
      voice: params.voiceId as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
      input: params.text,
      response_format: params.format === 'wav' ? 'wav' : 'mp3',
      speed: params.speed ?? 1.0,
    });
    const audio = Buffer.from(await response.arrayBuffer());
    const estimatedSeconds = Math.ceil(params.text.length / 15);
    return {
      audio,
      mimeType: params.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      estimatedSeconds,
      providerName: this.name,
      voiceId: params.voiceId,
    };
  }

  async listVoices(): Promise<VoiceOption[]> {
    return VOICES;
  }
}
