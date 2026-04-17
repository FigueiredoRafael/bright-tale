import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PayoutSection } from '../components/payout-section';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/affiliate-api', () => ({
  AffiliateApiError: class extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  affiliateApi: { requestPayout: vi.fn() },
}));
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';

const defaultPix = { id: 'k1', keyDisplay: 'j***@x.com', isDefault: true } as any;

describe('PayoutSection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('button disabled under minimum (R$50)', () => {
    render(<PayoutSection pendingPayoutBrl={10} defaultPixKey={defaultPix} readOnly={false} onMutate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Solicitar pagamento/ })).toBeDisabled();
  });

  it('button disabled when no default PIX key', () => {
    render(<PayoutSection pendingPayoutBrl={100} defaultPixKey={null} readOnly={false} onMutate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Solicitar pagamento/ })).toBeDisabled();
  });

  it('button disabled in readOnly mode', () => {
    render(<PayoutSection pendingPayoutBrl={100} defaultPixKey={defaultPix} readOnly={true} onMutate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Solicitar pagamento/ })).toBeDisabled();
  });

  it('confirm dialog shows amount and pix display', async () => {
    render(<PayoutSection pendingPayoutBrl={123} defaultPixKey={defaultPix} readOnly={false} onMutate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Solicitar pagamento/ }));
    expect(await screen.findByText(/123/)).toBeInTheDocument();
    expect(screen.getByText(/j\*\*\*@x.com/)).toBeInTheDocument();
  });

  it('successful request fires toast + onMutate + posthog', async () => {
    vi.mocked(affiliateApi.requestPayout).mockResolvedValueOnce({} as any);
    (window as any).posthog = { capture: vi.fn() };
    const onMutate = vi.fn();
    const { toast } = await import('sonner');
    render(<PayoutSection pendingPayoutBrl={100} defaultPixKey={defaultPix} readOnly={false} onMutate={onMutate} />);
    fireEvent.click(screen.getByRole('button', { name: /Solicitar pagamento/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Solicitar$/ }));
    await waitFor(() => expect(affiliateApi.requestPayout).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalled();
    expect(onMutate).toHaveBeenCalled();
    expect((window as any).posthog.capture).toHaveBeenCalledWith('affiliate_payout_requested', { amountBrl: 100, tier: undefined });
  });

  it('tax-ID-irregular (422 + specific code) shows dedicated message', async () => {
    const { toast } = await import('sonner');
    vi.mocked(affiliateApi.requestPayout).mockRejectedValueOnce(
      new AffiliateApiError(422, 'VALIDATION', 'AffiliatePayoutTaxIdIrregularError'),
    );
    render(<PayoutSection pendingPayoutBrl={100} defaultPixKey={defaultPix} readOnly={false} onMutate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Solicitar pagamento/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Solicitar$/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('CPF/CNPJ')),
    );
  });

  it('generic 500 error surfaces package message verbatim', async () => {
    const { toast } = await import('sonner');
    vi.mocked(affiliateApi.requestPayout).mockRejectedValueOnce(
      new AffiliateApiError(500, 'UNKNOWN', 'oops'),
    );
    render(<PayoutSection pendingPayoutBrl={100} defaultPixKey={defaultPix} readOnly={false} onMutate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Solicitar pagamento/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Solicitar$/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('oops'));
  });
});
