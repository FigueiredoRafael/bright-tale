import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContentSubmissions } from '../components/content-submissions';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/affiliate-api', () => ({
  AffiliateApiError: class extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  affiliateApi: { submitContent: vi.fn() },
}));
import { affiliateApi } from '@/lib/affiliate-api';

const subs = [
  { id: 's1', url: 'https://youtube.com/x', platform: 'youtube', contentType: 'video', status: 'approved' },
  { id: 's2', url: 'https://instagram.com/x', platform: 'instagram', contentType: 'post', status: 'pending' },
  { id: 's3', url: 'https://x.com/x/rejected', platform: 'twitter', contentType: 'post', status: 'rejected' },
] as any;

describe('ContentSubmissions', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('lists items with platform labels', () => {
    render(<ContentSubmissions submissions={subs} readOnly={false} onChange={vi.fn()} />);
    expect(screen.getAllByText(/youtube/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/instagram/i).length).toBeGreaterThan(0);
  });

  it('renders status styling per approved/pending/rejected', () => {
    const { container } = render(<ContentSubmissions submissions={subs} readOnly={false} onChange={vi.fn()} />);
    expect(container.innerHTML).toMatch(/green|approved/);
    expect(container.innerHTML).toMatch(/yellow|pending/);
    expect(container.innerHTML).toMatch(/red|reject/);
  });

  it('submit happy path calls API', async () => {
    vi.mocked(affiliateApi.submitContent).mockResolvedValueOnce({} as any);
    const onChange = vi.fn();
    render(<ContentSubmissions submissions={subs} readOnly={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Enviar conteúdo/ }));
    fireEvent.change(screen.getByLabelText(/URL/), { target: { value: 'https://tiktok.com/@me/v/1' } });
    fireEvent.change(screen.getByLabelText(/Plataforma/), { target: { value: 'tiktok' } });
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'video' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    await waitFor(() =>
      expect(affiliateApi.submitContent).toHaveBeenCalledWith(expect.objectContaining({
        url: 'https://tiktok.com/@me/v/1', platform: 'tiktok', contentType: 'video',
      })),
    );
    expect(onChange).toHaveBeenCalled();
  });

  it('invalid URL blocks submit', async () => {
    render(<ContentSubmissions submissions={subs} readOnly={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Enviar conteúdo/ }));
    fireEvent.change(screen.getByLabelText(/URL/), { target: { value: 'not a url' } });
    fireEvent.change(screen.getByLabelText(/Plataforma/), { target: { value: 'tiktok' } });
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'video' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    await waitFor(() => expect(screen.getByText(/URL inválida/)).toBeInTheDocument());
    expect(affiliateApi.submitContent).not.toHaveBeenCalled();
  });

  it('empty list still shows submit CTA', () => {
    render(<ContentSubmissions submissions={[]} readOnly={false} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Enviar conteúdo/ })).toBeInTheDocument();
  });
});
