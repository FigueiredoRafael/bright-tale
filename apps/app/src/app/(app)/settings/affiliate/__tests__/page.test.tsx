import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AffiliatePage from '../page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockProgram = {
  id: 'prog-1',
  code: 'BT-ABCD1234',
  commission_pct: 20,
  total_referrals: 5,
  total_revenue_cents: 15000,
  total_paid_cents: 3000,
  created_at: '2026-04-14T00:00:00Z',
};

const mockReferrals = [
  {
    id: 'ref-1',
    status: 'active',
    first_touch_at: '2026-04-10T00:00:00Z',
    conversion_at: '2026-04-12T00:00:00Z',
    subscription_amount_cents: 4900,
    commission_cents: 980,
  },
  {
    id: 'ref-2',
    status: 'pending',
    first_touch_at: '2026-04-13T00:00:00Z',
    conversion_at: null,
    subscription_amount_cents: null,
    commission_cents: null,
  },
];

function mockFetch(opts: { eligible: boolean; program: typeof mockProgram | null; referrals?: typeof mockReferrals }) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (typeof url === 'string' && url.includes('/affiliate/program') && (!init || init.method !== 'POST')) {
      return Promise.resolve({
        json: () => Promise.resolve({
          data: { eligible: opts.eligible, plan: opts.eligible ? 'starter' : 'free', program: opts.program },
          error: null,
        }),
      });
    }
    if (typeof url === 'string' && url.includes('/affiliate/program') && init?.method === 'POST') {
      return Promise.resolve({
        json: () => Promise.resolve({
          data: { program: mockProgram },
          error: null,
        }),
      });
    }
    if (typeof url === 'string' && url.includes('/affiliate/referrals')) {
      return Promise.resolve({
        json: () => Promise.resolve({
          data: { referrals: opts.referrals ?? [] },
          error: null,
        }),
      });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe('AffiliatePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('shows upgrade prompt for ineligible plan', async () => {
    global.fetch = mockFetch({ eligible: false, program: null });
    render(<AffiliatePage />);

    await waitFor(() => {
      expect(screen.getByText(/não inclui afiliados/)).toBeInTheDocument();
    });
    expect(screen.getByText('Ver planos')).toBeInTheDocument();
  });

  it('shows activation button when eligible but no program', async () => {
    global.fetch = mockFetch({ eligible: true, program: null });
    render(<AffiliatePage />);

    await waitFor(() => {
      expect(screen.getByText('Ativar programa')).toBeInTheDocument();
    });
    expect(screen.getByText(/20% de comissão/)).toBeInTheDocument();
  });

  it('shows dashboard when program exists', async () => {
    global.fetch = mockFetch({ eligible: true, program: mockProgram, referrals: mockReferrals });
    render(<AffiliatePage />);

    await waitFor(() => {
      expect(screen.getAllByText(/BT-ABCD1234/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Indicações')).toBeInTheDocument();
    expect(screen.getByText('Conversões')).toBeInTheDocument();
  });

  it('shows referral link with code', async () => {
    global.fetch = mockFetch({ eligible: true, program: mockProgram, referrals: [] });
    render(<AffiliatePage />);

    await waitFor(() => {
      expect(screen.getByText(/ref=BT-ABCD1234/)).toBeInTheDocument();
    });
  });

  it('creates program on button click', async () => {
    global.fetch = mockFetch({ eligible: true, program: null });
    render(<AffiliatePage />);

    await waitFor(() => {
      expect(screen.getByText('Ativar programa')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Ativar programa'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/affiliate/program', { method: 'POST' });
    });
  });

  it('shows recent referrals list', async () => {
    global.fetch = mockFetch({ eligible: true, program: mockProgram, referrals: mockReferrals });
    render(<AffiliatePage />);

    await waitFor(() => {
      expect(screen.getByText('Referrals recentes')).toBeInTheDocument();
    });
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });
});
