#!/usr/bin/env tsx
// Affiliate branch smoke — one-at-a-time per host, TEST-NET-2 synthetic IPs,
// service-role DB access, requires local Supabase + apps/api on :3001.
// See docs/superpowers/specs/2026-04-17-affiliate-branch-smoke-design.md

import { createClient } from '@supabase/supabase-js'
import { parseArgs, HELP_TEXT } from './smoke/cli.js'
import { loadEnv } from './smoke/env.js'
import { probeApiHealth, probeSupabaseHealth } from './smoke/preflight.js'
import { seed, cleanup, cleanupOrphans, captureBaselines, makeRunId } from './smoke/fixture.js'
import { renderNormal, renderQuiet, renderJson, summarize } from './smoke/reporter.js'
import { orderedProbes, filterByOnly } from './smoke/probes/index.js'
import { ExitCode, type ProbeResult, type SeedHandles } from './smoke/types.js'

async function main(): Promise<number> {
  let opts
  try { opts = parseArgs(process.argv.slice(2)) }
  catch (err) { console.error(`error: ${(err as Error).message}`); return ExitCode.PreflightFailed }

  if (opts.help) { console.log(HELP_TEXT); return ExitCode.Ok }

  const env = loadEnv(opts.force)
  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  })

  if (opts.cleanupOrphans) {
    const r = await cleanupOrphans(supabase)
    console.log(`[cleanup-orphans] removed ${r.rowsRemoved} rows; ${r.failures.length} failures`)
    return r.failures.length > 0 ? ExitCode.CleanupFailed : ExitCode.Ok
  }

  // Preflight
  const apiHealth = await probeApiHealth(env.apiUrl)
  const supaHealth = await probeSupabaseHealth(supabase)
  if (!opts.quiet && !opts.json) {
    console.log(`Preflight (2)`)
    console.log(`  ${supaHealth.status === 'pass' ? '✓' : '✗'} supabase @ ${env.supabaseUrl}  (${supaHealth.durationMs} ms)`)
    console.log(`  ${apiHealth.status === 'pass' ? '✓' : '✗'} api      @ ${env.apiUrl}  (${apiHealth.durationMs} ms)`)
  }
  if (apiHealth.status !== 'pass') {
    console.error(`preflight: api unreachable at ${env.apiUrl}/health — ${apiHealth.detail}`)
    return ExitCode.PreflightFailed
  }
  if (supaHealth.status !== 'pass') {
    console.error(`preflight: supabase unreachable at ${env.supabaseUrl} — ${supaHealth.detail}`)
    return ExitCode.PreflightFailed
  }

  // Seed
  const runId = makeRunId()
  let handles: SeedHandles
  try { handles = await seed(supabase, runId) }
  catch (err) {
    console.error(`seed failed: ${(err as Error).message}`)
    return ExitCode.SeedFailed
  }

  let cleanupRan = false
  const runCleanup = async (): Promise<{ rowsRemoved: number; failures: number }> => {
    if (cleanupRan || opts.noCleanup) return { rowsRemoved: 0, failures: 0 }
    cleanupRan = true
    const r = await cleanup(supabase, handles)
    for (const f of r.failures) console.error(`[cleanup-warn] ${f.table}: ${f.error}`)
    return { rowsRemoved: r.rowsRemoved, failures: r.failures.length }
  }

  let signalled = false
  const handleSig = async () => {
    if (signalled) {
      console.error(`[signal] second signal — bypassing cleanup; orphan runId=${runId}`)
      process.exit(ExitCode.SIGINT)
    }
    signalled = true
    console.error(`[signal] running cleanup for runId=${runId}`)
    await runCleanup().catch(e => console.error(`[signal] cleanup error: ${e}`))
    process.exit(ExitCode.SIGINT)
  }
  process.on('SIGINT', handleSig)
  process.on('SIGTERM', handleSig)
  const timeoutMs = opts.timeoutSeconds * 1000
  const timeoutHandle = setTimeout(async () => {
    console.error(`[timeout] after ${opts.timeoutSeconds}s — running cleanup`)
    await runCleanup().catch(() => { /* best effort */ })
    process.exit(ExitCode.Timeout)
  }, timeoutMs)
  timeoutHandle.unref?.()

  const baselines = await captureBaselines(supabase, handles)
  const ctx = {
    fixture: handles, baselines,
    apiUrl: env.apiUrl, supabase,
    internalKey: env.internalKey,
    stripeWebhookSecret: env.stripeWebhookSecret,
  }

  // Run probes in order
  const probes = filterByOnly(orderedProbes(env.refRateLimitMax), opts.only)
  const results: ProbeResult[] = []
  const startAll = Date.now()
  for (const probe of probes) {
    const start = Date.now()
    let outcome: { status: 'pass' | 'fail' | 'skip'; detail?: string }
    try { outcome = await probe.run(ctx) }
    catch (err) { outcome = { status: 'fail', detail: `threw: ${(err as Error).message}` } }
    const durationMs = Date.now() - start
    results.push({ id: probe.id, sp: probe.sp, desc: probe.desc, durationMs, ...outcome })
    if (!opts.quiet && !opts.json) {
      const line = outcome.status === 'pass'
        ? `  ${probe.id.padEnd(6)} ${probe.desc.padEnd(42)} pass  ${String(durationMs).padStart(5)} ms`
        : `  ${probe.id.padEnd(6)} ${probe.desc.padEnd(42)} ${outcome.status}  ${String(durationMs).padStart(5)} ms   (${outcome.detail})`
      console.log(line)
    }
    if (opts.verbose && outcome.status === 'fail') {
      console.error(`[verbose] ${probe.id} detail: ${outcome.detail}`)
    }
  }
  const elapsedMs = Date.now() - startAll

  // Cleanup
  const cleanupSummary = await runCleanup()
  clearTimeout(timeoutHandle)

  // Report
  const s = summarize(results)
  if (opts.json) {
    console.log(renderJson({ runId, probes: results, rowsRemoved: cleanupSummary.rowsRemoved, elapsedMs }))
  } else if (opts.quiet) {
    console.log(renderQuiet(results) + ` · exit ${s.fail > 0 ? 1 : 0}`)
  } else {
    console.log('')
    console.log(`Cleanup`)
    console.log(`  ${cleanupSummary.failures === 0 ? '✓' : '✗'} ${cleanupSummary.rowsRemoved} rows removed`)
    console.log('')
    console.log(`Summary`)
    console.log(`  ${s.pass} pass · ${s.fail} fail · ${s.skip} skip · elapsed ${elapsedMs} ms`)
  }

  if (s.fail > 0) return ExitCode.ProbeFailed
  if (cleanupSummary.failures > 0) return ExitCode.CleanupFailed
  return ExitCode.Ok
}

main()
  .then(code => process.exit(code))
  .catch(err => {
    console.error(`[fatal] ${(err as Error).message}`)
    process.exit(ExitCode.ProbeFailed)
  })
