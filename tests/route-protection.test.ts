/**
 * F5.1 — route protection at the edge, and F1.1's signed-in bounce off `/`.
 *
 * Before this existed, `AppShell` referenced no session at all and the only
 * gate was `onboardingCompleted` in localStorage. A signed-out visitor with
 * that flag set sat inside the full application indefinitely, watching every
 * fetch 401 into an empty screen.
 *
 * These assertions drive the real `proxy()` export with real `NextRequest`s.
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

const SELF = 'http://localhost:3000';
const SESSION_COOKIE = 'better-auth.session_token';

function req(path: string, opts: { cookie?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.cookie) headers.set('cookie', opts.cookie);
  return new NextRequest(`${SELF}${path}`, { method: 'GET', headers });
}

const PROTECTED = [
  '/calendar',
  '/tasks',
  '/plan',
  '/docs',
  '/docs/some-doc-id',
  '/focus',
  '/goals',
  '/intelligence',
  '/performance',
  '/pomodoro',
  '/shop',
  '/onboarding',
];

describe('F5.1 — app routes require a session cookie', () => {
  for (const path of PROTECTED) {
    it(`redirects ${path} to /auth/signin when signed out`, () => {
      const res = proxy(req(path));
      expect(res.status).toBe(307);
      const location = new URL(res.headers.get('location') as string);
      expect(location.pathname).toBe('/auth/signin');
      expect(location.searchParams.get('next')).toBe(path);
    });
  }

  it('preserves the query string in ?next=', () => {
    const res = proxy(req('/tasks?new=true&filter=today'));
    const location = new URL(res.headers.get('location') as string);
    expect(location.searchParams.get('next')).toBe('/tasks?new=true&filter=today');
  });

  for (const path of PROTECTED) {
    it(`lets ${path} through when a session cookie is present`, () => {
      const res = proxy(req(path, { cookie: `${SESSION_COOKIE}=abc123` }));
      expect(res.status).not.toBe(307);
    });
  }

  it('recognises the __Secure- prefixed production cookie', () => {
    const res = proxy(req('/calendar', { cookie: `__Secure-${SESSION_COOKIE}=abc123` }));
    expect(res.status).not.toBe(307);
  });

  it('recognises the chunked cookie form', () => {
    const res = proxy(req('/calendar', { cookie: `__Secure-${SESSION_COOKIE}.0=abc123` }));
    expect(res.status).not.toBe(307);
  });

  it('treats an empty cookie value as no session', () => {
    const res = proxy(req('/calendar', { cookie: `${SESSION_COOKIE}=` }));
    expect(res.status).toBe(307);
  });
});

describe('F5.1 — public routes stay public', () => {
  for (const path of ['/', '/auth/signin', '/auth/popup-complete']) {
    it(`does not gate ${path}`, () => {
      const res = proxy(req(path));
      expect(res.status).not.toBe(307);
    });
  }

  it('does not gate a route that merely shares a prefix', () => {
    // `/tasks` is protected; `/tasksomething` is not a sub-route of it.
    const res = proxy(req('/tasksomething'));
    expect(res.status).not.toBe(307);
  });
});

describe('F1.1 — signed-in users are bounced off the marketing page at the edge', () => {
  it('redirects / to /calendar when a session cookie is present', () => {
    const res = proxy(req('/', { cookie: `${SESSION_COOKIE}=abc123` }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') as string).pathname).toBe('/calendar');
  });

  it('renders / for signed-out visitors', () => {
    expect(proxy(req('/')).status).not.toBe(307);
  });

  it('honours ?preview=1 for signed-in users', () => {
    const res = proxy(req('/?preview=1', { cookie: `${SESSION_COOKIE}=abc123` }));
    expect(res.status).not.toBe(307);
  });
});
