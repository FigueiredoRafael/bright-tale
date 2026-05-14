import { NextResponse } from 'next/server';

export const revalidate = 60;

interface PlanRow {
  id: string;
  displayName: string;
  credits: number;
  usdMonthly: number;
  usdAnnual: number;
  displayPriceBrlMonthly: number;
  displayPriceBrlAnnual: number;
}

const FALLBACK_PLANS: PlanRow[] = [
  { id: 'free', displayName: 'Free', credits: 1000, usdMonthly: 0, usdAnnual: 0, displayPriceBrlMonthly: 0, displayPriceBrlAnnual: 0 },
  { id: 'starter', displayName: 'Starter', credits: 5000, usdMonthly: 9, usdAnnual: 7, displayPriceBrlMonthly: 49, displayPriceBrlAnnual: 39 },
  { id: 'creator', displayName: 'Creator', credits: 15000, usdMonthly: 29, usdAnnual: 23, displayPriceBrlMonthly: 149, displayPriceBrlAnnual: 119 },
  { id: 'pro', displayName: 'Pro', credits: 50000, usdMonthly: 99, usdAnnual: 79, displayPriceBrlMonthly: 499, displayPriceBrlAnnual: 399 },
];

export async function GET() {
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001';
  const internalKey = process.env.INTERNAL_API_KEY;

  try {
    const res = await fetch(`${apiUrl}/billing/plans`, {
      next: { revalidate: 60 },
      headers: internalKey ? { 'x-internal-key': internalKey } : {},
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    const json = await res.json() as { data?: { plans: PlanRow[] }; error: unknown };
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ data: { plans: FALLBACK_PLANS }, error: null });
  }
}
