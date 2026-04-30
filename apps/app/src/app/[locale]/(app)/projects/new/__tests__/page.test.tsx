import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import NewProjectPage from '../page'

// Override the i18n useRouter for this file
const routerPush = vi.fn()
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => {
    const React = require('react')
    return React.createElement('a', { href, ...props }, children)
  },
}))

// Override useSearchParams for specific test control
let mockSearchParams = new URLSearchParams()
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return {
    ...actual,
    useSearchParams: () => mockSearchParams,
  }
})

const C1 = { id: 'c1', name: 'Alpha Channel' }
const C2 = { id: 'c2', name: 'Beta Channel' }

const originalFetch = globalThis.fetch

beforeEach(() => {
  routerPush.mockClear()
  mockSearchParams = new URLSearchParams()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

function mockFetch(channels: typeof C1[], projectId = 'p1') {
  globalThis.fetch = vi.fn((url: RequestInfo) => {
    const urlStr = String(url)
    if (urlStr.includes('/api/channels')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ data: { channels }, error: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    }
    if (urlStr.includes('/api/projects')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ data: { id: projectId }, error: null }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
  }) as unknown as typeof fetch
}

describe('NewProjectPage', () => {
  it('lists channels and creates project on selection', async () => {
    mockFetch([C1, C2])

    render(<NewProjectPage />)

    // Should show loading initially
    expect(screen.getByText(/loading/i)).toBeInTheDocument()

    // Wait for channels to load
    await waitFor(() =>
      expect(screen.getAllByTestId('channel-option')).toHaveLength(2),
    )

    // Continue button should be disabled until a channel is selected
    const continueBtn = screen.getByRole('button', { name: /continue/i })
    expect(continueBtn).toBeDisabled()

    // Select first channel
    fireEvent.click(screen.getAllByTestId('channel-option')[0])

    // Continue button should now be enabled
    expect(continueBtn).not.toBeDisabled()

    // Click continue
    fireEvent.click(continueBtn)

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/projects/p1'))
  })

  it('auto-creates and skips picker when only one channel exists', async () => {
    mockFetch([C1])

    render(<NewProjectPage />)

    // Should auto-create without user interaction
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/projects/p1'))

    // Should not render the picker card at all (auto-navigated)
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument()
  })

  it('respects ?channelId=X deep link', async () => {
    mockSearchParams = new URLSearchParams('channelId=c2')
    mockFetch([C1, C2])

    render(<NewProjectPage />)

    // Should auto-create with deep-linked channelId without user interaction
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/projects/p1'))

    // Verify the POST was called with the deep-linked channelId
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][]
    const postCall = calls.find(
      ([url, opts]) =>
        String(url).includes('/api/projects') && opts?.method === 'POST',
    )
    expect(postCall).toBeDefined()
    const body = JSON.parse((postCall as [string, RequestInit])[1].body as string)
    expect(body.channelId).toBe('c2')
  })
})
