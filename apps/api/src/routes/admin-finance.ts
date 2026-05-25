/**
 * M-015 — Finance summary API for the zadmin finance dashboard.
 *
 * GET /admin/finance/summary
 *   Returns 30-day revenue/cost aggregates from mv_finance_daily
 *   plus subscription counts by plan from organizations.
 *
 * Auth: X-Internal-Key (enforced by authenticate middleware).
 * This route is only reachable from apps/web zadmin pages.
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';

interface MvFinanceDailyRow {
  date: string;
  org_id: string;
  cost_cents: number;
  revenue_cents: number;
  margin_pct: number;
}

interface OrgPlanRow {
  plan: string;
}

interface PlanBreakdownEntry {
  planId: string;
  count: number;
}

interface FinanceSummary {
  revenueCents: number;
  costCents: number;
  activeOrgs: number;
  avgMargin: number;
  planBreakdown: PlanBreakdownEntry[];
}

export async function adminFinanceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  /**
   * GET /summary — 30-day finance KPIs
   */
  app.get('/summary', async (_req, reply) => {
    try {
      const sb = createServiceClient();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // Query mv_finance_daily for last 30 days.
      // Falls back gracefully when the view exists but has no data yet.
      const { data: financeRows, error: financeError } = await (
        sb
          .from('mv_finance_daily' as never)
          .select('org_id, revenue_cents, cost_cents, margin_pct') as unknown as Promise<{
            data: MvFinanceDailyRow[] | null;
            error: { message: string } | null;
          }>
      );

      if (financeError) {
        // If the view doesn't exist yet (migration not applied), return zeros.
        // This prevents a hard 500 during staging before the migration runs.
        app.log.warn({ err: financeError }, '[finance] mv_finance_daily query failed — returning zeros');
      }

      const rows: MvFinanceDailyRow[] = (financeRows ?? []).filter(
        (r) => r.date >= thirtyDaysAgo,
      );

      const totalRevenueCents = rows.reduce((sum, r) => sum + (r.revenue_cents ?? 0), 0);
      const totalCostCents = rows.reduce((sum, r) => sum + (r.cost_cents ?? 0), 0);
      const activeOrgIds = new Set(rows.map((r) => r.org_id)).size;

      // Average margin: mean of per-row margin_pct (skip null/zero rows)
      const marginRows = rows.filter((r) => r.margin_pct !== null && r.margin_pct !== 0);
      const avgMargin =
        marginRows.length > 0
          ? marginRows.reduce((sum, r) => sum + r.margin_pct, 0) / marginRows.length
          : 0;

      // Subscription counts by plan (exclude free tier)
      const { data: orgRows, error: orgError } = await sb
        .from('organizations')
        .select('plan')
        .neq('plan', 'free') as unknown as { data: OrgPlanRow[] | null; error: { message: string } | null };

      if (orgError) {
        app.log.warn({ err: orgError }, '[finance] organizations plan query failed');
      }

      const planCounts = new Map<string, number>();
      for (const o of orgRows ?? []) {
        if (o.plan) {
          planCounts.set(o.plan, (planCounts.get(o.plan) ?? 0) + 1);
        }
      }

      const planBreakdown: PlanBreakdownEntry[] = [...planCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([planId, count]) => ({ planId, count }));

      const summary: FinanceSummary = {
        revenueCents: totalRevenueCents,
        costCents: totalCostCents,
        activeOrgs: activeOrgIds,
        avgMargin: Math.round(avgMargin * 100) / 100,
        planBreakdown,
      };

      return reply.send({ data: summary, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
