/**
 * Batch 6 — CSRF Origin-allowlist middleware. Asserts the real attack shape is
 * blocked, legitimate same-origin requests pass, GET is untouched, the
 * both-headers-absent case is rejected (the decided default), and the
 * shared-secret / BetterAuth exemptions are honoured.
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

const SELF = 'http://localhost:3000';

function req(
  path: string,
  init: { method?: string; origin?: string; referer?: string; contentType?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (init.origin !== undefined) headers.set('origin', init.origin);
  if (init.referer !== undefined) headers.set('referer', init.referer);
  if (init.contentType !== undefined) headers.set('content-type', init.contentType);
  return new NextRequest(`${SELF}${path}`, { method: init.method ?? 'GET', headers });
}

describe('CSRF middleware — Origin allowlist on mutating API requests', () => {
  it('allows a same-origin POST', () => {
    expect(proxy(req('/api/tasks', { method: 'POST', origin: SELF })).status).not.toBe(403);
  });

  it('rejects a cross-origin POST (403)', () => {
    expect(proxy(req('/api/tasks', { method: 'POST', origin: 'https://evil.example' })).status).toBe(403);
  });

  it('rejects the real attack shape — cross-origin text/plain POST (content-type is irrelevant; Origin is what matters)', () => {
    const res = proxy(req('/api/shop/purchase', {
      method: 'POST',
      origin: 'https://evil.example',
      contentType: 'text/plain',
    }));
    expect(res.status).toBe(403);
  });

  it('leaves GET unaffected regardless of origin', () => {
    expect(proxy(req('/api/tasks', { method: 'GET', origin: 'https://evil.example' })).status).not.toBe(403);
  });

  it('rejects a mutating request with NEITHER Origin nor Referer (decided default)', () => {
    expect(proxy(req('/api/tasks', { method: 'POST' })).status).toBe(403);
  });

  it('falls back to a same-origin Referer when Origin is absent', () => {
    expect(proxy(req('/api/tasks', { method: 'POST', referer: `${SELF}/tasks` })).status).not.toBe(403);
  });

  it('rejects a cross-origin Referer when Origin is absent', () => {
    expect(proxy(req('/api/tasks', { method: 'POST', referer: 'https://evil.example/x' })).status).toBe(403);
  });

  it('checks every mutating method — PATCH/PUT/DELETE cross-origin are rejected', () => {
    for (const method of ['PATCH', 'PUT', 'DELETE']) {
      expect(proxy(req('/api/tasks/abc', { method, origin: 'https://evil.example' })).status).toBe(403);
    }
  });

  it('exempts /api/cron/* (shared-secret, no browser Origin) — allowed with no Origin/Referer', () => {
    expect(proxy(req('/api/cron/daily-brief', { method: 'POST' })).status).not.toBe(403);
  });

  it('exempts /api/auth/* (BetterAuth owns its CSRF) — allowed even cross-origin', () => {
    expect(
      proxy(req('/api/auth/sign-in/social', { method: 'POST', origin: 'https://accounts.google.com' })).status,
    ).not.toBe(403);
  });

  it('derives "self" from x-forwarded-host — a same-origin POST on a Vercel preview/custom host passes', () => {
    // The internal request URL is localhost, but the request arrived on a Vercel
    // preview host (x-forwarded-host) and the Origin matches it. This must pass
    // even though it's neither localhost nor BETTER_AUTH_URL — the exact prod
    // failure mode of comparing against req.nextUrl/BETTER_AUTH_URL only.
    const headers = new Headers({
      origin: 'https://lumina-9f2ab1x-team.vercel.app',
      'x-forwarded-host': 'lumina-9f2ab1x-team.vercel.app',
      'x-forwarded-proto': 'https',
    });
    const r = new NextRequest('http://localhost:3000/api/tasks', { method: 'POST', headers });
    expect(proxy(r).status).not.toBe(403);
  });

  it('still rejects a cross-origin POST that arrives on a valid forwarded host', () => {
    const headers = new Headers({
      origin: 'https://evil.example',
      'x-forwarded-host': 'lumina-six-bay.vercel.app',
      'x-forwarded-proto': 'https',
    });
    const r = new NextRequest('http://localhost:3000/api/tasks', { method: 'POST', headers });
    expect(proxy(r).status).toBe(403);
  });

  it('never touches the GET OAuth callback/connect routes, even from a provider origin', () => {
    expect(
      proxy(req('/api/integrations/microsoft/callback', { method: 'GET', origin: 'https://login.microsoftonline.com' })).status,
    ).not.toBe(403);
    expect(
      proxy(req('/api/integrations/google/connect', { method: 'GET', origin: 'https://accounts.google.com' })).status,
    ).not.toBe(403);
  });
});
