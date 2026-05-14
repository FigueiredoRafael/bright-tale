/**
 * M-015 — Admin finance route unit tests
 *
 * Category B: no DB required — Supabase is fully mocked.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: (_req: unknown, _rep: unknown, done: () => void) => done(),
}));

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

import { adminFinanceRoutes } from '../admin-finance.js';

describe('adminFinanceRoutes', () => {
  it('exports a function', () => {
    expect(typeof adminFinanceRoutes).toBe('function');
  });
});
