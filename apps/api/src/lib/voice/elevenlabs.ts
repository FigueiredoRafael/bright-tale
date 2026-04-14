/**
 * F4-001 — ElevenLabs TTS provider.
 *
 * Implementação usando a API oficial (docs: https://elevenlabs.io/docs/api-reference).
 * Requer `ELEVENLABS_API_KEY` no env. Modelo default `eleven_multilingual_v2`
 * suporta pt-BR com qualidade superior ao OpenAI TTS standard.
 *
 * Custo aproximado (2025):
 * - Free tier: 10k chars/mês
 * - Starter ($5/mês): 30k chars
 * - Creator ($22/mês): 100k chars + voice clone
 *
 * Um vídeo de 5 min (~750 palavras, ~4.5k chars) = ~$0.22 no plano pay-as-you-go.
 */
import type { VoiceProvider, VoiceSynthesisParams, VoiceSynthesisResult, VoiceOption } from './provider.js';

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';

export class ElevenLabsProvider implements VoiceProvider {
  readonly name = 'elevenlabs';
  private apiKey: string;
  private modelId: string;

  constructor(apiKey: string, modelId = 'eleven_multilingual_v2') {
    this.apiKey = apiKey;
    this.modelId = modelId;
  }

  async synthesize(params: VoiceSynthesisParams): Promise<VoiceSynthesisResult> {
    const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${params.voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: params.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      },
      body: JSON.stringify({
        text: params.text,
        model_id: this.modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: params.style ? 0.5 : 0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ElevenLabs ${res.status}: ${err.slice(0, 200)}`);
    }

    const audio = Buffer.from(await res.arrayBuffer());
    // ElevenLabs responde com ~150 chars/second de áudio no default.
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
    const res = await fetch(`${ELEVENLABS_API}/voices`, {
      headers: { 'xi-api-key': this.apiKey },
    });
    if (!res.ok) throw new Error(`ElevenLabs listVoices: ${res.status}`);
    interface ApiVoice {
      voice_id: string;
      name: string;
      labels?: { language?: string; gender?: string };
      preview_url?: string;
    }
    const json = await res.json() as { voices?: ApiVoice[] };
    return (json.voices ?? []).map((v) => ({
      id: v.voice_id,
      label: v.name,
      language: v.labels?.language,
      gender: v.labels?.gender,
      sampleUrl: v.preview_url,
    }));
  }
}
