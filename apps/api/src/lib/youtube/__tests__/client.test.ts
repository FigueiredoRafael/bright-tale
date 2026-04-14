import { describe, it, expect } from 'vitest';
import { parseDuration } from '../client.js';

describe('parseDuration', () => {
  it('parses hours, minutes, seconds', () => {
    expect(parseDuration('PT1H30M15S')).toBe(5415);
  });

  it('parses minutes and seconds', () => {
    expect(parseDuration('PT4M13S')).toBe(253);
  });

  it('parses seconds only', () => {
    expect(parseDuration('PT45S')).toBe(45);
  });

  it('parses minutes only', () => {
    expect(parseDuration('PT10M')).toBe(600);
  });

  it('parses hours only', () => {
    expect(parseDuration('PT2H')).toBe(7200);
  });

  it('returns 0 for invalid format', () => {
    expect(parseDuration('invalid')).toBe(0);
    expect(parseDuration('')).toBe(0);
  });

  it('handles zero duration', () => {
    expect(parseDuration('PT0S')).toBe(0);
  });
});
