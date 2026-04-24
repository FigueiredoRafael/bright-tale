/**
 * stats.ts — tiny statistical helpers for timing-oracle probes.
 *
 * Only what we need, no dependency: mean, sample stddev, Welch's two-sample
 * t-test. p-value approximation via erfc on |t|.
 */

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

/**
 * Welch's two-sample t-test. Returns { t, df, p } where p is the two-sided
 * p-value. Uses a normal-distribution approximation for p (good enough for
 * n ≥ 30, which is what our probes use).
 */
export function welchT(a: number[], b: number[]): { t: number; df: number; p: number; meanA: number; meanB: number; sdA: number; sdB: number } {
  const mA = mean(a);
  const mB = mean(b);
  const sA = stddev(a);
  const sB = stddev(b);
  const nA = a.length;
  const nB = b.length;
  const vA = sA ** 2 / nA;
  const vB = sB ** 2 / nB;
  const t = (mA - mB) / Math.sqrt(vA + vB);
  const df = (vA + vB) ** 2 / ((vA ** 2) / (nA - 1) + (vB ** 2) / (nB - 1));
  // Normal approx for p: 2*(1 - Phi(|t|))
  const p = 2 * (1 - normalCdf(Math.abs(t)));
  return { t, df, p, meanA: mA, meanB: mB, sdA: sA, sdB: sB };
}

function normalCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26 approximation of the error function.
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
  const erf = 1 - ((((a[4] * t + a[3]) * t + a[2]) * t + a[1]) * t + a[0]) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}
