/**
 * Voice provider factory. Retorna o provider configurado baseado no canal
 * (voice_provider + env keys).
 */
import { ElevenLabsProvider } from './elevenlabs.js';
import { OpenAITtsProvider } from './openai-tts.js';
import type { VoiceProvider } from './provider.js';

export function getVoiceProvider(providerName: string | null | undefined): VoiceProvider | null {
  const chosen = providerName ?? 'elevenlabs';
  if (chosen === 'elevenlabs') {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return null;
    return new ElevenLabsProvider(key);
  }
  if (chosen === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    return new OpenAITtsProvider(key);
  }
  return null;
}

export type { VoiceProvider, VoiceOption, VoiceSynthesisParams, VoiceSynthesisResult } from './provider.js';
