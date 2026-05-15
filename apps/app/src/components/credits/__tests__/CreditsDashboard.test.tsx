/**
 * V2-006.4 — CreditsDashboard "reserved" badge unit tests
 *
 * Verifies:
 *   - "X reserved" badge appears when creditsReserved > 0
 *   - Badge is hidden when creditsReserved === 0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// useBillingStatus mock
// ---------------------------------------------------------------------------
const useBillingStatusMock = vi.fn();
vi.mock('@/hooks/useBillingStatus', () => ({
  useBillingStatus: () => useBillingStatusMock(),
  creditUsagePct: vi.fn(() => 0),
}));

// ---------------------------------------------------------------------------
// Sonner mock
// ---------------------------------------------------------------------------
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// fetch mock — category usage (not the focus of these tests)
// ---------------------------------------------------------------------------
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  json: vi.fn().mockResolvedValue({ data: { categories: {} } }),
}));

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------
import { CreditsDashboard } from '../CreditsDashboard';

// ---------------------------------------------------------------------------
// BillingStatus factory
// ---------------------------------------------------------------------------
function makeStatus(creditsReserved: number) {
  return {
    status: {
      plan: { id: 'pro', displayName: 'Pro', credits: 50000, usdMonthly: 99, billingCycle: 'monthly' },
      credits: {
        unlimited: false,
        creditsTotal: 50000,
        creditsUsed: 12000,
        creditsAddon: 5000,
        creditsReserved,
        creditsResetAt: null,
        available: 43000 - creditsReserved,
        signupBonusCredits: 0,
        signupBonusExpiresAt: null,
      },
      subscription: {
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        planStartedAt: null,
        planExpiresAt: null,
      },
    },
    loading: false,
    refetch: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreditsDashboard — reserved badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "X reserved" badge when creditsReserved > 0', () => {
    useBillingStatusMock.mockReturnValue(makeStatus(250));

    render(<CreditsDashboard />);

    const badge = screen.getByTestId('reserved-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('250');
    expect(badge.textContent).toContain('reserved');
  });

  it('hides the reserved badge when creditsReserved === 0', () => {
    useBillingStatusMock.mockReturnValue(makeStatus(0));

    render(<CreditsDashboard />);

    expect(screen.queryByTestId('reserved-badge')).toBeNull();
  });

  it('renders null when status is not yet loaded', () => {
    useBillingStatusMock.mockReturnValue({ status: null, loading: false, refetch: vi.fn() });

    const { container } = render(<CreditsDashboard />);
    expect(container.firstChild).toBeNull();
  });

  it('shows loading skeleton when loading=true', () => {
    useBillingStatusMock.mockReturnValue({ status: null, loading: true, refetch: vi.fn() });

    render(<CreditsDashboard />);
    // The skeleton div should render
    expect(screen.getByText('Credits')).toBeTruthy();
  });
});
