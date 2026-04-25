'use client'

import { useEffect, useRef, useState } from 'react'

const LS_RESET_AT = 'adminRateLimitResetAt'

function getRemainingSeconds(): number {
  try {
    const resetAt = Number(localStorage.getItem(LS_RESET_AT) ?? 0)
    return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000))
  } catch {
    return 0
  }
}

export function RateLimitBanner() {
  const [remaining, setRemaining] = useState(0)
  const totalRef = useRef(0)

  useEffect(() => {
    const initial = getRemainingSeconds()
    totalRef.current = initial
    setRemaining(initial)

    const t = setInterval(() => {
      const r = getRemainingSeconds()
      setRemaining(r)
      if (r <= 0) {
        clearInterval(t)
        try { localStorage.removeItem(LS_RESET_AT) } catch { /* noop */ }
      }
    }, 1000)
    return () => clearInterval(t)
  }, [])

  if (remaining <= 0) return null

  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  const label = m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
  const pct = totalRef.current > 0 ? (100 * remaining) / totalRef.current : 100

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        width: '100%',
        marginBottom: 16,
        padding: '12px 14px',
        borderRadius: 10,
        background:
          'linear-gradient(135deg, color-mix(in srgb, #ff9149 20%, transparent), color-mix(in srgb, #ff4d6d 10%, transparent))',
        border: '1px solid color-mix(in srgb, #ff9149 40%, #263146)',
        color: 'var(--auth-text, #e6edf7)',
        fontFamily:
          '-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 13 }}>Muitas tentativas</strong>
        <span
          style={{
            fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
            color: '#ff9149',
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--auth-muted, #8b98b0)', margin: '4px 0 8px' }}>
        Por segurança, este IP está temporariamente bloqueado. Aguarde antes de tentar novamente.
      </div>
      <div style={{ height: 4, borderRadius: 2, background: '#1a2235', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #ff4d6d, #ff9149)',
            transition: 'width 1s linear',
          }}
        />
      </div>
    </div>
  )
}
