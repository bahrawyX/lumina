import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const atAlias = { '@': path.resolve(__dirname, './src') };

// `server-only` is a production RSC guard (it throws under Vitest's Node
// resolver). It is stubbed for exactly ONE test — the H7 Microsoft-mapper test,
// which must import the mapper module that carries the guard. Scoping the stub
// to a dedicated Vitest project (instead of a global resolve.alias) keeps the
// guard live everywhere else: any OTHER test that imports server-only code still
// fails loudly, so the guard's intent isn't quietly disabled repo-wide.
const serverOnlyStub = path.resolve(__dirname, './tests/helpers/serverOnlyStub.ts');
const SERVER_ONLY_TESTS = [
  'tests/microsoft-timezone.test.ts',
  // Batch 5: imports real API-route handlers whose dependency trees pull in
  // `server-only` (e.g. via @/lib/db, coin helpers). @/lib/db + @/lib/auth are
  // vi.mock'd; this stub neutralises the remaining transitive server-only guards.
  'tests/cross-user-access.test.ts',
  // Batch 8 #4: imports the real google/microsoft token modules, which carry the
  // `server-only` guard directly. @/lib/db is vi.mock'd to an ephemeral PGlite.
  'tests/token-refresh-race.test.ts',
  // P1-9: imports the real rate limiter, which carries the `server-only` guard
  // directly. @/lib/db is vi.mock'd to an ephemeral PGlite.
  'tests/rate-limit-durable.test.ts',
  // F3.6: these import `@/lib/auth`, whose tree now includes the email sender.
  // That module reads RESEND_API_KEY, so its `server-only` guard is correct and
  // stays — unlike the logger's, which was removed because it guarded nothing.
  'tests/password-recovery.test.ts',
  'tests/auth-config.test.ts',
  // P1-12/P1-13: imports the provider-error classifier, which is server-only.
  'tests/provider-error.test.ts',
  // P1-4: imports the tasks PATCH handler, whose tree includes `@/lib/ownership`
  // (server-only — it queries the database).
  'tests/task-award-response.test.ts',
  // P1-2: imports the notification claim helper, which is server-only.
  'tests/notification-claim.test.ts',
  // P1-10/P3-3: imports the integration error classifier, which is server-only.
  'tests/range-and-provider-codes.test.ts',
  // P2-5: imports the shared primary-local calendar resolver, which is
  // server-only (it queries the database).
  'tests/link-and-stale-writes.test.ts',
  // P2-8: imports the user-local-day helper, which is server-only.
  'tests/user-local-day.test.ts',
];

const baseTest = {
  globals: true,
  environment: 'jsdom' as const,
  setupFiles: ['./tests/setup.ts'],
  css: false,
  // The DB-backed suites (cross-user access, TOCTOU, cron dedupe, token-refresh
  // races) each stand up an in-process PGlite instance and run the real schema
  // against it. On a cold cache that is comfortably over Vitest's 10s default,
  // so the whole suite failed at the `beforeAll` hook on slower machines and in
  // CI — reported as 12 failures that had nothing to do with the code under
  // test. The work itself is bounded; only the setup is slow.
  hookTimeout: 120_000,
  testTimeout: 60_000,
  // Several suites stand up their own in-process PGlite — a full Postgres
  // compiled to WASM, which reserves a large ArrayBuffer per instance. Running
  // many of those in parallel forks exhausts memory and the workers die with
  // `RangeError: Array buffer allocation failed`, which Vitest surfaces as
  // unhandled errors rather than test failures — so a run can look almost green
  // while whole files never execute. Capping concurrency trades a little
  // wall-clock for a suite whose result means something.
  // Several suites stand up their own in-process PGlite — a full Postgres
  // compiled to WASM, which reserves a large ArrayBuffer per instance. Running
  // them in parallel workers exhausts memory: workers die with
  // `RangeError: Array buffer allocation failed` /
  // `Fatal process out of memory: Zone`, which Vitest reports as *unhandled
  // errors* rather than test failures — so a run looks almost green while whole
  // files never execute. That is the worst possible failure mode for a suite
  // whose whole job is to be believed.
  //
  // One worker. It costs ~30s of wall clock and buys a result that means
  // something. (Vitest 4 removed `poolOptions`; concurrency is top-level now,
  // which is why the earlier `poolOptions.forks.maxForks` setting silently did
  // nothing.)
  maxWorkers: 1,
  minWorkers: 1,
};

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias: { ...atAlias } },
        test: {
          ...baseTest,
          name: 'unit',
          include: ['tests/**/*.test.{ts,tsx}'],
          exclude: ['node_modules', '.next', 'dist', ...SERVER_ONLY_TESTS],
        },
      },
      {
        plugins: [react()],
        resolve: { alias: { ...atAlias, 'server-only': serverOnlyStub } },
        test: {
          ...baseTest,
          name: 'mapper-server-only',
          include: SERVER_ONLY_TESTS,
        },
      },
    ],
  },
});
