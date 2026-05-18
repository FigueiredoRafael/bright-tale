import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import NewProjectPage from '../page'

const routerPush = vi.fn()
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => {
    const React = require('react')
    return React.createElement('a', { href, ...props }, children)
  },
}))

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
          JSON.stringify({ data: { items: channels, total: channels.length, page: 1, limit: 20 }, error: null }),
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

describe('NewProjectPage wizard', () => {
  it('does not POST until user submits the form', async () => {
    mockFetch([C1, C2])

    render(<NewProjectPage />)

    await waitFor(() =>
      expect(screen.getAllByTestId('channel-option')).toHaveLength(2),
    )

    // No project should be created on mount
    expect(routerPush).not.toHaveBeenCalled()
    const postCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url, opts]) => String(url).includes('/api/projects') && (opts as RequestInit)?.method === 'POST',
    )
    expect(postCalls).toHaveLength(0)

    // Create button is disabled without title / channel
    const createBtn = screen.getByRole('button', { name: /create project/i })
    expect(createBtn).toBeDisabled()
  })

  it('creates project with wizard config on submit', async () => {
    mockFetch([C1, C2])

    render(<NewProjectPage />)

    await waitFor(() =>
      expect(screen.getAllByTestId('channel-option')).toHaveLength(2),
    )

    fireEvent.change(screen.getByLabelText(/project title/i), {
      target: { value: 'My new project' },
    })
    fireEvent.click(screen.getAllByTestId('channel-option')[0])

    const createBtn = screen.getByRole('button', { name: /create project/i })
    await waitFor(() => expect(createBtn).not.toBeDisabled())
    fireEvent.click(createBtn)

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/projects/p1'))

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][]
    const postCall = calls.find(
      ([url, opts]) =>
        String(url).includes('/api/projects') && opts?.method === 'POST',
    )
    expect(postCall).toBeDefined()
    const body = JSON.parse((postCall as [string, RequestInit])[1].body as string)
    expect(body.title).toBe('My new project')
    expect(body.channelId).toBe('c1')
    expect(body.mode).toBe('step-by-step')
    expect(body.media).toEqual(['blog'])
  })

  it('preselects channel from ?channelId= deep link', async () => {
    mockSearchParams = new URLSearchParams('channelId=c2')
    mockFetch([C1, C2])

    render(<NewProjectPage />)

    await waitFor(() =>
      expect(screen.getAllByTestId('channel-option')).toHaveLength(2),
    )

    // Still no auto-POST
    expect(routerPush).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/project title/i), {
      target: { value: 'Linked project' },
    })

    const createBtn = screen.getByRole('button', { name: /create project/i })
    await waitFor(() => expect(createBtn).not.toBeDisabled())
    fireEvent.click(createBtn)

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/projects/p1'))

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][]
    const postCall = calls.find(
      ([url, opts]) =>
        String(url).includes('/api/projects') && opts?.method === 'POST',
    )
    const body = JSON.parse((postCall as [string, RequestInit])[1].body as string)
    expect(body.channelId).toBe('c2')
  })

  it('preselects single available channel without auto-submitting', async () => {
    mockFetch([C1])

    render(<NewProjectPage />)

    await waitFor(() =>
      expect(screen.getAllByTestId('channel-option')).toHaveLength(1),
    )

    expect(routerPush).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/project title/i), {
      target: { value: 'Solo channel project' },
    })

    const createBtn = screen.getByRole('button', { name: /create project/i })
    await waitFor(() => expect(createBtn).not.toBeDisabled())
    fireEvent.click(createBtn)

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/projects/p1'))

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][]
    const postCall = calls.find(
      ([url, opts]) =>
        String(url).includes('/api/projects') && opts?.method === 'POST',
    )
    const body = JSON.parse((postCall as [string, RequestInit])[1].body as string)
    expect(body.channelId).toBe('c1')
  })
})
