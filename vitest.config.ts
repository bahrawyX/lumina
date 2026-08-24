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
