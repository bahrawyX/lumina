/**
 * P2-14 — no account deletion and no data export.
 *
 * Every child table already cascaded from `users`, so the database was ready
 * for it; there was simply no endpoint, no soft-delete flag and no export. For
 * a product storing calendar contents, document bodies and mood logs that is a
 * GDPR Article 17 (erasure) and Article 20 (portability) gap.
 *
 * These tests are structural rather than behavioural: exercising the real
 * handlers would mean standing up BetterAuth against a live adapter, and the
 * properties that actually matter here — "the export never contains a
 * credential", "deletion re-verifies the caller" — are properties of the code,
 * not of a single request.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcFile = (...parts: string[]) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

const exportRoute = srcFile('app', 'api', 'users', 'me', 'export', 'route.ts');
const deleteRoute = srcFile('app', 'api', 'users', 'me', 'route.ts');
const authConfig = srcFile('lib', 'auth.ts');

describe('P2-14 — the export exists and covers the user\'s own data', () => {
  it('is a GET that returns a downloadable bundle', () => {
    expect(exportRoute).toContain('export async function GET');
    expect(exportRoute).toContain('Content-Disposition');
    expect(exportRoute).toContain("format: 'lumina.export.v1'");
  });

  it('includes every table that holds the user\'s content', () => {
    for (const table of [
      'tasks',
      'events',
      'eventRecurrence',
      'calendars',
      'docs',
      'goals',
      'goalTargets',
      'plannerItems',
      'focusSessions',
      'achievements',
      'coinTransactions',
      'moodLogs',
    ]) {
      expect(exportRoute, table).toContain(`${table}: `);
    }
  });

  it('is rate limited — it is the most expensive read an account can ask for', () => {
    expect(exportRoute).toContain("createRateLimiter('userExport'");
    expect(exportRoute).toContain('rateLimitedResponse(');
  });

  it('is scoped to the caller everywhere, including the one table with no user_id', () => {
    // `goal_targets` hangs off `goals`. Reading every user's targets and
    // filtering afterwards would be a cross-user read whatever came back.
    expect(exportRoute).toContain('inArray(goalTargets.goalId, goalIds)');
    expect(exportRoute).toContain('eq(users.id, userId)');
  });
});

describe('P2-14 — the export is not a key ring', () => {
  /**
   * Match against CODE, not comments. The route's docblock names every
   * credential column precisely because it explains why they are excluded, so
   * a naive `toContain` would fail on the explanation rather than the code.
   */
  const code = exportRoute
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  it('never selects a credential column', () => {
    // A downloadable file is copied, mailed and left in Downloads folders.
    // Anything in it that grants access is worse than useless.
    for (const forbidden of [
      'accessToken',
      'refreshToken',
      'accounts.password',
      'sessions.token',
      'p256dh',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('does not select whole rows from the credential-bearing tables', () => {
    // `db.select().from(integrations)` would take the tokens with it; the route
    // must name its columns.
    expect(code).not.toMatch(/select\(\)\s*\.from\(integrations\)/);
    expect(code).not.toMatch(/select\(\)\s*\.from\(pushSubscriptions\)/);
    expect(code).not.toMatch(/\.from\(accounts\)/);
    expect(code).not.toMatch(/\.from\(sessions\)/);
  });

  it('says in the file itself what was withheld', () => {
    // Otherwise the absence reads as an incomplete export rather than a
    // deliberate one.
    expect(exportRoute).toContain('omitted:');
    expect(exportRoute).toContain('credentials:');
  });

  it('marks the response uncacheable', () => {
    expect(exportRoute).toContain("'Cache-Control': 'private, no-store, max-age=0'");
  });
});

describe('P2-14 — deletion re-verifies before doing anything irreversible', () => {
  it('is enabled in the auth config', () => {
    expect(authConfig).toContain('deleteUser: {');
    expect(authConfig).toContain('enabled: true');
  });

  it('delegates the verification to BetterAuth rather than hand-rolling it', () => {
    // BetterAuth requires the password for a credential account, or a session
    // created inside `freshAge` for an OAuth-only one, then drops every session
    // row and clears the cookie.
    expect(deleteRoute).toContain('auth.api.deleteUser(');
    expect(deleteRoute).toContain('asResponse: true');
  });

  it('forwards the response verbatim so Set-Cookie reaches the browser', () => {
    // Re-wrapping the JSON would drop the cookie and leave the browser holding
    // a token for a user that no longer exists.
    expect(deleteRoute).toContain('return await auth.api.deleteUser(');
  });

  it('requires an explicit confirmation string', () => {
    // A destructive endpoint reachable by a bare
    // `fetch('/api/users/me', {method:'DELETE'})` is one mis-wired button away
    // from an accident.
    expect(deleteRoute).toContain("body.confirm !== 'DELETE'");
  });

  it('does not depend on email delivery', () => {
    // With `sendDeleteAccountVerification`, an account whose address has lapsed
    // could never be deleted at all.
    expect(authConfig).not.toContain('sendDeleteAccountVerification:');
  });

  it('takes the contact submissions that cascades would leave behind', () => {
    // `contact_submissions.user_id` is ON DELETE SET NULL so tickets outlive
    // the account — but the row still carries the email and message the user
    // wrote, and a null user_id does not un-write it.
    expect(authConfig).toContain('beforeDelete');
    expect(authConfig).toContain('schema.contactSubmissions');
  });
});

describe('P2-14 — every user-scoped table is reachable by cascade', () => {
  const schemaDir = join(process.cwd(), 'src', 'db', 'schema');

  /** Tables whose `user_id` deliberately does NOT cascade, with the reason. */
  const INTENTIONAL = new Map([
    ['contactSubmissions.ts', 'SET NULL — tickets outlive the account; rows are deleted in beforeDelete'],
  ]);

  it('has no user-scoped table that would orphan rows on delete', () => {
    const orphaning: string[] = [];
    for (const file of readdirSync(schemaDir).filter((f) => f.endsWith('.ts') && f !== 'index.ts')) {
      const src = readFileSync(join(schemaDir, file), 'utf8');
      if (!src.includes("uuid('user_id')")) continue;
      if (!src.includes('references(() => users.id')) continue;
      if (src.includes("onDelete: 'cascade'")) continue;
      if (INTENTIONAL.has(file)) continue;
      orphaning.push(file);
    }
    expect(orphaning).toEqual([]);
  });
});

describe('P2-14 — the rights are reachable from the UI', () => {
  const sheet = srcFile('components', 'settings', 'AccountDataSheet.tsx');
  const sidebar = srcFile('components', 'Sidebar.tsx');

  it('the account menu opens it', () => {
    expect(sidebar).toContain('AccountDataSheet');
    expect(sidebar).toContain('Your data');
  });

  it('calls both endpoints', () => {
    expect(sheet).toContain("fetch('/api/users/me/export')");
    expect(sheet).toContain("fetch('/api/users/me'");
    expect(sheet).toContain("confirm: 'DELETE'");
  });

  it('asks for the password only when the account has one', () => {
    expect(sheet).toContain('hasPassword');
    expect(sheet).toContain("prefs?.hasPassword === 'boolean'");
  });

  it('requires a second, explicit confirmation before the destructive call', () => {
    expect(sheet).toContain('confirmingDelete');
    expect(sheet).toContain('Permanently delete');
  });

  it('clears local caches after the account is gone', () => {
    // Otherwise they outlive the account on this device — and the next person
    // to use it.
    expect(sheet).toContain('clearLuminaStorage()');
  });

  it('the preferences endpoint exposes only the boolean', () => {
    const prefs = srcFile('app', 'api', 'users', 'preferences', 'route.ts');
    expect(prefs).toContain('hasPassword: credential.length > 0');
    expect(prefs).toContain('select({ id: accounts.id })');
    expect(prefs).not.toContain('accounts.password');
  });
});
