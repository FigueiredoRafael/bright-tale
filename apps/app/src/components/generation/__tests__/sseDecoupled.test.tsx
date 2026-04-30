/**
 * Tests that SSE subscription is decoupled from UI visibility.
 *
 * The core invariant: GenerationProgressFloat and GenerationProgressModal must
 * connect to the SSE stream and fire onComplete/onFailed whenever sseUrl is
 * non-empty — regardless of the `open` prop. The `open` prop gates only the
 * visible UI (Dialog / Float panel), not the SSE connection.
 *
 * This prevents autopilot from stalling when engines run in overview mode
 * (open=false) but the backend job completes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { GenerationProgressFloat } from '../GenerationProgressFloat'
import { GenerationProgressModal } from '../GenerationProgressModal'

// ── Mock useJobEvents ────────────────────────────────────────────────────────

type JobEventsStatus = 'idle' | 'streaming' | 'completed' | 'failed' | 'aborted' | 'error'

let capturedUrls: string[] = []
// Override status for URLs whose path matches a given substring
let statusOverrides: Array<{ match: string; status: JobEventsStatus }> = []

vi.mock('@/hooks/useJobEvents', () => ({
  useJobEvents: (url: string) => {
    capturedUrls.push(url)
    const override = statusOverrides.find((o) => url.includes(o.match))
    const status: JobEventsStatus = override?.status ?? (url ? 'streaming' : 'idle')
    return { events: [], status, error: null }
  },
}))

// ── Mock Dialog (from shadcn/ui) to avoid portal rendering issues ────────────

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedUrls = []
  statusOverrides = []
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── GenerationProgressFloat ──────────────────────────────────────────────────

describe('GenerationProgressFloat — SSE decoupled from open prop', () => {
  it('calls useJobEvents with a non-empty URL when open=false but sseUrl is set', () => {
    render(
      <GenerationProgressFloat
        open={false}
        sessionId="sess-1"
        sseUrl="/api/brainstorm/sessions/sess-1/events"
        onComplete={vi.fn()}
        onFailed={vi.fn()}
        onClose={vi.fn()}
      />
    )
    // At least one call with a non-empty URL (includes the since= param)
    const nonEmpty = capturedUrls.filter((u) => u.length > 0)
    expect(nonEmpty.length).toBeGreaterThan(0)
    expect(nonEmpty[0]).toContain('/api/brainstorm/sessions/sess-1/events')
  })

  it('renders nothing (null) in the DOM when open=false', () => {
    const { container } = render(
      <GenerationProgressFloat
        open={false}
        sessionId="sess-1"
        sseUrl="/api/brainstorm/sessions/sess-1/events"
        onComplete={vi.fn()}
        onFailed={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('fires onComplete when SSE status=completed even with open=false', async () => {
    const sseUrl = '/api/brainstorm/sessions/sess-2/events'
    const onComplete = vi.fn()
    // Make useJobEvents return 'completed' for URLs containing 'sess-2'
    statusOverrides = [{ match: 'sess-2', status: 'completed' }]

    render(
      <GenerationProgressFloat
        open={false}
        sessionId="sess-2"
        sseUrl={sseUrl}
        onComplete={onComplete}
        onFailed={vi.fn()}
        onClose={vi.fn()}
      />
    )
    // Flush the 1500ms delay in the completion handler
    await act(async () => { vi.advanceTimersByTime(2000) })
    // onComplete should have been called despite open=false
    expect(onComplete).toHaveBeenCalled()
  })

  it('does NOT call useJobEvents when sseUrl is empty', () => {
    render(
      <GenerationProgressFloat
        open={false}
        sessionId=""
        sseUrl=""
        onComplete={vi.fn()}
        onFailed={vi.fn()}
        onClose={vi.fn()}
      />
    )
    // Only empty strings should have been captured
    const nonEmpty = capturedUrls.filter((u) => u.length > 0)
    expect(nonEmpty).toHaveLength(0)
  })
})

// ── GenerationProgressModal ──────────────────────────────────────────────────

describe('GenerationProgressModal — SSE decoupled from open prop', () => {
  it('calls useJobEvents with a non-empty URL when open=false but sseUrl is set', () => {
    render(
      <GenerationProgressModal
        open={false}
        sessionId="draft-1"
        sseUrl="/api/content-drafts/draft-1/events"
        onComplete={vi.fn()}
        onFailed={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const nonEmpty = capturedUrls.filter((u) => u.length > 0)
    expect(nonEmpty.length).toBeGreaterThan(0)
    expect(nonEmpty[0]).toContain('/api/content-drafts/draft-1/events')
  })

  it('does not render the Dialog when open=false', () => {
    const { queryByTestId } = render(
      <GenerationProgressModal
        open={false}
        sessionId="draft-1"
        sseUrl="/api/content-drafts/draft-1/events"
        onComplete={vi.fn()}
        onFailed={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(queryByTestId('dialog')).toBeNull()
  })

  it('renders the Dialog when open=true', () => {
    const { getByTestId } = render(
      <GenerationProgressModal
        open={true}
        sessionId="draft-1"
        sseUrl="/api/content-drafts/draft-1/events"
        onComplete={vi.fn()}
        onFailed={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(getByTestId('dialog')).toBeTruthy()
  })

  it('does NOT call useJobEvents with a non-empty URL when sseUrl is empty', () => {
    render(
      <GenerationProgressModal
        open={false}
        sessionId=""
        sseUrl=""
        onComplete={vi.fn()}
        onFailed={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const nonEmpty = capturedUrls.filter((u) => u.length > 0)
    expect(nonEmpty).toHaveLength(0)
  })
})
