import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContractProposal } from '../components/contract-proposal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/affiliate-api', () => ({
  AffiliateApiError: class extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  affiliateApi: {
    acceptProposal: vi.fn().mockResolvedValue({}),
    rejectProposal: vi.fn().mockResolvedValue(undefined),
  },
}));
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';

const initialMe = {
  id: 'a', tier: null, commissionRate: null,
  proposedTier: 'nano', proposedCommissionRate: 0.15, proposedFixedFeeBrl: 0,
} as any;

const renewalMe = {
  id: 'a', tier: 'nano', commissionRate: 0.15,
  proposedTier: 'micro', proposedCommissionRate: 0.2, proposedFixedFeeBrl: 50,
} as any;

describe('ContractProposal', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('initial-contract view shows proposed tier and commission', () => {
    render(<ContractProposal me={initialMe} onResolved={vi.fn()} />);
    expect(screen.getByText(/Nano/)).toBeInTheDocument();
    expect(screen.getByText(/15%/)).toBeInTheDocument();
  });

  it('renewal view shows diff (current → proposed)', () => {
    render(<ContractProposal me={renewalMe} onResolved={vi.fn()} />);
    expect(screen.getByText(/Nano/)).toBeInTheDocument();
    expect(screen.getByText(/Micro/)).toBeInTheDocument();
    expect(screen.getByText(/15%/)).toBeInTheDocument();
    expect(screen.getByText(/20%/)).toBeInTheDocument();
  });

  it('accept calls acceptProposal and onResolved', async () => {
    const onResolved = vi.fn();
    render(<ContractProposal me={initialMe} onResolved={onResolved} />);
    fireEvent.click(screen.getByRole('button', { name: /Aceitar proposta/ }));
    await waitFor(() => expect(affiliateApi.acceptProposal).toHaveBeenCalled());
    expect(onResolved).toHaveBeenCalled();
  });

  it('reject triggers confirm; confirming calls rejectProposal', async () => {
    const onResolved = vi.fn();
    render(<ContractProposal me={initialMe} onResolved={onResolved} />);
    fireEvent.click(screen.getByRole('button', { name: /^Rejeitar$/ }));
    const confirm = await screen.findByRole('button', { name: /^Confirmar$/ });
    fireEvent.click(confirm);
    await waitFor(() => expect(affiliateApi.rejectProposal).toHaveBeenCalled());
    expect(onResolved).toHaveBeenCalled();
  });

  it('LGPD consent text is rendered', () => {
    render(<ContractProposal me={initialMe} onResolved={vi.fn()} />);
    expect(screen.getByText(/LGPD/i)).toBeInTheDocument();
  });

  it('accept failure toast fires on AffiliateApiError', async () => {
    const { toast } = await import('sonner');
    vi.mocked(affiliateApi.acceptProposal).mockRejectedValueOnce(new AffiliateApiError(409, 'CONFLICT', 'already accepted'));
    render(<ContractProposal me={initialMe} onResolved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Aceitar proposta/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('already accepted'));
  });
});
