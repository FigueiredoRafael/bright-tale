import { describe, it, expect } from 'vitest';

const ENGAGEMENT_THRESHOLD = 0.05;
const MIN_VIEWS = 10_000;

function isTrending(views: number, likes: number, comments: number): boolean {
  const engagement = views > 0 ? (likes + comments) / views : 0;
  return views >= MIN_VIEWS && engagement >= ENGAGEMENT_THRESHOLD;
}

describe('reference-check: trending detection', () => {
  it('flags video with high views + high engagement', () => {
    expect(isTrending(100_000, 5_000, 1_000)).toBe(true);
  });

  it('ignores video with high views but low engagement', () => {
    expect(isTrending(500_000, 100, 50)).toBe(false);
  });

  it('ignores video with high engagement but low views', () => {
    expect(isTrending(5_000, 500, 200)).toBe(false);
  });

  it('ignores video with zero views', () => {
    expect(isTrending(0, 0, 0)).toBe(false);
  });

  it('video at exact threshold passes', () => {
    expect(isTrending(10_000, 400, 100)).toBe(true);
  });

  it('video just below threshold fails', () => {
    expect(isTrending(10_000, 300, 100)).toBe(false);
  });
});
