import type { CliOptions } from './types.js'

export const HELP_TEXT = `tsx scripts/smoke-affiliate.ts [flags]

Flags:
  --only=SP1|SP2|SP3|SP4     Run only one sub-project's probes
  --json                     Machine-readable summary on stdout
  --quiet                    Suppress per-probe lines
  --verbose                  Emit request/response bodies on FAIL
  --no-cleanup               Leave fixture rows; prints their IDs
  --cleanup-orphans          Skip seed+probes; run email-pattern cascade delete
  --force                    Bypass SUPABASE_URL localhost interlock
  --timeout=N                Global timeout in seconds (default 180)
  --help, -h                 Print this usage

Runs one-at-a-time per host. Uses TEST-NET-2 synthetic IPs.
Requires local Supabase (service role) and apps/api on :3001.
`

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    only: null,
    json: false,
    quiet: false,
    verbose: false,
    noCleanup: false,
    cleanupOrphans: false,
    force: false,
    timeoutSeconds: 180,
    help: false,
  }
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') opts.help = true
    else if (arg === '--json') opts.json = true
    else if (arg === '--quiet') opts.quiet = true
    else if (arg === '--verbose') opts.verbose = true
    else if (arg === '--no-cleanup') opts.noCleanup = true
    else if (arg === '--cleanup-orphans') opts.cleanupOrphans = true
    else if (arg === '--force') opts.force = true
    else if (arg.startsWith('--only=')) {
      const val = arg.slice('--only='.length)
      const n = val.replace('SP', '')
      if (!['1','2','3','4'].includes(n)) {
        throw new Error(`--only must be SP1|SP2|SP3|SP4, got "${val}"`)
      }
      opts.only = Number(n) as 1|2|3|4
    } else if (arg.startsWith('--timeout=')) {
      const n = Number(arg.slice('--timeout='.length))
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--timeout must be a positive number`)
      }
      opts.timeoutSeconds = n
    } else {
      throw new Error(`unknown flag: ${arg}`)
    }
  }
  return opts
}
