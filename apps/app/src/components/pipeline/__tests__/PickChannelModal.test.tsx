import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { PickChannelModal } from '../PickChannelModal'

const CHANNELS_RESPONSE = {
  data: {
    items: [
      { id: 'ch-x', name: 'Tech Blog' },
      { id: 'ch-y', name: 'Marketing' },
    ],
    total: 2,
    page: 1,
    limit: 20,
  },
  error: null,
}

function makeFetch(channelsResponse = CHANNELS_RESPONSE, patchResponse = { data: { id: 'p1' }, error: null }) {
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (typeof url === 'string' && url.includes('/api/channels')) {
      return Promise.resolve({ ok: true, json: async () => channelsResponse })
    }
    if (typeof url === 'string' && url.includes('/api/projects/') && opts?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: async () => patchResponse })
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: null, error: null }) })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PickChannelModal', () => {
  describe('when channelId is non-null', () => {
    it('returns null (does not render)', () => {
      vi.stubGlobal('fetch', makeFetch())
      const { container } = render(
        <PickChannelModal projectId="p1" channelId="ch-existing" onPicked={vi.fn()} />,
      )
      expect(container.firstChild).toBeNull()
    })
  })

  describe('when channelId is null', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', makeFetch())
    })

    it('renders the modal dialog', async () => {
      render(<PickChannelModal projectId="p1" channelId={null} onPicked={vi.fn()} />)
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    it('shows at least one channel name from the API', async () => {
      render(<PickChannelModal projectId="p1" channelId={null} onPicked={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByText('Tech Blog')).toBeInTheDocument()
      })
    })

    it('has no close or cancel button', async () => {
      render(<PickChannelModal projectId="p1" channelId={null} onPicked={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByText('Tech Blog')).toBeInTheDocument()
      })
      expect(screen.queryByRole('button', { name: /close|cancel/i })).toBeNull()
    })

    it('does not close when ESC is pressed', async () => {
      const user = userEvent.setup()
      render(<PickChannelModal projectId="p1" channelId={null} onPicked={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })
      await user.keyboard('{Escape}')
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    it('calls PATCH and onPicked when a channel is selected and submitted', async () => {
      const mockFetch = makeFetch()
      vi.stubGlobal('fetch', mockFetch)
      const onPicked = vi.fn()
      const user = userEvent.setup()

      render(<PickChannelModal projectId="p1" channelId={null} onPicked={onPicked} />)

      await waitFor(() => {
        expect(screen.getByText('Tech Blog')).toBeInTheDocument()
      })

      // Select "Tech Blog" channel
      const techBlogOption = screen.getByText('Tech Blog')
      await user.click(techBlogOption)

      // Submit
      const confirmBtn = screen.getByRole('button', { name: /confirm|select|save|assign/i })
      await user.click(confirmBtn)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/projects/p1',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ channelId: 'ch-x' }),
          }),
        )
        expect(onPicked).toHaveBeenCalledWith('ch-x')
      })
    })

    it('shows loading state while fetching channels', () => {
      const slowFetch = vi.fn().mockReturnValue(new Promise(() => {}))
      vi.stubGlobal('fetch', slowFetch)
      render(<PickChannelModal projectId="p1" channelId={null} onPicked={vi.fn()} />)
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    it('shows error state when channel fetch fails', async () => {
      const errorFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: null, error: { code: 'INTERNAL', message: 'Something went wrong' } }),
      })
      vi.stubGlobal('fetch', errorFetch)
      render(<PickChannelModal projectId="p1" channelId={null} onPicked={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByText(/something went wrong|error|failed/i)).toBeInTheDocument()
      })
    })
  })
})
