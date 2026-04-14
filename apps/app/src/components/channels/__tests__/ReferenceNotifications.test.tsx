import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ReferenceNotifications } from '../ReferenceNotifications';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const sampleNotifications = [
  {
    id: 'n1',
    channel_id: 'ch1',
    reference_id: 'ref1',
    content_id: 'c1',
    type: 'trending_video',
    title: 'Ali Abdaal postou: "How I Study"',
    body: '450K views · 8.2% engagement',
    metadata_json: {
      video_external_id: 'abc123',
      views: 450000,
      likes: 30000,
      comments: 7000,
      engagement: 8.2,
      tags: ['study', 'productivity', 'habits'],
    },
    read_at: null,
    created_at: '2026-04-14T00:00:00Z',
  },
  {
    id: 'n2',
    channel_id: 'ch1',
    reference_id: 'ref2',
    content_id: null,
    type: 'trending_video',
    title: 'MKBHD postou: "Best Tech 2026"',
    body: '1.2M views · 5.1% engagement',
    metadata_json: {
      video_external_id: 'def456',
      views: 1200000,
      engagement: 5.1,
      tags: ['tech'],
    },
    read_at: null,
    created_at: '2026-04-13T00:00:00Z',
  },
];

function mockFetchWithNotifications(notifs = sampleNotifications) {
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (typeof url === 'string' && url.includes('/notifications') && (!opts || opts.method !== 'PATCH')) {
      return Promise.resolve({
        json: () => Promise.resolve({ data: { notifications: notifs }, error: null }),
      });
    }
    return Promise.resolve({
      json: () => Promise.resolve({ data: { success: true }, error: null }),
    });
  });
}

describe('ReferenceNotifications', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockClear();
  });

  it('renders nothing when no notifications', async () => {
    global.fetch = mockFetchWithNotifications([]);
    const { container } = render(<ReferenceNotifications channelId="ch1" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(container.innerHTML).toBe('');
  });

  it('renders notification cards with title and body', async () => {
    global.fetch = mockFetchWithNotifications();
    render(<ReferenceNotifications channelId="ch1" />);

    await waitFor(() => {
      expect(screen.getByText('Ali Abdaal postou: "How I Study"')).toBeInTheDocument();
    });
    expect(screen.getByText('450K views · 8.2% engagement')).toBeInTheDocument();
    expect(screen.getByText('MKBHD postou: "Best Tech 2026"')).toBeInTheDocument();
  });

  it('shows tags as badges', async () => {
    global.fetch = mockFetchWithNotifications();
    render(<ReferenceNotifications channelId="ch1" />);

    await waitFor(() => {
      expect(screen.getByText('study')).toBeInTheDocument();
    });
    expect(screen.getByText('productivity')).toBeInTheDocument();
  });

  it('dismiss removes notification from list', async () => {
    global.fetch = mockFetchWithNotifications();
    render(<ReferenceNotifications channelId="ch1" />);

    await waitFor(() => {
      expect(screen.getByText('Ali Abdaal postou: "How I Study"')).toBeInTheDocument();
    });

    const dismissButtons = screen.getAllByRole('button').filter((btn) => {
      return btn.querySelector('.lucide-x');
    });
    fireEvent.click(dismissButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText('Ali Abdaal postou: "How I Study"')).not.toBeInTheDocument();
    });
    expect(screen.getByText('MKBHD postou: "Best Tech 2026"')).toBeInTheDocument();
  });

  it('"Modelar" navigates to brainstorm with params', async () => {
    global.fetch = mockFetchWithNotifications();
    render(<ReferenceNotifications channelId="ch1" />);

    await waitFor(() => {
      expect(screen.getAllByText('Modelar').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('Modelar')[0]);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('/channels/ch1/brainstorm/new?'),
      );
    });

    const url = mockPush.mock.calls[0][0];
    expect(url).toContain('mode=reference_guided');
    expect(url).toContain('ref_video=abc123');
  });

  it('fetches unread notifications on mount', async () => {
    global.fetch = mockFetchWithNotifications();
    render(<ReferenceNotifications channelId="ch1" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/channels/ch1/notifications?unread=true&limit=5',
      );
    });
  });
});
