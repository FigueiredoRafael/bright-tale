import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getVoiceProvider } from '../index.js';

describe('getVoiceProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns ElevenLabs when key is set', () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const provider = getVoiceProvider('elevenlabs');
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe('elevenlabs');
  });

  it('returns null for ElevenLabs when no key', () => {
    delete process.env.ELEVENLABS_API_KEY;
    expect(getVoiceProvider('elevenlabs')).toBeNull();
  });

  it('returns OpenAI when key is set', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const provider = getVoiceProvider('openai');
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe('openai-tts');
  });

  it('returns null for OpenAI when no key', () => {
    delete process.env.OPENAI_API_KEY;
    expect(getVoiceProvider('openai')).toBeNull();
  });

  it('defaults to ElevenLabs when null/undefined', () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    expect(getVoiceProvider(null)!.name).toBe('elevenlabs');
    expect(getVoiceProvider(undefined)!.name).toBe('elevenlabs');
  });

  it('returns null for unknown provider', () => {
    expect(getVoiceProvider('azure')).toBeNull();
  });
});
