# Lumina — Remediation Handoff

Written for a competent engineer / fresh Claude Code session with **zero prior context**. Everything here is checked against the repo, not reconstructed from memory. Verify the moving parts (commit hashes, test count) yourself with `git log` / `npx vitest run` before relying on them.

---

## 1. What this project is

**Lumina** is a Next.js productivity web app — calendar, tasks, planner, focus timer, goals, docs, and a coins/achievements economy — in a single workspace. Stack: **Next.js 16 (App Router) · TypeScript (`strict: false`) · Drizzle ORM + Neon Postgres · BetterAuth (email + Google/Microsoft social) · Zustand · Tailwind + Radix UI · Vitest (+ PGlite for DB tests) · Vercel serverless + cron · Gemini for AI · web-push**. External calendar events (Google/Outlook) are **browser-cache-only** — fetched live via `/api/external-events/*` and held in the client store, never persisted to the DB (this matters — see §8).

The architecture reference is `CODEBASE_REFERENCE_Lumina_Next.md` at the repo root.

## 2. What we've been doing

A **security/quality remediation** driven by a findings document, **`LUMINA_SECURITY_AUDIT.md`** (findings `C1–C2` critical, `H1–H10` high, `M1–M14` medium, plus `TD-1…TD-6` tech-debt discovered during the work). **That audit doc is NOT committed to this repo** — the owner keeps it locally. It is the source of the finding IDs referenced throughout; ask the owner for it. The mapping of what's been closed is in §3 below.

Work is done in **gated batches**: implement one batch, run the full gate, **stop and report, wait for the owner to say "continue."** See §5 for the exact rules.

## 3. Completed batches

All commits are on local `main`. Finding IDs are per `LUMINA_SECURITY_AUDIT.md`.

| Batch / work | Finding IDs closed | Key files | Commit |
|---|---|---|---|
| **Batch 1** — focus reward bound to server wall-clock | C1 | `src/app/api/focus-sessions/route.ts`, `src/utils/streaks/streakUtils.ts` | `2cb1626` |
| **Batch 2** — coin ledger + caps + non-negative invariant | economy infra (backs C2/H1–H4/M1) | `src/db/schema/{coinTransactions,dailyRewardCaps}.ts`, `users.ts` CHECK, **migration `0018_coin_ledger_and_caps.sql`** | `a652098` |
| **Batch 3** — single `awardCoins` write-path + guards + regression tests | C2, H1, H2, H3, H4, M1, M6 | `src/lib/coins/awardCoins.ts`, `src/lib/coins/dedupeKeys.ts`, `tests/coin-exploits.test.ts`, **migration `0019_achievements_unique.sql`** | `cde9d27` |
| Award-UI fixes | (UX regressions from Batch 3) | task toast/confetti driven by server `coinsEarned`; shared goal-completion trophy store, gated on `coinsEarned > 0` | `5399252`, `0d29e8b` |
| **Batch 4** — RRULE guard, Outlook UTC, MONTHLY drift | H5, H7, M · **H8 = FALSE POSITIVE** (see §8) | `src/app/api/events/create-linked/route.ts`, `src/lib/recurrence/rruleEngine.ts`, `src/lib/calendar/providers/microsoft.ts` (`parseGraphUtc`), `src/utils/dateUtils.ts` | `ea42c49` |
| Calendar-sync reliability | (bug fixes, not audit IDs) | connect now deterministically triggers a fetch via single-flight coalescing (`src/lib/calendar/singleFlight.ts`) + reactive `googleConnected`; windowed event store keeps viewed months (`src/lib/calendar/eventWindows.ts`, `src/store/usePlannerStore.ts`); visible sync indicator | `37c4b2b`, `e5e2d14` |
| Sidebar redesign | (cosmetic) | nav active/hover rebuilt on always-mounted opacity crossfades (no `layoutId`, no paint-property animation) — `src/components/Sidebar.tsx` | `b66df0d` |
| **Batch 5** — cross-user data leaks | M2, M14, FK-ownership-on-create (L) | `src/app/api/{planner-items,daily-brief,intelligence,goals,tasks,tasks/[id],docs,focus-sessions,mood-logs}/route.ts`; extracted `src/lib/goals/syncTaskCompletionTargets.ts`; `tests/cross-user-access.test.ts`, `tests/helpers/multiUserTestDb.ts` | `928cb16`, `2c80f8e` |
| **Batch 6** — CSRF | H6 | `src/proxy.ts` (Next-16 proxy, Origin/Referer allowlist over `/api/*`, mutating methods only), `tests/csrf-middleware.test.ts` | `68c377b` |
| **Batch 7** — dialog a11y | (Radix DialogTitle/Description warnings) | `AchievementModal`, `EventModal`, `CustomContextDialog`, `EditRecurrenceDialog` | `f461ab1` |

Notes on a few of these:
- **Batch 5 M2** was a real title leak: `planner-items` POST accepted a foreign `taskId`, and `daily-brief`/`intelligence` joined `plannerItems → tasks` unscoped. Fixed by an ownership check on create + `and(eq(taskId, tasks.id), eq(tasks.userId, userId))` on the join. `daily-brief` never actually surfaced the title (defence-only); **`intelligence` did**, via its local (non-LLM) narrative — that's what the handler test pins.
- **Batch 5 M14**: goal-progress aggregations (`taskAgg`/`sessAgg` in `goals/route.ts`) are now scoped by `userId`, not just `goalId` — this is the layer that neutralises a pre-existing foreign row, independent of the FK guard. A prod pollution-scan query (owner ran it) returned **zero** cross-owner rows.
- **Batch 6** derives "self" from the incoming forwarded host (`x-forwarded-host` / `Host` / `req.nextUrl.host` / `BETTER_AUTH_URL`), so preview and per-deployment `*.vercel.app` URLs and a future custom domain all pass; only genuinely cross-origin requests 403. `/api/auth/*` (BetterAuth's own `trustedOrigins`) and `/api/cron/*` (shared-secret) are exempt.

## 4. Exact current state

- **Next up: Batch 8 (hardening)** — not started. See §7 for the itemized list. **Heads-up: `next.config.mjs` already sets** HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and a (permissive) CSP — so Batch 8 #1 (security headers) is largely already satisfied; verify against the checklist and close it rather than re-adding.
- **Committed vs deployed:** everything in §3 is committed to local `main`. **Deploys are manual: `npx vercel --prod`** from the working tree (Vercel is not git-linked — see §6). The owner pushes to GitHub (`origin`) periodically; at time of writing `main` is **1 commit ahead of `origin`** (Batch 7 unpushed). Do not assume `origin` == prod.
- **Tests:** `npx vitest run` → **382 passing, 33 files** (0 failing, 0 skipped). This is the non-regression baseline; a batch is not done if it drops below it.
- Typecheck (`npx tsc --noEmit`) and `next build` are clean. Two **pre-existing** lint issues exist and are NOT ours: `set-state-in-effect` in `CustomContextDialog.tsx` and `CalendarPage.tsx` (form-reset / nav effects) — confirmed present in HEAD before our edits.

## 5. Standing working rules (verbatim — these are non-negotiable)

1. Work in batches, in the order given. **Stop and report after each. Do not start the next until the owner says "continue."**
2. A batch is not done until the **full suite passes** (382 baseline — no reduction, no `.skip`, no weakened assertions), plus `tsc --noEmit`, **lint on changed files**, and `next build`.
3. **Do not refactor beyond the fix. Every diff line traces to a finding ID.**
4. **Never weaken a test to pass.** If a fix breaks one, either the test asserted buggy behaviour (update it and say so) or the fix is wrong (say so).
5. **Write a regression test per finding that exercises the real failure path.** Unit-testing a helper is not proof the bug is dead.
6. **Verify before fixing.** If a finding doesn't reproduce, or the code is intentional, say so and skip it (H8 was a confidently-reported High that was architecturally backwards). Check what reads something before concluding its absence is a bug.
7. **Ask before changing anything whose original intent is unclear.**
8. **Model every constraint in the TS (Drizzle) schema, not just raw SQL** — an unmodelled constraint gets silently dropped by a future `db:push`.

Database / deploy rules that always apply:
- **The owner runs all DB queries. You never connect** to any database (not even read-only, not even a branch). Hand them SQL; they paste back output.
- **Migrations are hand-authored idempotent SQL** (`IF NOT EXISTS` / `DO $$` / DML backfills) with a commented-out `-- ROLLBACK` section, **shown to the owner, not run** by you.
- **The Drizzle journal is frozen at `0008`.** **NEVER run `drizzle-kit generate` or `db:push`** — `generate` emits a ~15 KB destructive migration that re-creates every table (it diffs against the stale 0008 snapshot); `db:push` would drop hand-authored constraints (e.g. `users_coins_nonneg`). Migrations `0009–0019` are hand-authored and applied out-of-band by the owner (`db:push` for pure DDL, manual SQL console for anything with a backfill). This is logged as **TD-1**.
- Deploys are manual (`npx vercel --prod`). Commit only when asked; group independent changes into separate commits so any one can be reverted alone.

## 6. Environment gotchas

- **Two split identities block git-push deploys (Batch 11):** the Vercel account is `abbahrawy@gmail.com`; the GitHub account is `bahrawyX`. Vercel treats them as separate identities and Hobby has no collaborators, so the GitHub repo isn't linked to the Vercel project — hence every deploy is a manual `npx vercel --prod`. **Do not touch account/billing/domain settings.**
- **PGlite is single-connection.** DB tests (`tests/helpers/*TestDb.ts`) run against in-process PGlite; `Promise.all([...])` "concurrent" calls **execute serialized**, so the Batch-3 exploit tests prove guard *logic* but NOT real row-lock contention. This is **TD-3** (Batch 9 addresses it).
- **PowerShell mangles chained/piped native-command output** on this machine (native stderr gets wrapped as an error record; exit codes come back wrong). **Run tests / build / lint / git through the Bash tool**, not chained PowerShell. Single simple PowerShell commands are fine.
- `server-only`-importing modules throw under Vitest's Node resolver. The vitest config uses a two-project split (`vitest.config.ts`): most tests run with the guard live; the handful that import server modules (`tests/microsoft-timezone.test.ts`, `tests/cross-user-access.test.ts`) run in a project that stubs `server-only`. Add new server-importing test files to that list, don't globally stub.

## 7. Remaining work

### Batch 8 — hardening (NEXT; do in this order, group into separate commits, report before each)
1. **Security headers** — mostly already present (see §4); verify HSTS / `X-Content-Type-Options` / frame headers / `Referrer-Policy` and close.
2. **Rate limiting** — the current limiter (`src/lib/rateLimit.ts`) is in-memory, so it does nothing across serverless invocations. Move to a shared store, and add a limiter to `/api/intelligence` (has none). **DECISION POINT:** propose the store first — the owner is on **Vercel Hobby** and may not want a new dependency/service (Redis / Upstash / Vercel KV). Stop and let them choose before building.
3. **TD-5** — `runFullGoogleSync` fires on every Google connect (`src/lib/integrations/google/oauth.ts:~200`): 90d back / 365d forward, `singleEvents:true`, parallel calendars, no `maxDuration` → connect-time timeout risk. Bound it or set a `maxDuration`; say which and why. **Don't change what it fetches without flagging it.**
4. **OAuth token-refresh race** — concurrent refreshes clobber each other (`src/lib/integrations/*/token.ts`). Single-flight / lock it.
5. **Cron event-reminder double-send** — dedupe-key it (same pattern as the coin ledger).
6. **`create-linked` calendar TOCTOU** — the find-or-create-primary-calendar race returns a 500; make it a proper status.
7. **Unbounded per-calendar `Promise.all`** — bound the concurrency in the sync fan-outs.
8. **Remove the prod-reachable `auth-test` page** (`src/app/auth-test/page.tsx`).
9. **Dependency audit** — run `npm audit`, report, **recommend but do not apply major-version bumps.**
10. **CSP (riskiest — LAST, own commit).** Current policy is self-defeating (`script-src 'unsafe-inline' 'unsafe-eval'`, `connect-src 'self' https:`). **DECISION POINT:** before implementing, **inventory what relies on `unsafe-inline`/`unsafe-eval`** (Next/Turbopack hydration, framer-motion inline styles, any third-party) and tell the owner what a nonce-based policy will break, so they choose full vs incremental.
11. **`strict: false` in tsconfig** — **scope only**: report the error count if `strict` (or `strictNullChecks`) were enabled. **Do not enable it.**

### Batch 9 — close the concurrency-test gaps (TD-3, TD-4)
Stand up a real multi-connection Postgres (Testcontainers `postgres:16` or a disposable Neon branch pool) and re-run the H2 (shop double-spend) / H4 (streak shield) exploit tests with genuinely parallel clients. Add a deadlock test for the `daily_reward_caps → users` lock order (**TD-4**, currently convention-only, documented in `awardCoins.ts`). If Testcontainers isn't viable here, say so and propose the alternative.

### Batch 10 — server-anchored focus sessions (the last economy hole)
`startTime`/`endTime` are still client-supplied, so a fabricated 8-hour session passes the tamper check and the 75% gate; `MAX_DAILY_FOCUS_MINUTES = 720` only *caps* farming. Split the single POST into two server-stamped phases: `POST /api/focus-sessions/start` (server writes `startedAt = now()`, returns an opaque id, no coins) and `POST /api/focus-sessions/{id}/complete` (server sets `endedAt = now()`, computes elapsed server-side; client `duration` demotes to a hint for the 75% gate). Design for abandoned sessions (clamp + expiry/GC), device sleep/offline, in-flight sessions during deploy. **Needs client changes (Pomodoro + free timer). Present the design + client blast radius before implementing.** Keep the daily cap regardless.

### Batch 11 — deploy pipeline
Propose options to unblock git-push deploys (link GitHub as a Vercel login, consolidate the two Vercel accounts, or migrate the project to the GitHub-linked account with its env vars/domains). **Propose only — do not execute anything touching account/billing/domains.**

### Open TD / loose ends
- **TD-5** — OAuth-connect heavy fetch timeout (folded into Batch 8 #3 above).
- **TD-6** — CSRF double-submit token as optional hardening on top of the Batch-6 Origin allowlist (deferred; ~28 mutating call sites of client plumbing for marginal gain).
- **Icon-button a11y sweep** — Batch 7 covered dialogs/sheets/images; a full `aria-label` audit of icon-only buttons was not done.
- **`GoalDetailSheet.tsx`** — has a `SheetTitle` but no `SheetDescription` (same Radix warning class as the Batch-7 dialogs); left untouched pending owner's decision.

## 8. Explicitly OUT OF SCOPE — do not "fix" these

- **IDOR object-scoping** — every `[id]`-addressed route is already doubly scoped by `id` **and** `userId`; the audit confirmed this is correct. Don't "improve" it.
- **Docs-search escaping** — verified safe (server-side escape then re-insert `<mark>`).
- **`beforeinstallprompt` handler** (`src/components/pwa/InstallPrompt.tsx`) — working as designed (custom deferred install).
- **`daily_reward_caps.bucket_date` stays UTC** — deliberate anti-abuse choice (a per-user-tz bucket would let a user farm the daily cap by shifting timezone). Do not "localise" it.
- **The external-events sync stubs** (`src/lib/integrations/{google,microsoft}/events.ts` — `sync*CalendarEvents`) are an **intentional no-op**. **H8 was a FALSE POSITIVE.** External events are browser-cache-only by design: `GET /api/events` returns only `provider='local'` rows, `cleanup-external-events` purges provider rows, and the calendar reads live via `/api/external-events/*`. Do NOT add a DB write there — nothing reads it and it re-consumes the Neon row quota the cleanup route exists to reclaim. In-file comments explain this.

---

*Generated at the end of a working session, immediately after Batch 7. First actions for the next session: read `LUMINA_SECURITY_AUDIT.md` (ask the owner — not in the repo), confirm `npx vitest run` still shows 382, then start Batch 8 #1 by verifying the already-present security headers.*
