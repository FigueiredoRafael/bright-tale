import { describe, it, expect } from 'vitest'
import { renderNormal, renderJson, renderQuiet, summarize } from '../reporter.js'
import type { ProbeResult } from '../types.js'

const SAMPLE: ProbeResult[] = [
  { id: 'SP1-1', sp: 1, desc: 'GET /affiliate/me', status: 'pass', durationMs: 12 },
  { id: 'SP1-2', sp: 1, desc: 'GET /affiliate/me/commissions', status: 'pass', durationMs: 8 },
  { id: 'SP4-1', sp: 4, desc: 'webhook subscription_cycle', status: 'skip', durationMs: 0, detail: 'STRIPE_WEBHOOK_SECRET not set' },
]

describe('summarize', () => {
  it('counts pass/fail/skip', () => {
    expect(summarize(SAMPLE)).toEqual({ pass: 2, fail: 0, skip: 1 })
  })
})

describe('renderNormal', () => {
  it('includes each probe id, desc, status, duration', () => {
    const out = renderNormal(SAMPLE)
    for (const p of SAMPLE) {
      expect(out).toContain(p.id)
      expect(out).toContain(p.desc)
    }
    expect(out).toMatch(/pass/)
    expect(out).toMatch(/skip/)
    expect(out).toMatch(/\d+\s*ms/)
  })
})

describe('renderQuiet', () => {
  it('omits per-probe lines', () => {
    const out = renderQuiet(SAMPLE)
    expect(out).not.toContain('SP1-1')
    expect(out).toMatch(/2 pass.*0 fail.*1 skip/)
  })
})

describe('renderJson', () => {
  it('emits parseable JSON with summary + probes', () => {
    const out = renderJson({
      runId: 'abc123',
      probes: SAMPLE,
      rowsRemoved: 10,
      elapsedMs: 500,
    })
    const parsed = JSON.parse(out)
    expect(parsed.runId).toBe('abc123')
    expect(parsed.summary).toEqual({ pass: 2, fail: 0, skip: 1, elapsedMs: 500, exitCode: 0 })
    expect(parsed.probes).toHaveLength(3)
    expect(parsed.cleanup.rowsRemoved).toBe(10)
  })
})
