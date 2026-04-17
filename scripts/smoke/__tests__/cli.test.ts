import { describe, it, expect } from 'vitest'
import { parseArgs, HELP_TEXT } from '../cli.js'

describe('parseArgs', () => {
  it('returns defaults when given empty argv', () => {
    const opts = parseArgs([])
    expect(opts).toEqual({
      only: null,
      json: false,
      quiet: false,
      verbose: false,
      noCleanup: false,
      cleanupOrphans: false,
      force: false,
      timeoutSeconds: 180,
      help: false,
    })
  })

  it('parses --only=SP3', () => {
    expect(parseArgs(['--only=SP3']).only).toBe(3)
  })

  it('rejects invalid --only', () => {
    expect(() => parseArgs(['--only=SP9'])).toThrow(/--only/)
  })

  it('parses flags', () => {
    const opts = parseArgs([
      '--json', '--quiet', '--verbose', '--no-cleanup',
      '--cleanup-orphans', '--force', '--timeout=90',
    ])
    expect(opts.json).toBe(true)
    expect(opts.quiet).toBe(true)
    expect(opts.verbose).toBe(true)
    expect(opts.noCleanup).toBe(true)
    expect(opts.cleanupOrphans).toBe(true)
    expect(opts.force).toBe(true)
    expect(opts.timeoutSeconds).toBe(90)
  })

  it('parses --help and -h', () => {
    expect(parseArgs(['--help']).help).toBe(true)
    expect(parseArgs(['-h']).help).toBe(true)
  })

  it('rejects unknown flag', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(/unknown/i)
  })

  it('HELP_TEXT mentions all flags', () => {
    for (const flag of ['--only', '--json', '--quiet', '--verbose',
                        '--no-cleanup', '--cleanup-orphans',
                        '--force', '--timeout', '--help']) {
      expect(HELP_TEXT).toContain(flag)
    }
  })
})
