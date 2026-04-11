import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import BlogsPage from '../page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

describe('BlogsPage', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('does NOT show "Failed to fetch blogs" when API returns {data,error:null}', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              blogs: [],
              pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
            },
            error: null,
          }),
        ),
      ),
    ) as unknown as typeof fetch;

    render(<BlogsPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/blogs?'));
    });

    // Give the component time to render any error state
    await new Promise(r => setTimeout(r, 50));

    expect(screen.queryByText(/Failed to fetch blogs/i)).not.toBeInTheDocument();
  });

  it('shows error message when API returns {data:null,error:{...}}', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: null,
            error: { code: 'INTERNAL', message: 'Database unreachable' },
          }),
        ),
      ),
    ) as unknown as typeof fetch;

    render(<BlogsPage />);

    await waitFor(() => {
      expect(screen.getByText('Database unreachable')).toBeInTheDocument();
    });
  });
});
