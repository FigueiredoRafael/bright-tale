import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock next/navigation before any component (or next-intl) can import it
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// Mock next/server for proxy.ts / middleware tests
vi.mock('next/server', () => {
  class MockNextResponse extends Response {
    static next(opts?: { request?: { headers?: Headers } }) {
      const res = new MockNextResponse(null, { status: 200 });
      if (opts?.request?.headers) {
        const overrides: string[] = [];
        opts.request.headers.forEach((_v: string, k: string) => {
          overrides.push(k);
          res.headers.set(`x-middleware-request-${k}`, opts.request!.headers!.get(k)!);
        });
        res.headers.set('x-middleware-override-headers', overrides.join(','));
      }
      return res;
    }
    static redirect(url: string | URL) { return new MockNextResponse(null, { status: 307, headers: { Location: String(url) } }); }
    static rewrite(url: string | URL) { return new MockNextResponse(null, { status: 200, headers: { 'x-middleware-rewrite': String(url) } }); }
    static json(body: unknown, init?: ResponseInit) { return new MockNextResponse(JSON.stringify(body), { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), 'content-type': 'application/json' } }); }
  }
  class MockNextRequest extends Request {
    nextUrl: URL;
    cookies: { getAll: () => never[]; set: () => void };
    constructor(input: string | URL | Request, init?: RequestInit) {
      super(input, init);
      this.nextUrl = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      this.cookies = { getAll: () => [], set: () => {} };
    }
  }
  return { NextResponse: MockNextResponse, NextRequest: MockNextRequest };
});

// Mock next-intl/middleware so proxy.ts doesn't pull in next/server via next-intl
vi.mock('next-intl/middleware', () => ({
  default: () => () => new Response(null, { status: 200 }),
}));

// Mock next-intl/navigation so @/i18n/navigation resolves without hitting next internals
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({
    Link: ({ children, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => {
      const React = require('react');
      return React.createElement('a', props, children);
    },
    redirect: vi.fn(),
    usePathname: () => '/',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
    getPathname: vi.fn(),
  }),
}));

// Mock next-intl so useTranslations/useLocale resolve
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
  useMessages: () => ({}),
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

if (!globalThis.fetch) {
  globalThis.fetch = fetch;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// Radix UI primitives (Select, Dialog) call Pointer Capture APIs that jsdom
// does not implement. Polyfill them as no-ops so userEvent can drive them.
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

// Provide a minimal localStorage stub for jsdom+forks pool
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    },
    writable: true,
  });
}
