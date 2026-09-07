/**
 * The cron schedule lives in GitHub Actions, and every cron route is in it.
 *
 * `vercel.json` used to declare these as Vercel Cron jobs. Commit 989f4ce moved
 * them to hourly so each could select the users for whom it is currently the
 * right LOCAL hour — and this account is on Vercel's Hobby plan, where cron jobs
 * may run only once per day.
 *
 * The failure mode is what makes this worth a test. Vercel rejects such a
 * deployment at CREATION time, so no deployment record is written, no build
 * fails, and nothing appears in the activity log. Production silently stayed on
 * the commit before the change while 87 further pushes were refused without a
 * trace. Nothing about that is visible from inside the repository — which is
 * exactly why it needs a guard here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const workflowPath = join(root, '.github/workflows/cron.yml');

describe('vercel.json does not schedule crons', () => {
  it('declares no crons, on any plan', () => {
    // Re-adding them would either be rejected outright (hourly) or silently
    // double-fire alongside the workflow (daily).
    const p = join(root, 'vercel.json');
    if (!existsSync(p)) return;

    const config = JSON.parse(readFileSync(p, 'utf8'));
    expect(
      config.crons ?? [],
      'vercel.json declares crons again — Hobby rejects sub-daily schedules at deploy creation, silently',
    ).toEqual([]);
  });
});

describe('the workflow schedules every cron route', () => {
  const workflow = readFileSync(workflowPath, 'utf8');

  /** Every directory under src/app/api/cron that actually has a handler. */
  const routes = readdirSync(join(root, 'src/app/api/cron'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => existsSync(join(root, 'src/app/api/cron', name, 'route.ts')));

  it('finds the cron routes at all', () => {
    // Guards the guard: if this ever returned [], every per-route assertion
    // below would pass over an empty list and prove nothing.
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(routes)('includes %s', (name) => {
    // A new cron route that nobody scheduled would never run, and would look
    // completely healthy from inside the codebase.
    expect(workflow).toContain(name);
  });

  it('runs at least hourly', () => {
    // The routes select users by local hour, so a daily schedule serves one
    // timezone band and silently skips the rest.
    const match = workflow.match(/- cron: '([^']+)'/);
    expect(match, 'no schedule found').not.toBeNull();

    const [minute, hour] = match![1].split(' ');
    expect(hour, 'hour field must be * — a fixed hour means daily').toBe('*');
    expect(minute).toMatch(/^[0-9,]+$/);
  });

  it('sends the secret as a header, never in the URL', () => {
    // A query parameter would land in Vercel's access logs.
    expect(workflow).toContain('Authorization: Bearer');
    expect(workflow).not.toMatch(/[?&]secret=/);
    expect(workflow).not.toMatch(/[?&]token=/);
  });

  it('fails the run when an endpoint fails', () => {
    // Without a non-zero exit the schedule could break silently, which is the
    // whole failure this file exists to prevent recurring.
    expect(workflow).toContain('exit "$failed"');
  });
});
