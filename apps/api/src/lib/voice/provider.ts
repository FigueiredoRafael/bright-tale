/**
 * F4-001/002/003 — Voice provider interface.
 *
 * Unified interface for TTS providers (ElevenLabs, OpenAI TTS, etc).
 * Implementations are scaffolded — require external API keys + paid tiers.
 */

export interface VoiceSynthesisParams {
  /** Plain text to narrate. Agent should strip all brackets/cues before
   *  passing here (use draft.teleprompter_script which already is clean). */
  text: string;
  /** Voice id from the provider (ElevenLabs: voice_id; OpenAI: alloy|echo|fable|onyx|nova|shimmer). */
  voiceId: string;
  /** Speech rate multiplier. 1.0 = natural. */
  speed?: number;
  /** Target file format. */
  format?: 'mp3' | 'wav' | 'ogg';
  /** Optional mood/style tag (ElevenLabs v2 models only). */
  style?: string;
}

export interface VoiceSynthesisResult {
  audio: Buffer;
  mimeType: string;
  /** Approximate duration (seconds) — useful pra credit billing. */
  estimatedSeconds: number;
  providerName: string;
  voiceId: string;
}

export interface VoiceProvider {
  readonly name: string;
  synthesize(params: VoiceSynthesisParams): Promise<VoiceSynthesisResult>;
  /** List available voices in the provider. Cached at the app level. */
  listVoices(): Promise<VoiceOption[]>;
}

export interface VoiceOption {
  id: string;
  label: string;
  language?: string;
  /** "male" | "female" | "neutral" */
  gender?: string;
  sampleUrl?: string;
}
