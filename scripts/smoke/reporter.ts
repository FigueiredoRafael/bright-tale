import type { ProbeResult } from './types.js'
import { ExitCode } from './types.js'

export function summarize(probes: ProbeResult[]) {
  let pass = 0, fail = 0, skip = 0
  for (const p of probes) {
    if (p.status === 'pass') pass++
    else if (p.status === 'fail') fail++
    else skip++
  }
  return { pass, fail, skip }
}

export function renderNormal(probes: ProbeResult[]): string {
  const lines = probes.map(p => {
    const id = p.id.padEnd(6)
    const desc = p.desc.padEnd(42)
    const status = p.status.padEnd(5)
    const ms = String(p.durationMs).padStart(5) + ' ms'
    const detail = p.detail ? `   (${p.detail})` : ''
    return `  ${id} ${desc} ${status} ${ms}${detail}`
  })
  return lines.join('\n')
}

export function renderQuiet(probes: ProbeResult[]): string {
  const s = summarize(probes)
  return `${s.pass} pass · ${s.fail} fail · ${s.skip} skip`
}

export interface JsonReportInput {
  runId: string
  probes: ProbeResult[]
  rowsRemoved: number
  elapsedMs: number
}

export function renderJson(input: JsonReportInput): string {
  const s = summarize(input.probes)
  const exitCode = s.fail > 0 ? ExitCode.ProbeFailed : ExitCode.Ok
  return JSON.stringify({
    runId: input.runId,
    probes: input.probes,
    cleanup: { rowsRemoved: input.rowsRemoved },
    summary: { ...s, elapsedMs: input.elapsedMs, exitCode },
  })
}
