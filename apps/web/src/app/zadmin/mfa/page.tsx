'use client'

/**
 * /admin/mfa — TOTP enrollment and challenge flow for admin accounts.
 *
 * State machine:
 *   loading        → fetching current AAL + factor list
 *   already-ready  → user is already aal2, redirect to /admin
 *   needs-enroll   → no verified factor yet — show setup (secret + verify)
 *   needs-challenge → factor exists, session is aal1 — show 6-digit input
 *   error          → something broke; show retry
 *
 * The middleware gate (apps/web/src/middleware.ts) redirects any unauth'd
 * admin request with nextLevel=aal2 to this page. Once the user verifies,
 * their session is promoted to aal2 and subsequent admin requests pass.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { adminPath } from '@/lib/admin-path'

type State =
  | { kind: 'loading' }
  | { kind: 'already-ready' }
  | { kind: 'needs-enroll'; factorId: string; secret: string; otpauthUri: string }
  | { kind: 'needs-challenge'; factorId: string; challengeId?: string }
  | { kind: 'error'; message: string }

const ISSUER = 'BrightTale Admin'

export default function MfaPage() {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ── Initial load: check AAL + existing factors ──────────────────────────
  const init = useCallback(async () => {
    const supabase = createClient()
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace(adminPath('/login'))
        return
      }

      const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aalErr) throw aalErr
      if (aal?.currentLevel === 'aal2') {
        setState({ kind: 'already-ready' })
        setTimeout(() => router.replace(adminPath('/')), 1200)
        return
      }

      const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
      if (fErr) throw fErr
      const totp = factors?.totp?.find((f) => f.status === 'verified')
      if (totp) {
        setState({ kind: 'needs-challenge', factorId: totp.id })
        return
      }

      // No verified TOTP factor — start enrollment.
      const { data: enroll, error: eErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `${ISSUER} · ${new Date().toISOString().slice(0, 10)}`,
        issuer: ISSUER,
      })
      if (eErr) throw eErr
      if (!enroll) throw new Error('No enrollment data returned')
      setState({
        kind: 'needs-enroll',
        factorId: enroll.id,
        secret: enroll.totp.secret,
        otpauthUri: enroll.totp.uri,
      })
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message })
    }
  }, [router])

  useEffect(() => {
    void init()
  }, [init])

  // ── Verify (both enrollment finalize and challenge) ─────────────────────
  const verify = async () => {
    if (state.kind !== 'needs-enroll' && state.kind !== 'needs-challenge') return
    if (!/^\d{6}$/.test(code)) {
      setErrorMsg('Code must be 6 digits')
      return
    }
    setSubmitting(true)
    setErrorMsg(null)
    const supabase = createClient()
    try {
      // Issue a challenge first (Supabase requires this before verify).
      const challenge = await supabase.auth.mfa.challenge({ factorId: state.factorId })
      if (challenge.error) throw challenge.error
      const challengeId = challenge.data.id

      const verifyResp = await supabase.auth.mfa.verify({
        factorId: state.factorId,
        challengeId,
        code,
      })
      if (verifyResp.error) throw verifyResp.error

      // Success — session is now aal2. Bounce back to admin.
      router.replace(adminPath('/'))
    } catch (e) {
      const msg = (e as Error).message || 'Verification failed'
      setErrorMsg(msg)
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <main style={s.bg}>
      <section style={s.card}>
        <h1 style={s.h1}>Two-factor authentication</h1>

        {state.kind === 'loading' && <p style={s.muted}>Loading…</p>}

        {state.kind === 'already-ready' && (
          <p style={s.muted}>Already verified. Redirecting…</p>
        )}

        {state.kind === 'needs-enroll' && (
          <>
            <p style={s.muted}>
              Set up an authenticator app for this admin account. Scan the QR
              in your app (1Password, Authy, Google Authenticator, etc.) or
              paste the secret below, then enter the 6-digit code to confirm.
            </p>

            <div style={s.qrBox}>
              <img
                alt="TOTP QR code"
                style={{ width: 196, height: 196, background: '#fff', padding: 6, borderRadius: 8 }}
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(state.otpauthUri)}`}
              />
              <div>
                <div style={s.label}>Manual entry</div>
                <code style={s.secret}>{state.secret}</code>
                <div style={{ ...s.label, marginTop: 16 }}>otpauth URI</div>
                <code style={{ ...s.secret, fontSize: 10, wordBreak: 'break-all' }}>
                  {state.otpauthUri}
                </code>
              </div>
            </div>

            <CodeInput value={code} onChange={setCode} onSubmit={verify} />

            {errorMsg && <p style={s.err}>{errorMsg}</p>}

            <button type="button" onClick={verify} disabled={submitting || code.length !== 6} style={s.btn}>
              {submitting ? 'Verifying…' : 'Verify and finish'}
            </button>

            <p style={{ ...s.muted, fontSize: 12, marginTop: 18 }}>
              After verification, your session is promoted to AAL2 and you can
              access the admin area. Keep the recovery codes (SEC-001 card)
              safe once they're generated.
            </p>
          </>
        )}

        {state.kind === 'needs-challenge' && (
          <>
            <p style={s.muted}>
              Enter the current 6-digit code from your authenticator app.
            </p>
            <CodeInput value={code} onChange={setCode} onSubmit={verify} />
            {errorMsg && <p style={s.err}>{errorMsg}</p>}
            <button type="button" onClick={verify} disabled={submitting || code.length !== 6} style={s.btn}>
              {submitting ? 'Verifying…' : 'Verify'}
            </button>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <p style={s.err}>Error: {state.message}</p>
            <button type="button" onClick={() => void init()} style={s.btn}>
              Retry
            </button>
          </>
        )}
      </section>
    </main>
  )
}

function CodeInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
}) {
  return (
    <input
      inputMode="numeric"
      pattern="\d{6}"
      maxLength={6}
      autoComplete="one-time-code"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit()
      }}
      placeholder="000000"
      style={s.code}
      aria-label="6-digit code"
    />
  )
}

// ── Styles (inline; avoids Tailwind dependency here) ───────────────────────
const s: Record<string, React.CSSProperties> = {
  bg: {
    minHeight: '100vh',
    background: 'var(--auth-bg, #0a0e1a)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    color: 'var(--auth-text, #e6edf7)',
    fontFamily: 'system-ui, sans-serif',
  },
  card: {
    background: 'var(--auth-card-bg, #121826)',
    border: '1px solid var(--auth-border, #263146)',
    borderRadius: 14,
    padding: '28px 32px',
    maxWidth: 520,
    width: '100%',
  },
  h1: { margin: '0 0 14px', fontSize: 20, letterSpacing: '-0.01em' },
  muted: { color: 'var(--auth-muted, #8b98b0)', fontSize: 13.5, lineHeight: 1.55 },
  qrBox: {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-start',
    margin: '18px 0',
    padding: 14,
    background: '#05070d',
    border: '1px solid var(--auth-border, #263146)',
    borderRadius: 10,
  },
  label: { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--auth-muted, #8b98b0)', marginBottom: 4 },
  secret: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 13,
    background: '#0a0e1a',
    padding: '6px 10px',
    borderRadius: 6,
    display: 'inline-block',
    color: '#dbe4f5',
    userSelect: 'all',
  },
  code: {
    width: '100%',
    padding: '14px 16px',
    margin: '8px 0',
    background: '#05070d',
    border: '1px solid var(--auth-border, #263146)',
    borderRadius: 8,
    color: 'var(--auth-text, #e6edf7)',
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: '0.3em',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  btn: {
    width: '100%',
    padding: '12px 18px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--auth-accent, #8b5cf6)',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 14,
  },
  err: {
    color: '#ff4d6d',
    background: 'rgba(255,77,109,0.12)',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 12.5,
    margin: '10px 0',
  },
}
