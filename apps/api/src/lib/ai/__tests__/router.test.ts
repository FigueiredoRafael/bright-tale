/**
 * Router tests — provider chain construction + runtime fallback on retryable errors.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const openaiCalls: any[] = [];
const anthropicCalls: any[] = [];
const geminiCalls: any[] = [];

const openaiImpl: any = vi.fn(async () => ({ source: 'openai' }));
const anthropicImpl: any = vi.fn(async () => ({ source: 'anthropic' }));
const geminiImpl: any = vi.fn(async () => ({ source: 'gemini' }));

vi.mock('../providers/openai.js', () => ({
  OpenAIProvider: class {
    name = 'openai';
    generateContent(p: any) { openaiCalls.push(p); return openaiImpl(p); }
  },
}));
vi.mock('../providers/anthropic.js', () => ({
  AnthropicProvider: class {
    name = 'anthropic';
    generateContent(p: any) { anthropicCalls.push(p); return anthropicImpl(p); }
  },
}));
vi.mock('../providers/gemini.js', () => ({
  GeminiProvider: class {
    name = 'gemini';
    generateContent(p: any) { geminiCalls.push(p); return geminiImpl(p); }
  },
}));

import { getProviderChain, generateWithFallback } from '../router';

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.GOOGLE_AI_KEY = 'AIz-test';
  openaiCalls.length = 0;
  anthropicCalls.length = 0;
  geminiCalls.length = 0;
  openaiImpl.mockReset().mockResolvedValue({ source: 'openai' });
  anthropicImpl.mockReset().mockResolvedValue({ source: 'anthropic' });
  geminiImpl.mockReset().mockResolvedValue({ source: 'gemini' });
});

describe('getProviderChain', () => {
  it('returns the standard tier brainstorm chain (gemini first, then anthropic + openai)', () => {
    const chain = getProviderChain('brainstorm', 'standard');
    expect(chain.map((c) => c.providerName)).toEqual(['gemini', 'anthropic', 'openai']);
  });

  it('skips providers with no API key', () => {
    delete process.env.GOOGLE_AI_KEY;
    const chain = getProviderChain('brainstorm', 'standard');
    expect(chain[0].providerName).not.toBe('gemini');
  });

  it('free tier uses Gemini for all stages', () => {
    expect(getProviderChain('production', 'free')[0].providerName).toBe('gemini');
  });
});

describe('generateWithFallback', () => {
  const params = { agentType: 'brainstorm' as const, input: {}, schema: null };

  it('returns first provider result on success', async () => {
    const out = await generateWithFallback('brainstorm', 'standard', params);
    expect(out.providerName).toBe('gemini');
    expect(out.attempts).toBe(1);
    expect(geminiImpl).toHaveBeenCalledOnce();
    expect(anthropicImpl).not.toHaveBeenCalled();
  });

  it('falls back to next provider on 429 quota error', async () => {
    geminiImpl.mockRejectedValueOnce(new Error('429 quota exceeded'));
    const out = await generateWithFallback('brainstorm', 'standard', params);
    expect(out.providerName).toBe('anthropic');
    expect(out.attempts).toBe(2);
  });

  it('falls back through multiple providers on cascading failures', async () => {
    geminiImpl.mockRejectedValueOnce(new Error('500 server error'));
    anthropicImpl.mockRejectedValueOnce(new Error('rate limit hit'));
    const out = await generateWithFallback('brainstorm', 'standard', params);
    expect(out.providerName).toBe('openai');
    expect(out.attempts).toBe(3);
  });

  it('does NOT fall back on non-retryable error (validation)', async () => {
    geminiImpl.mockRejectedValueOnce(new Error('400 bad request: invalid input'));
    await expect(generateWithFallback('brainstorm', 'standard', params)).rejects.toThrow(/400/);
    expect(anthropicImpl).not.toHaveBeenCalled();
  });

  it('rethrows last error if all providers fail with retryable errors', async () => {
    geminiImpl.mockRejectedValueOnce(new Error('429'));
    anthropicImpl.mockRejectedValueOnce(new Error('429'));
    openaiImpl.mockRejectedValueOnce(new Error('429 final'));
    await expect(generateWithFallback('brainstorm', 'standard', params)).rejects.toThrow(/429 final/);
  });
});
