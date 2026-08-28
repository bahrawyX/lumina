/**
 * P1-15(a) — the `(app)` layout read nothing.
 *
 * It was a synchronous passthrough, so everything the app knew about the
 * current user arrived on the client after hydration via
 * `authClient.useSession()`. Until that resolved, `AppShell` had to ASSUME a
 * session existed — which is why the blocking hydration overlay was gated on a
 * guess, and how F5.6 could show a signed-out visitor a full-screen spinner.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const codeOf = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

const layout = codeOf(read('src/app/(app)/layout.tsx'));
const shell = codeOf(read('src/app/(app)/AppShell.tsx'));

describe('P1-15(a) — the layout resolves the session on the server', () => {
  it('is async and reads the session cookie during SSR', () => {
    expect(layout).toContain('export default async function AppLayout');
    // Quote-agnostic: this file uses double quotes, most of the codebase uses
    // single, and which one it is has nothing to do with the finding.
    expect(layout).toMatch(/from ["']next\/headers["']/);
    expect(layout).toContain('auth.api');
    expect(layout).toContain('getSession({ headers: await headers() })');
  });

  it('passes the answer down instead of leaving the shell to guess', () => {
    expect(layout).toContain('initialHasSession={Boolean(session?.user)}');
    expect(shell).toContain('initialHasSession: boolean;');
  });

  it('a failed session read does not take the whole app down', () => {
    // The layout wraps every page under `(app)`. An unreachable database here
    // would render a hard error instead of the app plus a recoverable
    // signed-out state.
    expect(layout).toContain('.catch(() => null)');
  });
});

describe('P1-15(a) — and the shell stops assuming', () => {
  it('uses the server value while the client hook resolves', () => {
    // Was `shellSessionPending || Boolean(shellSession?.user)` — i.e. assume
    // TRUE while pending, because the alternative was a flash of the app
    // before the overlay. That trade-off no longer exists.
    expect(shell).toContain(
      'const hasSession = shellSessionPending ? initialHasSession : Boolean(shellSession?.user);',
    );
    expect(shell).not.toContain('shellSessionPending || Boolean(shellSession?.user)');
  });

  it('the overlay is still gated on all three conditions', () => {
    // The F5.6 fix must survive this change: onboarding done, a session, and
    // data still loading.
    expect(shell).toContain('{onboardingCompleted && hasSession && !allHydrated && (');
  });

  it('the client hook is still mounted, so expiry detection is unaffected', () => {
    // The server value is a first-paint seed, not a replacement — a session
    // that dies mid-use is only visible to the hook and the 401 interceptor.
    expect(shell).toContain('authClient.useSession()');
    expect(shell).toContain('<SessionExpiryWatcher');
  });
});
