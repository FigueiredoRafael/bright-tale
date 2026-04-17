import { SP1_PROBES } from './sp1.js'
import { SP2_PROBES } from './sp2.js'
import { buildSp3Probes } from './sp3.js'
import { SP4_PROBES } from './sp4.js'
import type { Probe } from '../types.js'

// Execution order per spec §3:
// SP1 (reads) → SP4 (billing) → SP2 reads (1-4) → SP2-5 (resolve flag) →
//   SP3 (rate-limit; needs status='active') → SP2-6 (pause, terminal)
export function orderedProbes(refRateLimitMax: number): Probe[] {
  const sp3 = buildSp3Probes(refRateLimitMax)
  const sp2Reads = SP2_PROBES.filter(p => p.id !== 'SP2-6')
  const sp2Pause = SP2_PROBES.find(p => p.id === 'SP2-6')!
  return [...SP1_PROBES, ...SP4_PROBES, ...sp2Reads, ...sp3, sp2Pause]
}

export function filterByOnly(probes: Probe[], only: 1 | 2 | 3 | 4 | null): Probe[] {
  return only === null ? probes : probes.filter(p => p.sp === only)
}
