import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { PipelineAbortProvider, usePipelineAbort } from '../PipelineAbortProvider'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper({
  projectId = 'p1',
  machineState = 'running' as 'setup' | 'running' | 'done',
  currentStage = 'draft',
  isPaused = false,
} = {}) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <PipelineAbortProvider
        projectId={projectId}
        machineState={machineState}
        currentStage={currentStage}
        isPaused={isPaused}
      >
        {children}
      </PipelineAbortProvider>
    )
  }
}

// ─── Load-bearing contract test (from plan lines 2355-2381) ──────────────────

it('calls controller.abort() within one polling tick after abort_requested_at flips', async () => {
  vi.useFakeTimers()
  let abortAt: string | null = null
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, json: async () => ({ data: { abortRequestedAt: abortAt }, error: null }),
  })))

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PipelineAbortProvider projectId="p1" machineState="running" currentStage="draft" isPaused={false}>
      {children}
    </PipelineAbortProvider>
  )
  const { result } = renderHook(() => usePipelineAbort(), { wrapper })
  const controller = result.current
  expect(controller).not.toBeNull()
  expect(controller!.signal.aborted).toBe(false)

  // Tick past the 3s interval — flag still null, still not aborted
  await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
  expect(controller!.signal.aborted).toBe(false)

  // Flip the flag; next poll tick should abort
  abortAt = '2026-04-28T00:00:00Z'
  await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
  expect(controller!.signal.aborted).toBe(true)

  vi.useRealTimers()
})

// ─── Scaffold tests (fully fleshed) ──────────────────────────────────────────

describe('polling behaviour', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { abortRequestedAt: null }, error: null }),
    })))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('polls every 3s while running (not setup/done)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { abortRequestedAt: null }, error: null }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = makeWrapper({ machineState: 'running', isPaused: false })
    renderHook(() => usePipelineAbort(), { wrapper })

    // No fetch at t=0 (setInterval fires after first interval)
    expect(fetchMock).toHaveBeenCalledTimes(0)

    // After 3s, one tick
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // After another 3s, second tick
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does NOT poll when machineState is setup', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { abortRequestedAt: null }, error: null }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = makeWrapper({ machineState: 'setup' })
    renderHook(() => usePipelineAbort(), { wrapper })

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(fetchMock).toHaveBeenCalledTimes(0)
  })

  it('backs off to 10s when isPaused=true', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { abortRequestedAt: null }, error: null }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = makeWrapper({ machineState: 'running', isPaused: true })
    renderHook(() => usePipelineAbort(), { wrapper })

    // At 3s: no fetch (paused = 10s interval)
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
    expect(fetchMock).toHaveBeenCalledTimes(0)

    // At 10s: exactly one fetch
    await act(async () => { await vi.advanceTimersByTimeAsync(7_000) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops polling on setup and done', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { abortRequestedAt: null }, error: null }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    // machineState='setup'
    const wrapperSetup = makeWrapper({ machineState: 'setup' })
    const { unmount: unmountSetup } = renderHook(() => usePipelineAbort(), { wrapper: wrapperSetup })
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(fetchMock).toHaveBeenCalledTimes(0)
    unmountSetup()

    fetchMock.mockClear()

    // machineState='done'
    const wrapperDone = makeWrapper({ machineState: 'done' })
    const { unmount: unmountDone } = renderHook(() => usePipelineAbort(), { wrapper: wrapperDone })
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(fetchMock).toHaveBeenCalledTimes(0)
    unmountDone()
  })

  it('mints a fresh AbortController on stage entry', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { abortRequestedAt: null }, error: null }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    // Use a stateful wrapper so we can change currentStage after initial render
    let currentStage = 'draft'
    const DynamicWrapper = ({ children }: { children: React.ReactNode }) => (
      <PipelineAbortProvider
        projectId="p1"
        machineState="running"
        currentStage={currentStage}
        isPaused={false}
      >
        {children}
      </PipelineAbortProvider>
    )

    const { result, rerender } = renderHook(() => usePipelineAbort(), { wrapper: DynamicWrapper })
    const firstController = result.current

    // Change stage and rerender
    currentStage = 'review'
    rerender()

    const secondController = result.current
    // Should be a new instance
    expect(secondController).not.toBe(firstController)
  })
})
