import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@tn-figueiredo/auth-nextjs';
import { isAdminUser } from '@/lib/admin-check';
import { adminPath, ADMIN_INTERNAL } from '@/lib/admin-path';
import { verifyBypass } from '@/lib/auth/bypass-verify';

// Edge-level sliding-window rate limiter for the admin login endpoint.
// Keeps state in a module-scoped Map (per runtime instance). Prod should
// swap for Upstash/Redis — same shape of checks.
interface LoginBucket { count: number; resetAt: number }
const loginBuckets = new Map<string, LoginBucket>();
// Policy:
//   Development (NODE_ENV !== 'production'):
//     loose ceiling — lets the Playwright pentest probes run without
//     saturating the limiter on every local test. Probe verifies the code
//     path (+429 when exceeded) without being constantly blocked.
//   Staging + production (NODE_ENV === 'production' on Vercel — both
//     preview and production deploys):
//     strict ceiling — real brute-force protection.
const IS_HIGH_ENV = process.env.NODE_ENV === 'production';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_IP = IS_HIGH_ENV ? 30 : 100;

function bumpLoginLimit(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const b = loginBuckets.get(ip);
  if (!b || b.resetAt <= now) {
    loginBuckets.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > LOGIN_MAX_PER_IP) {
    return { allowed: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

function buildRateLimitHtml(retryAfter: number): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Too many attempts</title>
<style>
:root { color-scheme: dark; }
html, body { margin:0; padding:0; background:#0a0e1a; color:#e6edf7; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif; }
main { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
.card { background:#121826; border:1px solid #263146; border-radius:14px; padding:28px 32px; max-width:480px; width:100%; text-align:center; }
h1 { margin:0 0 12px; font-size:20px; letter-spacing:-0.01em; color:#fff; }
p  { margin:0 0 10px; color:#8b98b0; font-size:13.5px; line-height:1.55; }
.countdown { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:42px; font-weight:700; letter-spacing:0.04em; margin:22px 0 14px; color:#ff9149; }
.meter { height:6px; border-radius:3px; background:#1a2235; overflow:hidden; }
.meter > div { height:100%; background:linear-gradient(90deg, #ff4d6d, #ff9149); transition:width 0.9s linear; }
.back { display:inline-block; margin-top:18px; color:#22d3ee; text-decoration:none; font-size:13px; font-weight:500; padding:8px 16px; border:1px solid #263146; border-radius:8px; }
.back:hover { border-color:#22d3ee; }
</style>
</head>
<body>
<main>
  <section class="card">
    <h1>Too many attempts</h1>
    <p>This IP sent more login attempts than allowed (30 / 15 min). For safety, the admin login is temporarily locked.</p>
    <div class="countdown" id="c">${retryAfter}s</div>
    <div class="meter"><div id="m" style="width:100%"></div></div>
    <p style="margin-top:14px">The page will refresh automatically when the window clears.</p>
    <a class="back" href="/admin/login" id="backLink" hidden>Try again →</a>
  </section>
</main>
<script>
(() => {
  const total = ${retryAfter};
  const start = Date.now();
  const c = document.getElementById('c');
  const m = document.getElementById('m');
  const backLink = document.getElementById('backLink');
  const tick = () => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const remain = Math.max(0, total - elapsed);
    if (c) {
      const m2 = Math.floor(remain / 60);
      const s = remain % 60;
      c.textContent = m2 > 0 ? m2 + 'm ' + (s < 10 ? '0' + s : s) + 's' : remain + 's';
    }
    if (m) m.style.width = (100 * remain / total) + '%';
    if (remain <= 0) {
      if (backLink) backLink.hidden = false;
      clearInterval(interval);
      setTimeout(() => location.href = '/admin/login', 1200);
    }
  };
  tick();
  const interval = setInterval(tick, 1000);
})();
</script>
</body>
</html>`;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;

  // Block direct access to internal /zadmin path (must go through rewrite)
  if (pathname.startsWith(ADMIN_INTERNAL)) {
    return new NextResponse(null, { status: 404 });
  }

  const prefix = adminPath();

  // ── Admin login edge rate limit ──────────────────────────────────────────
  // Any POST to /admin/login — regardless of whether it's a valid Server
  // Action call or raw bot traffic — counts against the per-IP budget.
  // Covers the brute-force probe that used to bypass the in-Action limiter.
  if (request.method === 'POST' && pathname === adminPath('/login')) {
    // Authorized-test-traffic bypass. HMAC-signed, short-lived, dev-only
    // (hard-disabled in production). See lib/auth/bypass-verify.ts.
    const bypass = await verifyBypass(request);
    if (bypass.honored) {
      return response;
    }
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';
    const verdict = bumpLoginLimit(ip);
    if (!verdict.allowed) {
      const isServerAction = request.headers.has('next-action');
      if (isServerAction) {
        // Real form submit — redirect the browser (303 GET) to the login
        // page with error + retry query. The page renders with a live
        // countdown banner above the form.
        const target = new URL(adminPath('/login'), request.url);
        target.searchParams.set('error', 'rate_limited');
        target.searchParams.set('retry', String(verdict.retryAfter));
        return NextResponse.redirect(target, {
          status: 303,
          headers: {
            'Retry-After': String(verdict.retryAfter),
            'Cache-Control': 'no-store',
          },
        });
      }
      // Raw POSTs (bots / curl) get a standalone HTML page with countdown.
      return new NextResponse(buildRateLimitHtml(verdict.retryAfter), {
        status: 429,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Retry-After': String(verdict.retryAfter),
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
  }

  // Only run auth logic for admin routes
  if (!pathname.startsWith(prefix)) {
    return response;
  }

  // Public admin paths — no auth required
  const PUBLIC_ADMIN_PATHS = new Set([
    adminPath('/login'),
    adminPath('/forgot'),
    adminPath('/reset-password'),
    adminPath('/logout'),
  ]);
  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return response;
  }

  // MFA page is authenticated but skips the AAL2 gate (otherwise redirect loop).
  const isMfaPath = pathname === adminPath('/mfa');

  // Skip middleware if Supabase env vars are not configured (build time)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response;
  }

  const supabase = createServerClient({
    env: {
      apiBaseUrl: '',
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL(adminPath('/login'), request.url));
  }

  if (!await isAdminUser(supabase, user.id)) {
    return NextResponse.redirect(new URL(adminPath('/login?error=unauthorized'), request.url));
  }

  // ── AAL2 gate (SEC-002) ─────────────────────────────────────────────────
  // Once an admin enrolls TOTP in Supabase (via /admin/mfa), this block
  // forces aal2 on every protected admin page. The MFA page itself is
  // exempt so a mid-enrollment admin can finish.
  if (!isMfaPath) {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        return NextResponse.redirect(new URL(adminPath('/mfa'), request.url));
      }
    } catch {
      // Transient Supabase MFA failure — don't lock the admin out. Log
      // server-side once observability is wired in.
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
