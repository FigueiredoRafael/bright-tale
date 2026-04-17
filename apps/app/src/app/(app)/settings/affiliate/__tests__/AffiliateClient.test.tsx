import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AffiliateClient } from '../AffiliateClient';

vi.mock('@/lib/affiliate-api', () => ({
  AffiliateApiError: class extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  affiliateApi: {
    getMe: vi.fn(),
    getStats: vi.fn().mockResolvedValue({
      totalClicks: 0, totalReferrals: 0, totalConversions: 0,
      totalEarningsBrl: 0, pendingPayoutBrl: 0, paidPayoutBrl: 0,
    }),
    getReferrals: vi.fn().mockResolvedValue([]),
    getCommissions: vi.fn().mockResolvedValue([]),
    getClicksByPlatform: vi.fn().mockResolvedValue([]),
    listPixKeys: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { affiliateApi } from '@/lib/affiliate-api';

const baseAffiliate = {
  id: 'a1', userId: 'u1', code: 'CODE1', tier: 'nano', commissionRate: 0.15,
  status: 'active', contractStartDate: '2026-01-01T00:00:00Z',
  contractEndDate: '2026-12-31T00:00:00Z', contractVersion: 1,
  proposedTier: null, proposedCommissionRate: null, proposedFixedFeeBrl: null,
} as any;

describe('AffiliateClient state machine', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders not-affiliate when getMe returns null', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue(null);
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/não é afiliado/i)).toBeInTheDocument(),
    );
  });

  it('renders pending when status=pending', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue({ ...baseAffiliate, status: 'pending' });
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Candidatura em análise/)).toBeInTheDocument(),
    );
  });

  it('renders proposal when proposedTier set (even on active)', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue({
      ...baseAffiliate, status: 'active', proposedTier: 'micro', proposedCommissionRate: 0.2,
    });
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Nova proposta de contrato/)).toBeInTheDocument(),
    );
  });

  it('renders proposal when status=approved + proposedTier', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue({
      ...baseAffiliate, status: 'approved', proposedTier: 'nano', proposedCommissionRate: 0.15,
    });
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Nova proposta de contrato/)).toBeInTheDocument(),
    );
  });

  it('renders dashboard when status=active + no proposal', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue(baseAffiliate);
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Link de indicação/)).toBeInTheDocument(),
    );
  });

  it('renders paused banner over dashboard when status=paused', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue({ ...baseAffiliate, status: 'paused' });
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Conta pausada/)).toBeInTheDocument(),
    );
  });

  it('renders terminated screen when status=terminated', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue({ ...baseAffiliate, status: 'terminated' });
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Parceria encerrada/)).toBeInTheDocument(),
    );
  });

  it('renders terminated screen when status=rejected', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue({ ...baseAffiliate, status: 'rejected' });
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Parceria encerrada/)).toBeInTheDocument(),
    );
  });

  it('shows loading skeleton before fetch resolves', () => {
    vi.mocked(affiliateApi.getMe).mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<AffiliateClient />);
    expect(container.querySelector('[data-testid="affiliate-loading"]')).toBeTruthy();
  });

  it('getMe failure surfaces retry button', async () => {
    vi.mocked(affiliateApi.getMe).mockRejectedValue(new Error('boom'));
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeInTheDocument(),
    );
  });
});
