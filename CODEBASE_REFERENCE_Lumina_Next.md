# LUMINA — COMPLETE CODEBASE REFERENCE

> **For engineers and LLM consumption.**
> Paste this file at the start of any new Claude session.
> Last updated: 2026-05-03 (v30 — Nine improvements across Goals, Focus, AI, and auth. **Goals**: (1) `GoalsPage` header gains `<CoinsBadge variant="chip" />` so balance is always visible when completing goals; `handleComplete` now calls `goalCompleteAwards(goal.timeframe).reduce(...)` for timeframe-correct coin amount instead of hardcoded 100; (2) `GoalDetailSheet.handleMarkComplete` now also calls `showCoinToast` with the timeframe-correct amount — was previously silent; (3) `GoalCard` inline target editing: each target gets interactive controls (boolean toggle pill, number ±1 step + click-to-slider, percentage click-to-slider, task_completion read-only) rendered inside a `stopPropagation` wrapper so editing does not open the detail sheet. **Focus**: (4) `useFocusStore` gains `applyFocusResult` helper that chains streak + coin store updates from the server `FocusSessionResult`; both `finishSession` and `cancelSession` chain `.then(applyFocusResult)`; (5) `focusPersistence.createOne` now returns `Promise<FocusSessionResult | null>` instead of `Promise<void>`. **AI/Intelligence**: (6) `IntelligenceRecommendationCard` gains `humanize()` function that replaces raw UUIDs in recommendation explanations with quoted task titles and ISO timestamps with readable local times; (7) `parse-event/route.ts` Gemini catch block now maps `err.status === 429` to HTTP 429 instead of 422. **Auth/Profile**: (8) `PersistenceBootstrap` gains a `useEffect` on `session?.user?.id` that calls `useCalendarStore.getState().updateProfile({ name, email })` so the sidebar footer and Profile page show the real DB name instead of the hardcoded "Alexander Sterling" default; (9) `Profile.tsx` Recent Sessions section now reads from `useFocusStore.sessionHistory` instead of a stale localStorage snapshot.)

---

## HOW TO USE THIS FILE

This is the single source of truth for the Lumina codebase. It covers:
- Project purpose and tech stack
- Every directory and file with a brief description
- All Zustand stores with their full state shape
- All API route contracts (request/response)
- Full database schema
- Component architecture hierarchy
- Every recent feature added and the files it lives in
- Known gaps and the backlog of features pending implementation

---

## 1. PROJECT OVERVIEW

**Lumina** is a Next.js productivity and calendar management app. Core concept: give knowledge workers one place to manage their calendar, tasks, daily plan, and focus sessions — augmented by an AI intelligence engine that analyses their schedule and recommends optimal focus windows.

### Key feature areas

| Area | Route | Description |
|---|---|---|
| Calendar | `/` | Month/week/day views with drag-drop event management |
| Tasks | `/tasks` | Kanban board (todo → doing → done → archived) |
| Daily Plan | `/plan` | Schedule tasks into the day with drag-drop time slots |
| Focus | `/focus` | Pomodoro-style timer with session tracking |
| Performance | `/performance` | GitHub-style contribution heatmap and focus stats |
| Insights | `/intelligence` | Schedule analysis and recommendations (formerly "Intelligence") |
| Onboarding | `/onboarding` | Multi-step onboarding flow with auth |

---

## 2. TECH STACK

### Core framework
- **Next.js 16 (App Router)** — React 19 meta-framework
- **TypeScript 5** — strict throughout

### State management
- **Zustand 5** with `persist` middleware — all major UI state lives here

### UI / styling
- **Tailwind CSS 3.4** — utility-first, design tokens in `globals.css`
- **Radix UI** — headless primitives (Dialog, Dropdown, Tabs, Select, etc.)
- **Framer Motion 12** — animations and `AnimatePresence`
- **shadcn/ui** conventions — components in `src/components/ui/`
- **class-variance-authority + clsx + tailwind-merge** — class composition

### Typography (Focused Craft aesthetic)
- **Geist Sans + Geist Mono** via `geist` npm package — body text and numerals. Wired in `src/app/layout.tsx` through `GeistSans.variable` + `GeistMono.variable` applied to `<html>`. CSS variables `--font-geist-sans`, `--font-geist-mono` read by Tailwind `font-sans` / `font-mono`.
- **Clash Display** + **Clash Grotesk** — self-hosted variable fonts under `public/ClashDisplay_Complete/` and `public/ClashGrotesk_Complete/`, declared as `@font-face` in `globals.css`, exposed as Tailwind `font-display` and `font-logo`. Reserved for hero titles, large numerals, and the Lumina wordmark. Weight range 200–700, `font-display: swap`.
- **No Inter, Roboto, or Space Grotesk** — enforced by `tests/design-system.test.ts`.

### Drag & drop
- **@dnd-kit/core + @dnd-kit/sortable** — both planner and task board

### Date/time
- **date-fns 4** — all date manipulation

### Animation
- **Framer Motion** — page transitions, animated drawers, tutorial spotlight

### Forms & validation
- **Zod 4** — all form validation (see `src/lib/validation.ts`)

### Notifications
- **sonner** — branded toast notifications

### Build analysis
- **@next/bundle-analyzer** — behind `ANALYZE=true` env var, wired in `next.config.mjs` via `withBundleAnalyzer`. Script: `npm run analyze`

### Auth
- **better-auth 1.5** — sessions, email/password, Google OAuth, Microsoft OAuth

### Database
- **Drizzle ORM 0.45** with **Neon Postgres** (`@neondatabase/serverless`)

### AI
- **Google Gemini** (`@google/genai`) — intelligence engine summaries

### Theme
- **next-themes** — dark/light mode

### Package management
- **`.npmrc`** — `legacy-peer-deps=true` for Vercel deploy. Required because `@blocknote/shadcn@0.47.3` declares peer dep `tailwindcss@^4.1.12` but project uses v3.4.19. Pre-compiled CSS works fine — only the peer declaration is overly strict.

### Testing
- **Vitest 4** — test runner, configured at `vitest.config.ts` (jsdom environment, `@` alias, setup at `tests/setup.ts`).
- **@testing-library/react + @testing-library/jest-dom + @testing-library/user-event** — render + assertions + simulated user events.
- **jsdom** — DOM implementation for node.
- `tests/setup.ts` stubs `matchMedia`, `ResizeObserver`, and `scrollTo` for Radix components and auto-cleans mounted trees between tests.
- Scripts: `npm test` (run once, CI mode), `npm run test:watch`, `npm run test:ui`.
- Current suite: **102 tests across 9 files** — `design-system`, `button`, `editorial-headers`, `goal-progress`, `shop-config`, `useCoinsStore`, `shop-item-icon`, `no-hardcoded-colors`, `seo`. See Section 28.

---

## 3. DIRECTORY MAP

```
src/
├── app/
│   ├── (app)/                      ← Authenticated app route group
│   │   ├── layout.tsx              ← Wraps all app pages in <AppShell>
│   │   ├── AppShell.tsx            ← Main shell: sidebar, mobile nav, GuestBanner, beforeunload handler, global keyboard shortcuts (contenteditable-aware)
│   │   ├── page.tsx                ← Calendar view
│   │   ├── tasks/page.tsx          ← Task board
│   │   ├── plan/page.tsx           ← Daily planner
│   │   ├── focus/page.tsx          ← Focus session view
│   │   ├── focus/done/page.tsx     ← Focus history
│   │   ├── performance/page.tsx    ← Contribution heatmap + stats
│   │   └── intelligence/page.tsx  ← Intelligence/profile page
│   ├── auth/
│   │   ├── signin/page.tsx         ← Standalone sign-in/sign-up page (guest→account conversion)
│   │   └── popup-complete/page.tsx ← OAuth popup bridge (posts lumina:oauth-complete to opener)
│   ├── onboarding/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── api/
│   │   ├── auth/[...all]/route.ts  ← BetterAuth catch-all handler
│   │   ├── events/
│   │   │   ├── route.ts            ← GET (list) / POST (create, supports recurrence + createdViaNL)
│   │   │   ├── [id]/route.ts       ← GET / PATCH / DELETE (editScope for recurring)
│   │   │   └── expand/route.ts     ← GET: expand recurring events into virtual instances
│   │   ├── tasks/
│   │   │   ├── route.ts            ← GET / POST
│   │   │   └── [id]/route.ts       ← PATCH / DELETE
│   │   ├── focus-sessions/
│   │   │   ├── route.ts            ← GET / POST
│   │   │   └── [id]/route.ts       ← DELETE
│   │   ├── integrations/
│   │   │   ├── status/route.ts                    ← GET: { google, microsoft }.connected
│   │   │   ├── google/connect/route.ts            ← Initiates Google Calendar OAuth popup
│   │   │   ├── google/callback/route.ts           ← Stores Google tokens in integrations table
│   │   │   ├── google/events/sync/route.ts        ← Syncs Google events into DB
│   │   │   ├── google/calendars/route.ts          ← Lists/imports Google calendars
│   │   │   ├── microsoft/connect/route.ts         ← Initiates Microsoft Calendar OAuth popup
│   │   │   ├── microsoft/callback/route.ts        ← Stores Microsoft tokens in integrations table
│   │   │   ├── [provider]/disconnect/route.ts     ← Revokes integration
│   │   │   └── [provider]/calendars/route.ts      ← Lists provider calendars
│   │   ├── sync/
│   │   │   ├── all/route.ts        ← Syncs all providers
│   │   │   ├── google/route.ts     ← Runs full Google Calendar sync
│   │   │   └── outlook/route.ts   ← Session-bound Microsoft Graph sync
│   │   ├── external-events/
│   │   │   ├── all/route.ts
│   │   │   └── [provider]/route.ts
│   │   ├── daily-brief/route.ts       ← GET: Smart Daily Brief (parallel data fetch + Gemini narrative + cache)
│   │   ├── intelligence/
│   │   │   ├── route.ts              ← GET: AI schedule analysis (includes recurring instances)
│   │   │   └── parse-event/route.ts  ← POST: Gemini NL→structured event parser (server-side only)
│   │   ├── link/route.ts             ← POST/DELETE: atomic bidirectional task↔event link/unlink
│   │   ├── users/
│   │   │   ├── preferences/route.ts
│   │   │   └── notification-preferences/route.ts ← GET/PATCH notification prefs + timezone sync
│   │   ├── push/
│   │   │   ├── subscribe/route.ts     ← POST (upsert) / DELETE (remove by endpoint)
│   │   │   └── send/route.ts          ← POST: self-only push (authenticated user sends to themselves)
│   │   ├── cron/
│   │   │   ├── daily-brief/route.ts   ← Vercel cron: 8 AM local-time daily brief
│   │   │   ├── event-reminders/route.ts ← Vercel cron: 10-min event reminder
│   │   │   └── streak-reminder/route.ts ← Vercel cron: 8 PM local-time streak risk
│   │   └── maintenance/cleanup-external-events/route.ts
│   ├── globals.css
│   ├── layout.tsx                  ← Root layout: AuthProvider, ThemeProvider, metadata. og:image + twitter:image both point to /og.png (public/)
│   ├── opengraph-image.tsx         ← DELETED (v25). Static /og.png used instead.
│   ├── twitter-image.tsx           ← DELETED (v25). Static /og.png used instead.
│   └── providers.tsx
│
├── components/
│   ├── landing/
│   │   ├── LandingPage.tsx          ← Top-level landing page shell; mounts CustomCursor + SmoothScroll (Lenis)
│   │   ├── LandingPageWrapper.tsx   ← Auth-aware wrapper; ?preview=1 query param bypasses redirect for signed-in users
│   │   ├── HeroSection.tsx          ← Hero with Lottie animation, CursorZone, useLottieHover
│   │   ├── FeatureShowcase.tsx      ← Six feature cards: icon + title + description (no mockup images)
│   │   ├── CustomCursor.tsx         ← Landing-page-only custom cursor; reads CSS --primary; zone-aware via data-cursor-label/color
│   │   ├── CursorZone.tsx           ← Wraps children with data-cursor-* attributes for cursor customisation
│   │   └── [other landing sections] ← CTASection, FAQSection, FooterSection, PricingSection, etc.
│   ├── auth/
│   │   ├── GuestBanner.tsx         ← Amber dismissible banner shown at top of AppShell in guest mode
│   │   └── GuestUpgradeModal.tsx   ← Dialog shown when guest attempts gated feature
│   ├── calendar/
│   │   ├── interaction/            ← Conflict detection hooks + dialogs
│   │   └── virtualization/        ← Virtual scrolling and density management
│   ├── ambient/
│   │   ├── AmbientSoundDrawer.tsx ← Bottom sheet with Web Audio noise tracks + volume slider
│   │   └── FloatingAmbientPlayer.tsx ← Animated waveform circle, click to stop
│   ├── contact/
│   │   └── ContactDrawer.tsx      ← Right-side drawer with validation, rate-limited POST
│   ├── settings/
│   │   └── NotificationSettings.tsx ← Sheet: permission banner, 5 toggle rows, device info
│   ├── pwa/
│   │   ├── InstallPrompt.tsx      ← Floating card after 3+ visits, beforeinstallprompt / iOS guide
│   │   └── OfflineIndicator.tsx   ← Amber slide-down bar (AnimatePresence) on offline
│   ├── focus/
│   │   ├── FocusSessionView.tsx   ← Main focus container (interrupt/resume logic)
│   │   ├── FocusTimer.tsx         ← Timer display and controls
│   │   ├── FocusHeader.tsx
│   │   ├── FocusProgress.tsx
│   │   ├── PomodoroView.tsx       ← Full Pomodoro cycle: SVG ring, work/break, chime, auto-persist
│   │   ├── PomodoroFeedbackModal.tsx ← Post-session mood selection (5 emojis, forced choice)
│   │   ├── MoodAnalysisCard.tsx   ← 3-day mood trend card, shown above Pomodoro timer
│   │   └── StopwatchView.tsx     ← HH:MM:SS.cs, requestAnimationFrame, up to 20 laps
│   ├── intelligence/
│   │   ├── DailyBriefCard.tsx         ← Smart daily brief: narrative + stats with Lottie icons
│   │   └── ParsedEventConfirmCard.tsx ← NL parse confirmation with confidence border + ambiguity warnings
│   ├── icons/                     ← All SVG icon components + barrel index.ts
│   ├── pages/
│   │   ├── CalendarPage.tsx        ← data-tutorial="cal-view-tabs" on TabsList
│   │   ├── TasksPage.tsx
│   │   ├── DailyPlanPage.tsx
│   │   ├── FocusPage.tsx
│   │   ├── PerformancePage.tsx
│   │   └── IntelligencePage.tsx
│   ├── performance/
│   │   └── contributions/         ← ContributionGrid, Cell, Heatmap, Legend, Tooltip, YearSelector
│   ├── planner/
│   │   ├── DailyPlanView.tsx       ← data-tutorial="plan-pool" on task pool container; viewDate state, date navigation, mobile tab switcher (Pool / Timeline)
│   │   ├── DailyPlanHeader.tsx     ← prev/next day nav arrows, Today chip, eyebrow "PLAN · TODAY" vs "PLAN · MMM D"
│   │   ├── TodayTimeline.tsx       ← accepts optional viewDate prop
│   │   ├── PlannedTaskCard.tsx
│   │   ├── TaskPoolCard.tsx
│   │   ├── FreeTimePanel.tsx
│   │   ├── IntelligencePanel.tsx   ← All dark/zinc tokens replaced with semantic bg-card/border-border
│   │   ├── IntelligenceRecommendationCard.tsx
│   │   ├── PlanningModal.tsx
│   │   └── RollOverButton.tsx      ← labelled "Push to Tomorrow"; hidden when not viewing today
│   ├── tasks/
│   │   ├── TaskBoard.tsx           ← data-tutorial="task-board-header" on board header
│   │   ├── TaskColumn.tsx
│   │   ├── TaskCard.tsx            ← search highlight in title
│   │   ├── TaskDialog.tsx          ← LinkedGoalsSection + DialogSubtaskSection
│   │   ├── TaskListView.tsx        ← table view: sortable cols, group by, status popover
│   │   ├── TaskFilterBar.tsx       ← search + priority/difficulty/duedate filters + mobile sheet
│   │   ├── TaskCompletionPrompt.tsx
│   │   └── TaskScheduleDialog.tsx
│   ├── goals/
│   │   ├── GoalDialog.tsx          ← create/edit goal (emoji, color, timeframe, targets)
│   │   └── GoalDetailSheet.tsx     ← right-side sheet with progress ring + targets
│   ├── dashboard/
│   │   ├── GoalsWidget.tsx         ← top 3 active goals
│   │   ├── CoinsWidget.tsx         ← balance + 3 recent transactions
│   │   └── TodaySummaryWidget.tsx  ← 2x2 stat grid (due/done/focus/streak)
│   ├── tutorial/
│   │   └── TutorialOverlay.tsx    ← Full tutorial system (see §10)
│   ├── ui/
│   │   ├── CompactEmojiPicker.tsx ← Themed: bg-popover/95 border-border/60 (no dark bg-zinc-950)
│   │   ├── MobileBottomSheet.tsx  ← Themed: bg-card/95 border-border (no dark bg-[#0a0a0a]/90)
│   │   ├── Toaster.tsx
│   │   ├── MobileBottomSheet.tsx
│   │   └── [shadcn primitives]    ← avatar, badge, button, calendar, dialog, dropdown-menu,
│   │                                 input, label, popover, scroll-area, select, separator,
│   │                                 sheet, sidebar, skeleton, tabs, textarea, tooltip
│   ├── AuthProvider.tsx
│   ├── DayView.tsx / WeekView.tsx / MonthView.tsx
│   ├── DayCalendarTimeline.tsx
│   ├── EventModal.tsx
│   ├── GoogleCalendarSync.tsx
│   ├── OnboardingFlow.tsx          ← Full multi-step flow with guest auth path (see §9)
│   ├── PersistenceBootstrap.tsx    ← Fetches events/tasks/focus in parallel on mount
│   ├── Profile.tsx
│   ├── Sidebar.tsx
│   ├── TimerCallout.tsx
│   └── theme-provider.tsx / theme-toggle.tsx
│
├── store/                          ← All Zustand stores (see §6)
├── hooks/                          ← Custom React hooks (see §7)
├── lib/
│   ├── auth.ts                     ← BetterAuth server config
│   ├── auth-client.ts              ← BetterAuth client instance
│   ├── authGuard.ts                ← Session validation middleware
│   ├── db.ts                       ← Drizzle + Neon client
│   ├── focusSettings.ts            ← Focus duration utilities
│   ├── persistence/                ← Thin API wrappers: events/tasks/focus/planner
│   ├── validation.ts               ← Zod schemas: nameSchema, emailSchema, passwordCreateSchema, passwordSchema, titleSchema, getFieldError()
│   ├── utils.ts                    ← cn() and common utils
│   ├── cronAuth.ts                 ← verifyCronSecret() — timing-safe Bearer token check for Vercel cron (v26: fail-closed, crypto.timingSafeEqual)
│   ├── rateLimit.ts               ← createRateLimiter() / rateLimitedResponse() — sliding-window in-memory rate limiter (v26: NEW)
│   ├── push/
│   │   └── sendPushNotification.ts ← VAPID setup + sendPushToUser() (server-only)
│   ├── intelligence/               ← AI engine: engine, types, recommendations, scoring, llmSummary
│   ├── integrations/
│   │   ├── google/                 ← OAuth, token refresh, calendar/event CRUD, sync
│   │   └── microsoft/              ← OAuth, token refresh, calendar/event CRUD, sync
│   └── calendar/                   ← Normalize, local CRUD, providers
├── db/
│   └── schema/                     ← users, accounts, sessions, verifications, events,
│                                     tasks, calendars, integrations, focusSessions, plannerItems,
│                                     pushSubscriptions
├── types/
│   ├── types.ts                    ← CalendarEvent, Task, FocusSession, ViewType, EventCategory, IntelligenceProfile
│   ├── task.ts
│   └── performance.ts
├── utils/
│   ├── dateUtils.ts
│   ├── time/timeUtils.ts
│   ├── dailyPlanUtils.ts
│   ├── taskBoard.ts
│   ├── notify.ts
│   ├── scheduling/                 ← scheduleTask, autoScheduleTasks, autoPlanDay, findFreeTime, timelineMerge
│   ├── performance/                ← buildContributionCalendar, computeContributionScoreForDay, getContributionLevel
│   └── calendar/getVisibleEvents.ts
├── services/
│   ├── geminiService.ts            ← Google Gemini AI
│   └── outlookSyncService.ts
├── engine/
│   ├── dragEngine.ts
│   ├── overlapEngine.ts
│   └── slotEngine.ts
└── constants.tsx                   ← Event categories, colors, constants

tests/
├── setup.ts                        ← Vitest setup: jest-dom, cleanup, matchMedia/ResizeObserver stubs
├── *.test.ts / *.test.tsx          ← Vitest unit + component tests (9 files, 102 tests — see §28)
└── e2e/                            ← Playwright E2E layer (v26, see §33)
    ├── fixtures/
    │   ├── guest.ts                ← Pre-seeds `lumina-onboarding` / `lumina-guest` / `lumina-tutorial`
    │   │                             localStorage entries via `context.addInitScript` so first render
    │   │                             is a completed-onboarding guest with tutorial fully suppressed.
    │   └── helpers.ts              ← `collectConsole()` + `appErrors()` (filters 3rd-party noise),
    │                                 `waitForAppReady()` (waits for hydration overlay to unmount)
    ├── calendar.spec.ts            ← Calendar page smoke (view tabs, no console errors)
    ├── tasks.spec.ts               ← Task board smoke
    ├── plan.spec.ts                ← Daily planner smoke
    ├── pomodoro.spec.ts            ← Pomodoro timer smoke
    ├── focus.spec.ts               ← Focus session view smoke
    ├── goals.spec.ts               ← Goals page smoke
    ├── performance.spec.ts         ← Performance / contribution heatmap smoke
    ├── shop.spec.ts                ← Shop page smoke
    ├── intelligence.spec.ts        ← Intelligence page smoke
    ├── docs.spec.ts                ← Docs home + invalid-doc-id redirect
    ├── navigation.spec.ts          ← Cross-route navigation + SPA-routing (no full reloads)
    └── visual/screenshots.spec.ts  ← Captures full-page PNGs for every route (out: playwright-screenshots/*.png, gitignored)

playwright.config.ts                ← Two projects (chromium-desktop, chromium-mobile); auto-spins
                                      `npm run dev` on http://localhost:3000; traces on first retry;
                                      dotenv loads `.env.local` for the runner.
```

---

## 4. DESIGN TOKENS & THEMING

All components must use **semantic CSS tokens only**. Never use hardcoded dark colors.

### Required tokens (Tailwind classes)

| Token | Use |
|---|---|
| `bg-background` | Page/card backdrop |
| `bg-card` | Card surfaces |
| `bg-popover` | Floating popovers, pickers |
| `bg-muted` | Subtle backgrounds |
| `text-foreground` | Primary text |
| `text-muted-foreground` | Secondary/subdued text |
| `border-border` | All borders |
| `text-primary` / `bg-primary` | Brand color |
| `text-destructive` | Error state |
| `bg-destructive/focus-visible:ring-destructive/20` | Error input |

### Banned patterns (break light mode on mobile)

```
bg-black/60         → bg-background/90
bg-[#0a0a0a]/90     → bg-card/95
text-white/*        → text-foreground or text-muted-foreground
border-white/*      → border-border
bg-zinc-950/*       → bg-popover
text-zinc-400       → text-muted-foreground
bg-white/[0.0x]     → bg-muted/[x]
```

### Components fixed for theme consistency

- `AppShell.tsx` — mobile nav uses `bg-background/90 border-border text-muted-foreground`
- `MobileBottomSheet.tsx` — `bg-card/95 border-border`; handle `bg-muted-foreground/25`
- `IntelligencePanel.tsx` — fully rewritten with semantic tokens
- `CompactEmojiPicker.tsx` — `bg-popover/95 border-border/60`

### Focus outlines (v23)
All elements have `outline: none; box-shadow: none` on both `:focus` and `:focus-visible` in `globals.css`. This is a deliberate design choice — Lumina uses its own focus indicators (primary rail, motion wash) rather than browser defaults.

### Scoped theme transitions (v23)
The global `* { transition: background-color 400ms ... }` rule was causing 400ms lag on every route change because it applied to every element on mount. Now scoped to `html.transitioning-theme *` so the transition only fires during actual theme switches. Root cause of route-change lag.

### Warm paper palette (Focused Craft v22)

The light palette migrated from generic neutral grey to a warm "paper/ink" metaphor:

| Token (light) | HSL | Role |
|---|---|---|
| `--background` | `36 28% 97%` | Warm paper |
| `--foreground` | `222 30% 12%` | Warm ink |
| `--card` | `40 30% 99%` | Softer than pure white |
| `--muted-foreground` | `222 12% 42%` | Warmer grey |
| `--border` | `30 15% 84%` | Warm-tinted border |
| `--primary` | `249 66% 61%` | Brand purple preserved |

Dark palette stays warm too: `--background: 240 8% 8%` with `--foreground: 36 20% 96%` warm off-white ink.

### Shadow tiers (tailwind.config.js)

| Token | Use |
|---|---|
| `shadow-card` | Rest state on every card surface |
| `shadow-card-hover` | Mid-tier (not currently used, reserved) |
| `shadow-card-lift` | Elevated hover — used via the `.card-lift` utility |
| `shadow-soft / elevated / layered` | Legacy tiers (still in tailwind config, used sparingly) |

### Signature motion: `.card-lift` utility (globals.css)

Shared hover treatment applied across every card surface (GoalCard, ShopItemCard, TaskCard non-drag state, CoinsWidget, GoalsWidget, TodaySummaryWidget, auth card):

- Rest: `shadow-card` (1px ambient shadow in warm ink color `rgba(17,17,28,...)` instead of pure black)
- Hover: `translateY(-1px)` + `shadow-card-hover` + border warms to `hsl(var(--foreground) / 0.14)`
- Focus-visible: same lift so keyboard users get the same depth cue
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (also exposed as Tailwind `ease-signature`)
- `prefers-reduced-motion`: falls back to instant shadow-only transition

### Editorial page-header rhythm

Every workspace page uses the same 3-layer header treatment:

```tsx
<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-1.5">
  Workspace · [Section]
</p>
<h1 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em] leading-none">
  [Title]
</h1>
<p className="text-[11px] md:text-xs text-muted-foreground/80 mt-2 italic">
  [Supporting line]
</p>
```

Eyebrow labels by page: `Workspace · Board / List` (Tasks), `Workspace · Objectives` (Goals), `Workspace · Exchange` (Shop), `Workspace · Analytics` (Performance), `Workspace · Library` (Docs home), `Workspace · Account` (Insights), `Plan · Today` (Planner), `Begin / Return` (auth signin). Guarded by `tests/editorial-headers.test.ts`.

### Grain overlay

`body::before` pseudo-element lays a tiny SVG `feTurbulence` noise as a data-URI fixed-position overlay. `opacity: 0.035` in light mode with `mix-blend-mode: multiply`, `opacity: 0.045` in dark with `mix-blend-mode: screen`. Adds paper-like atmospheric depth without any HTTP request.

### Button variants (src/components/ui/button.tsx)

Unified 200ms `ease-signature` transition across background / border / color / transform / shadow. All buttons scale to `0.98` on `:active`. The `outline` variant warms its border to `hsl(foreground / 20%)` on hover. Guarded by `tests/button.test.tsx`.

---

## 5. DATABASE SCHEMA

### Auth tables (managed by BetterAuth)

#### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto gen |
| email | varchar(255) unique | required |
| name | text | nullable |
| email_verified | boolean | default false |
| image | text | nullable |
| avatar | text | nullable |
| created_at / updated_at | timestamptz | |

#### `accounts`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| account_id | text | provider's account id |
| provider_id | text | |
| user_id | uuid FK→users | cascade delete |
| access_token / refresh_token / id_token | text | nullable |
| password | text | nullable (email auth) |
| created_at / updated_at | timestamptz | |

Unique: `(provider_id, account_id)`

#### `sessions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| token | text unique | |
| user_id | uuid FK→users | cascade delete |
| expires_at | timestamptz | |
| ip_address / user_agent | text | nullable |

#### `verifications`
- identifier, value, expires_at

---

### Domain tables

#### `calendars`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | |
| provider | enum: `google\|microsoft\|local` | |
| external_id | varchar(255) | nullable |
| name | varchar(255) | |
| color | varchar(32) | default '#6D59E0' |
| is_primary | boolean | default false |

#### `events`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | |
| calendar_id | uuid FK→calendars | |
| title | varchar(512) | |
| description | text | nullable |
| start_time / end_time | timestamptz | check: end > start |
| is_all_day | boolean | |
| location | varchar(512) | nullable |
| source | enum: `manual\|google\|microsoft\|scheduler` | |
| external_id | varchar(255) | nullable (provider event id) |
| last_synced_at | timestamptz | nullable |
| is_task_generated | boolean | default false |

**Note:** `category`, `color`, `completed`, `linked_task_id`, recurrence are NOT in DB yet — silently dropped at API boundary.

#### `tasks`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | |
| title | varchar(512) | |
| description | text | nullable |
| status | enum: `todo\|in_progress\|done` | default todo |
| priority | enum: `low\|medium\|high` | default medium |
| estimated_minutes | integer | default 30, must be > 0 |
| due_date | timestamptz | nullable |
| scheduled_start | varchar(5) | HH:mm or null |
| scheduled_end | varchar(5) | HH:mm or null |
| remaining_focus_time | integer | seconds for resume, nullable |

**Status vocabulary gap:** DB uses `in_progress`, UI uses `doing`. API maps both ways, emitting both `status` (UI) and `dbStatus` (canonical) in responses.

#### `focus_sessions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | |
| task_id | uuid FK→tasks | nullable, on delete set null |
| start_time / end_time | timestamptz | |
| duration_minutes | integer | must be > 0 |
| coins_earned | integer | default 0, 1 coin per minute |
| created_at | timestamptz | |

#### `planner_items`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id / task_id | uuid FK | |
| start_time / end_time | timestamptz | check: end > start |
| is_auto_scheduled | boolean | |

**Status:** Schema exists but API is intentionally deferred. Planner is localStorage-only at runtime.

#### `integrations`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | |
| provider | enum: `google\|microsoft` | |
| access_token | text | |
| refresh_token | text | |
| expires_at | timestamptz | |
| scope | text | nullable |

Unique: `(user_id, provider)` — one integration row per provider per user.

**Security rule:** `refreshToken` is NEVER sent to the client. Tokens are loaded server-side by `session.user.id` only.

#### `achievements`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | cascade delete |
| type | varchar(64) | e.g. 'session_milestone_5', 'daily_streak_7' |
| unlocked_at | timestamptz | default now() |
| seen | boolean | default false — for notification badge |

#### `mood_logs`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | cascade delete |
| focus_session_id | uuid FK→focus_sessions | nullable, set null on delete |
| mood | varchar(16) | 'great'\|'good'\|'okay'\|'tired'\|'bad' |
| note | text | nullable, max 140 chars |
| logged_at | timestamptz | default now() |

#### `contact_submissions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | nullable, set null on delete |
| type | varchar(32) | 'suggestion'\|'technical'\|'feedback' |
| subject | varchar(100) | |
| message | text | |
| email | varchar(255) | nullable |
| submitted_at | timestamptz | default now() |

#### Streak/gamification columns on `users` (added)
| Column | Type | Notes |
|---|---|---|
| coins | integer | default 0, 1 coin per focus minute |
| daily_streak | integer | default 0, consecutive days with focus session |
| best_daily_streak | integer | default 0 |
| session_streak | integer | default 0, consecutive sessions within 4h gap |
| best_session_streak | integer | default 0 |
| last_focus_date | date | YYYY-MM-DD, nullable |
| last_session_at | timestamptz | nullable |
| timezone | text | default 'UTC', IANA timezone string (synced from client on notification init) |
| notification_preferences | jsonb | default `{dailyBrief:true, eventReminders:true, streakReminder:true, taskReminders:true, focusComplete:false}` |

#### `push_subscriptions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto gen |
| user_id | uuid FK→users | cascade delete |
| endpoint | text | push endpoint URL |
| p256dh | text | ECDH public key |
| auth | text | auth secret |
| user_agent | text | nullable |
| last_used_at | timestamptz | nullable |
| created_at | timestamptz | |

Unique: `(user_id, endpoint)`. Index on `user_id`.

#### `events` — additions for reminders
| Column | Type | Notes |
|---|---|---|
| reminder_sent_at | timestamptz | nullable, set by event-reminders cron |

---

## 6. ZUSTAND STORES

All stores in `src/store/`. Stores with `persist` write to `localStorage`.

### `useCalendarStore`
- View state: `view` (month/week/day), `currentDate`, `tab`, `searchQuery`
- User profile: `profile { name, role, timezone, workStart, workEnd }`
- Calendar state: `isFocusMode`, `isModalOpen`, selected event
- Actions: `setView`, `setCurrentDate`, `openModal`, `calculateIntelligence`, `updateProfile`, `setTab`, `setFocusMode`

### `useCalendarEventsStore`
- `events: CalendarEvent[]` — all calendar events
- `dbHydrated: boolean`
- CRUD: `addEvent`, `updateEvent`, `deleteEvent`, `hydrateFromDB`
- Undo/redo: `undo`, `redo`

### `useTaskBoardStore`
- `tasks: Task[]` (flat array — subtasks included, distinguished by `parentTaskId`/`depth`), `dbHydrated: boolean`
- CRUD: `addTask` (accepts optional `parentTaskId`, `depth`), `addSubtask(parentId, {title, ...})`, `updateTask`, `deleteTask` (cascade-removes all descendants from local state), `duplicateTask(id)` (optimistic copy at top of todo column, POST /api/tasks/[id]/duplicate, rollback + sonner error on failure)
- Duplicate flash: `recentlyDuplicatedId: string | null` + `clearRecentlyDuplicated()` — TaskCard / TaskListRow apply `bg-primary/10` for ~600ms when their id matches
- Selectors: `selectTasksByStatus`, `selectAllTasks`, `selectRootTasksByStatus` (root only), `selectSubtasks(parentId)`, `selectSubtaskProgress(parentId)` → `{done, total}`, `selectDescendantCount(taskId)`
- List view state (persisted to `lumina_task_view_prefs` localStorage key): `viewMode: 'kanban'|'list'`, `listSortColumn`, `listSortDirection`, `listGroupBy: 'status'|'priority'|'difficulty'|'dueDate'|'none'`, `listCollapsedGroups: string[]`
- List view actions: `setViewMode`, `setListSort`, `setListGroupBy`, `toggleListGroupCollapse`
- Filter state (persisted in same `lumina_task_view_prefs` key): `searchQuery: string`, `priorityFilter: TaskPriority[]`, `difficultyFilter: TaskDifficulty[]`, `dueDateFilter: 'all'|'overdue'|'today'|'this_week'|'next_week'|'no_date'|'has_date'`
- Filter actions: `setSearchQuery`, `setPriorityFilter`, `setDifficultyFilter`, `setDueDateFilter`, `clearAllFilters`
- **UUID resolver registry** (module-level, outside Zustand state): `resolveTaskDbId(taskId, timeoutMs?)` — exported async function. If `taskId` is already a UUID returns it immediately. Otherwise waits for `addTask`'s DB round-trip to resolve the optimistic `uid()` id → real DB UUID (up to 5 s timeout). Used by `useDailyPlanStore.addPlanItem` / `batchAddPlanItems` to avoid sending a non-UUID taskId to `POST /api/planner-items` (which rejects it via Zod `.uuid()`). `addTask` calls internal `notifyOptimisticIdResolved(optimisticId, dbId)` on every outcome (success, failure, or when `dbId === optimisticId` meaning the task already had a UUID).

### `useFocusStore`
- `activeSession: ActiveSession | null` — ephemeral timer state (persisted to localStorage for page-reload resume)
- `timerState: 'idle' | 'running' | 'paused'`
- `sessionHistory: FocusSession[]` — DB-hydrated on mount
- Actions: `startSession(taskId, taskTitle, durationSecs)`, `pauseSession`, `resumeSession`, `finishSession`, `cancelSession`, `getElapsedSecs`
- `dbHydrated`, `hydrateFromDb`, `hydrateFromDbFailed`
- Note: FocusSessionView uses this store's timer. PomodoroView uses `usePomodoroStore` for its own timer but reads `useFocusStore.activeSession` on mount to pre-populate the task selector, and writes session results (with taskId/taskTitle) to `sessionHistory`.

### `useDailyPlanStore`
- `plansByDate: Record<string, PlannedTaskItem[]>` — all plan items keyed by `YYYY-MM-DD`
- `dbHydrated: boolean`
- `viewDate: string` (YYYY-MM-DD, session-only, never persisted) — which calendar day the planner UI is showing; defaults to today
- Hydration: `hydrateFromDb(items)`, `hydrateFromDbFailed()`
- View: `setViewDate(date)`
- CRUD: `addPlanItem(taskId, planDate, startTime, endTime)` — awaits `resolveTaskDbId` before `POST /api/planner-items`; `batchAddPlanItems(planDate, items[])` — resolves all task IDs in parallel then `POST /api/planner-items/batch`; `removePlanItem(planItemId, planDate)`; `removeAllByTaskId(taskId)` — deletes all plan items for a task (cross-date), rolls back snapshot if any deletion fails; `updatePlanItem(planItemId, planDate, patch)` (startTime/endTime/order); `reorderPlanItems(planDate, orderedIds)`
- Selector: `getPlanItemsForDate(planDate) → PlannedTaskItem[]`
- No `persist` middleware — DB is sole source of truth

### `usePlannerStore`
- `outlookConnected: boolean`, `outlookEvents: OutlookEvent[]`
- `googleConnected: boolean`
- `setOutlookConnected`, `setOutlookEvents`, `setGoogleConnected`

### `useIntelligenceStore`
- `recommendations: Recommendation[]`, `insights: Insight[]`
- `lastAnalysed: string | null`
- `setRecommendations`, `setInsights`

### `useDragStore`
- `isDragging: boolean`, `activeId: string | null`
- `dragOverId: string | null`, `overlaps: string[]`

### `useCoinsStore`
- `balance: number`, `transactions: CoinTransaction[]`, `consumables: Record<ConsumableKey, number>`, `ownedItems: string[]`, `activeCosmetics: { accentColor?: string, confetti?: boolean }`, `dbHydrated: boolean`
- Actions: `purchaseItem(itemId)` (optimistic + rollback), `activateCosmetic(patch)`, `addEarnedCoins(amount, tx?)`
- Selectors: `selectCoinBalance`, `selectActiveCosmetics`, `selectOwnedItems`, `selectConsumables`
- Instance methods: `ownsItem(id)`, `getConsumable(key)`
- Hydrated via PersistenceBootstrap from GET /api/coins

### `useGoalsStore`
- `goals: Goal[]` (each goal has nested `targets: GoalTarget[]`), `dbHydrated: boolean`, `isLoading: boolean`, `selectedGoalId: string | null`
- CRUD: `addGoal(input)` (creates goal + targets optimistically, persists via goalsPersistence), `updateGoal(id, patch)`, `archiveGoal(id)`, `deleteGoal(id)`
- Target CRUD: `addTarget(goalId, input)`, `updateTarget(goalId, targetId, patch)`, `deleteTarget(goalId, targetId)`, `updateTargetProgress(goalId, targetId, value)`
- Selectors: `selectActiveGoals` (sorted by endDate), `selectGoalsByStatus(status)`, `selectGoalProgress(goalId)`, `selectActiveGoalCount`
- Progress: `computeGoalProgress(goal)` = average of target progress. Per-target: number (current/target), percentage (0-100), boolean (0 or 100), task_completion (done tasks / total tasks).
- Auto-progress: PATCH /api/tasks/[id] auto-updates task_completion targets when a task's status changes.

### `useSettingsStore`
- `theme: 'light' | 'dark' | 'system'`
- `focusSessionLength: number` (minutes)
- `notifications: boolean`
- `setFocusSessionLength`, `setTheme`

### `useOnboardingStore` (persisted as `lumina-onboarding`)
- `completed: boolean`
- `userName`, `userRole`, `timezone`, `workStart`, `workEnd`
- `focusPreference`, `focusSessionLength`, `customFocusMinutes`, `customBreakMinutes`
- `focusGoals: FocusGoal[]`
- `googleConnected`, `microsoftConnected`
- `complete()` — sets `completed: true`

### `useTutorialStore` (persisted as `lumina-tutorial`)
```ts
interface TutorialState {
  isActive: boolean;
  currentStep: number;
  hasCompletedTutorial: boolean;
  hasSeenPrompt: boolean;          // true after first time prompt is shown
  startTutorial: () => void;       // sets isActive=true, hasSeenPrompt=true
  nextStep: () => void;
  skipTutorial: () => void;
  completeTutorial: () => void;
  dismissPrompt: () => void;       // sets hasSeenPrompt=true without starting
}
```
Persisted keys: `hasCompletedTutorial`, `hasSeenPrompt`

### `useGuestStore` (persisted as `lumina-guest`)
```ts
interface GuestState {
  isGuest: boolean;
  bannerDismissed: boolean;
  setGuest: (value: boolean) => void;
  dismissBanner: () => void;
  clearGuestSession: () => void;   // sets isGuest=false, bannerDismissed=false
}
```
Persisted keys: `isGuest`, `bannerDismissed`

### `useStreakStore` (persisted as `lumina-streaks`)
```ts
interface StreakState {
  coins: number;
  dailyStreak: number;
  bestDailyStreak: number;
  sessionStreak: number;
  bestSessionStreak: number;
  achievements: Achievement[];
  unseenAchievements: Achievement[];
  hydrated: boolean;
  hydrateFromAPI: () => Promise<void>;
  applySessionResult: (result: FocusSessionResult) => void;
  markAchievementsSeen: () => void;
  setAchievements: (achievements: Achievement[]) => void;
}
```
Persisted keys: `coins`, `dailyStreak`, `bestDailyStreak`, `sessionStreak`, `bestSessionStreak`

### `useAmbientStore` (no persistence — resets on reload)
```ts
interface AmbientState {
  isPlaying: boolean;
  activeTrack: AmbientTrack | null; // 'brown' | 'rainfall' | 'forest' | 'ocean'
  volume: number;  // 0–1
  drawerOpen: boolean;
  setTrack: (track: AmbientTrack | null) => void;  // calls noiseGenerator internally
  setVolume: (v: number) => void;                   // calls noiseGenerator internally
  stop: () => void;                                  // calls noiseGenerator internally
  openDrawer: () => void;
  closeDrawer: () => void;
}
```
**Architecture:** Store owns the full audio lifecycle — it imports `playTrack`, `stopTrack`, `setTrackVolume` from `noiseGenerator.ts`. Components NEVER import noiseGenerator directly. `noiseGenerator` uses a session-ID guard to prevent ghost audio from orphaned async callbacks.

### `useNotificationStore` (persisted as `lumina-notifications`)
```ts
interface NotificationState {
  permission: NotificationPermission;  // 'default' | 'granted' | 'denied'
  subscription: PushSubscriptionJSON | null;
  preferences: NotificationPreferences; // dailyBrief, eventReminders, streakReminder, taskReminders, focusComplete
  isSupported: boolean;
  initialized: boolean;
}
```
Actions: `init()` (checks permission + fetches server prefs + syncs timezone), `requestPermission()`, `subscribe()`, `unsubscribe()`, `updatePreferences(partial)`
Persisted keys: `preferences` only — permission/subscription re-checked on init.

### `useToastStore`
- `toasts: Toast[]`
- `addToast`, `removeToast`

---

## 7. HOOKS

| File | Purpose |
|---|---|
| `useCalendar.ts` | Calendar data and actions from stores |
| `useFocusStore.ts` | Focus session operations |
| `useUser.ts` | `{ user, session, isAuthenticated, isLoading, refetch }` from BetterAuth |
| `useToast.ts` | Toast notification helper |
| `useIsMobile.ts` | `boolean` — checks `window.innerWidth < 768` |
| `useVirtualWindow.ts` | Virtual scrolling for dense time grids |
| `useGuestGate.ts` | Gate feature access for guest users (see §9) |
| `useOutlookSync.ts` | Calls `POST /api/sync/outlook` on mount, maps events |
| `useContributionYear.ts` | Year selection for performance heatmap |
| `useIsPWA.ts` | `boolean` — detects standalone display-mode (installed PWA) |

Note: `useFocusStore` has NOT been extended with `moodLogs` — mood logs are managed as local state in FocusPage and fetched via `moodPersistence.fetchMoodLogs()`. The `useStreakStore` is hydrated from `GET /api/users/preferences` which now returns streak fields.

---

## 8. API CONTRACTS

All API routes require an authenticated session except where noted.

### Events

#### `GET /api/events`
Returns array of event objects:
```json
{
  "id": "uuid",
  "title": "string",
  "date": "YYYY-MM-DD",
  "startTime": "HH:mm",
  "endTime": "HH:mm",
  "description": "string|undefined",
  "location": "string|undefined",
  "isAllDay": false,
  "completed": false,
  "category": "work",
  "linkedTaskId": null
}
```
Note: `completed`, `category`, `linkedTaskId` are synthesized defaults (not in DB).

#### `POST /api/events`
Required: `title`, `date`
Optional: `startTime`, `endTime`, `description`, `location`, `isAllDay`, `timezone`, `category`, `color`, `completed`, `linkedTaskId`, `externalEventId`, `meetingUrl`, `organizerEmail`, `createdViaNL` (boolean), `recurrence: { rrule, exdates?, until? }`
Response: `{ "id": "uuid", "event": {...}, "recurrence": {...} | null }`

#### `PATCH /api/events/[id]`
Patchable: `title`, `description`, `location`, `isAllDay`, `date`+`startTime`, `date`+`endTime`
Ownership checked: `events.userId = session.user.id`
Supports `editScope: 'this' | 'this_and_following' | 'all'` for recurring events.
Response: `{ "ok": true }`

#### `DELETE /api/events/[id]`
Ownership checked. Supports `?editScope=this|this_and_following|all` for recurring events.
Response: `{ "ok": true }`

#### `GET /api/events/expand`
Query params: `start` (ISO), `end` (ISO). Max 366-day window.
Returns `{ instances: [...] }` — virtual expanded instances of recurring events with composite IDs `masterEventId:isoDate`.

#### `POST /api/intelligence/parse-event`
Server-side Gemini NL→structured event parser. API key never exposed to client.
Body: `{ text: string (3-500 chars), timezone: string, referenceDate: "YYYY-MM-DD" }`
Response: `{ parsed: ParsedEventData, raw: string }` or `{ error: string, raw?: string }`.
`ParsedEventData`: `{ title, date, startTime, endTime, isAllDay, location, description, recurrence, confidence (0-1), ambiguities[] }`.

#### `POST /api/link`
Atomically links a task and event bidirectionally in a single DB transaction.
Body: `{ taskId: uuid, eventId: uuid }`. Validates ownership, checks for existing links (409 if already linked elsewhere).
Response: `{ ok: true, taskId, eventId }`

#### `DELETE /api/link`
Atomically unlinks a task and event. Body: `{ taskId: uuid, eventId: uuid }`.
Response: `{ ok: true }`

#### `GET /api/daily-brief`
Query params: `timezone` (required), `refresh=true` (optional, forces Gemini regeneration).
Returns `DailyBriefData`: eventCount, nextEvent, meetingHours, bestFocusWindow (via `detectFocusWindows`), topPriorityTask, overdueCount, totalOpenTasks, plannedTaskCount, currentStreak, isStreakAtRisk, narrative (Gemini, cached per user per day in `daily_brief_cache`), narrativeGeneratedAt.
All 7 data fetches run in `Promise.all`. Gemini max once per user per day (DB UNIQUE constraint enforced).

---

### Tasks

#### `GET /api/tasks`
Query param: `?includeArchived=true` to include archived tasks (excluded by default)
Returns array:
```json
{
  "id": "uuid",
  "title": "string",
  "description": "string|undefined",
  "status": "todo|doing|done|archived",
  "dbStatus": "todo|in_progress|done|archived",
  "priority": "low|medium|high",
  "dueDate": "YYYY-MM-DD|null",
  "durationMinutes": 30,
  "scheduledStart": "HH:mm|null",
  "scheduledEnd": "HH:mm|null",
  "remainingFocusTime": 600,
  "order": 0,
  "context": null,
  "linkedEventId": "uuid|null",
  "parentTaskId": "uuid|null",
  "depth": 0
}
```

#### `POST /api/tasks`
Required: `title`
Optional: `description`, `status`, `priority`, `dueDate`, `durationMinutes`, `scheduledStart`, `scheduledEnd`, `remainingFocusTime`, `linkedEventId`, `parentTaskId`
- If `parentTaskId` provided: validates parent exists and belongs to user, rejects with 400 if parent depth ≥ 2 ("Maximum nesting depth reached"), sets `depth = parent.depth + 1`
- If `parentTaskId` not provided: `depth = 0` (root task)

#### `PATCH /api/tasks/[id]`
Patchable: `title`, `description`, `status` (todo|doing|in_progress|done|archived), `priority`, `durationMinutes`, `dueDate`, `scheduledStart`, `scheduledEnd`, `remainingFocusTime`, `linkedEventId`
Note: `parentTaskId` and `depth` are **immutable** — not patchable. No reparenting.

#### `DELETE /api/tasks/[id]`
Response: `{ "ok": true }`
Children are cascade-deleted via FK constraint at the DB level.

---

### Focus Sessions

#### `GET /api/focus-sessions`
```json
{
  "id": "uuid",
  "taskId": "uuid|''",
  "taskTitle": "",
  "startTime": "ISO",
  "endTime": "ISO",
  "duration": 1500,
  "completed": true
}
```
Note: `duration` is in seconds; DB stores `durationMinutes`. `taskTitle` is empty string (not persisted in DB).

#### `POST /api/focus-sessions` (extended with streak/coin/achievement logic)
Required: `startTime` (ISO), `endTime` (ISO), `duration` (seconds)
Optional: `taskId` (uuid), `taskTitle` (string — prefers client-sent, falls back to DB lookup via taskId), `timezone` (string, default 'UTC')
Validates: `end > start`, converts seconds → rounded minutes (min 1)
After insert: computes streak update, coins earned, achievement unlocks — all in one DB pass.
**Pomodoro integration:** PomodoroView sends `taskId` + `taskTitle` from the task selector. FocusPage handler also calls `useLinkStore.promptTaskCompletion()` to show "Mark task as done?" after session completes with a linked task.
Response:
```json
{
  "id": "uuid",
  "coinsEarned": 25,
  "newCoins": 147,
  "dailyStreak": 5,
  "sessionStreak": 3,
  "newAchievements": [{ "type": "session_milestone_5", "unlockedAt": "ISO" }]
}
```

#### `DELETE /api/focus-sessions/[id]`
Response: `{ "ok": true }`

---

### Mood Logs

#### `GET /api/mood-logs`
Query: `?limit=30` (default 30, max 100)
Returns array of mood log objects sorted by loggedAt desc.

#### `POST /api/mood-logs`
Body: `{ mood: 'great'|'good'|'okay'|'tired'|'bad', focusSessionId?: string, note?: string }`
Response: `{ "id": "uuid" }`

---

### Contact

#### `POST /api/contact`
Body: `{ type: 'suggestion'|'technical'|'feedback', subject: string, message: string, email?: string }`
Rate limited: 1 per 60 seconds per session.
Response: `{ "ok": true }`

---

### Streak Recovery

#### `POST /api/streaks/recover`
Placeholder — returns `{ "ok": false, "reason": "payment_required" }` with HTTP 402.

---

### Push Notifications

#### `POST /api/push/subscribe`
Body: `{ subscription: PushSubscriptionJSON }` — upserts push subscription for authenticated user.
Response: `{ ok: true }`

#### `DELETE /api/push/subscribe`
Body: `{ endpoint: string }` — removes subscription by endpoint.
Response: `{ ok: true }`

#### `POST /api/push/send`
Self-only: sends push notification to the authenticated user's own devices.
Body: `{ title, body, tag, url, notificationType }`.
Used by focus-complete notification (fires when `document.hidden === true` after session save).
Response: `{ ok: true }`

#### `GET/PATCH /api/users/notification-preferences`
GET: returns `{ preferences: NotificationPreferences }`.
PATCH: merge-updates notification prefs + optional `timezone` (IANA string) sync.
Body: `{ dailyBrief?: boolean, ..., timezone?: string }`.

---

### Cron Jobs (Vercel Cron, protected by CRON_SECRET)

All cron routes require `Authorization: Bearer <CRON_SECRET>` header. Returns 401 without it.
Configured in `vercel.json`, all run every 5 minutes.

#### `GET /api/cron/daily-brief`
Sends morning brief push at ~8:00 AM **user local time** (uses `users.timezone` column).
Also sends task-due notification if `taskReminders` enabled and tasks due today.

#### `GET /api/cron/event-reminders`
Finds events with `startTime` 10–15 minutes from now, sends reminder, marks `reminder_sent_at`.
Uses absolute timestamps — timezone-agnostic.

#### `GET /api/cron/streak-reminder`
Sends "streak at risk" push at ~8:00 PM **user local time** for users with `dailyStreak > 0` and no focus session today.

---

### Integrations

#### `GET /api/integrations/status`
No body needed. Returns:
```json
{ "google": { "connected": true }, "microsoft": { "connected": false } }
```
Never exposes tokens.

#### `GET /api/integrations/google/connect`
Redirects user to Google Calendar OAuth (calendar.readonly + offline + consent prompt).
Sets httpOnly state cookie `lumina_google_connect_state` for CSRF.

#### `GET /api/integrations/google/callback`
Verifies state cookie, exchanges code for tokens, upserts into `integrations` table, redirects to `/auth/popup-complete?provider=google`.

#### `GET /api/integrations/microsoft/connect`
Redirects to Microsoft OAuth (Calendars.Read + select_account).

#### `GET /api/integrations/microsoft/callback`
Same pattern as Google. Stores in `integrations` with `provider='microsoft'`.

#### `POST /api/sync/outlook`
Body (optional): `{ "timezone": "string" }`
Loads token from DB by `session.user.id`. Never trusts client-supplied tokens.
Returns: `{ ok, eventCount, events[] }`
- `401` if session missing or token expired
- `404` if integration not connected
- `409` if integration status not active

#### `POST /api/sync/google`
Calls `runFullGoogleSync(userId)`. Returns sync result with imported counts.

---

## 9. GUEST AUTH FLOW

The full guest authentication system was built in the March 2026 pass.

### Architecture

```
useGuestStore (Zustand + persist)
  ↓
StepAuth (OnboardingFlow step 1) — "Continue as Guest" path
  ↓ calls setGuest(true) + advances step
GuestBanner (AppShell) — amber warning strip at top of every page
GuestUpgradeModal — dialog on account-gated feature access
useGuestGate hook — gate(feature?) → true if guest + opens modal
beforeunload handler (AppShell) — browser "Leave site?" prompt
```

### Files

**`src/store/useGuestStore.ts`**
- State: `isGuest`, `bannerDismissed`
- Actions: `setGuest(value)`, `dismissBanner()`, `clearGuestSession()`
- Persisted to `localStorage` key `lumina-guest`

**`src/components/auth/GuestBanner.tsx`**
- Shown in AppShell when `isGuest && !bannerDismissed`
- Amber palette: `border-amber-200/70 dark:border-amber-800/35 bg-amber-50/90 dark:bg-amber-950/25`
- AnimatePresence height animation for show/dismiss
- Links to `/onboarding` to convert guest to registered user

**`src/components/auth/GuestUpgradeModal.tsx`**
- Dialog with contextual `featureName?: string`
- CTA: "Create free account" (Link to /onboarding) + "Continue as guest" (dismiss)
- Tokens: `bg-card`, `border-border/60`, `rounded-2xl`

**`src/hooks/useGuestGate.ts`**
```ts
const { isGuest, gate, upgradeModalOpen, gatedFeatureName, closeUpgradeModal } = useGuestGate();
// Usage: if (gate('Export data')) return;  ← shows modal and returns true for guests
```

**`src/components/OnboardingFlow.tsx` — StepAuth (step 1)**
- Tab strip: Sign in / Create account (pill tabs, `bg-background shadow-sm` active)
- Label-above-field pattern using `<AuthField>` helper component
- `AuthField`: `label` above, `AnimatePresence` animated error `motion.p` below
- Zod validation: `nameSchema`, `emailSchema`, `passwordCreateSchema`, `passwordSchema`
- Field error state: `border-destructive focus-visible:ring-destructive/20`
- Server-level error shown only when no field-level errors exist
- Guest path section behind `border-t border-border/40` divider:
  1. "Continue as Guest" text link → expands warning card
  2. Amber warning card: data-loss scenarios, dismiss (×) button
  3. "I understand — continue as Guest" → calls `onContinueAsGuest`
- `onContinueAsGuest` prop calls `setGuest(true)` + advances step directly (bypasses `canContinue()`)
- `canContinue()` for step 1: `authStatus === 'logged in' || isGuest`

**`src/components/OnboardingFlow.tsx` — StepCompletion (step 8)**
- Accepts `isGuest?: boolean`
- When `isGuest=true`: renders amber block with link to create an account

**`src/app/(app)/AppShell.tsx`**
- Imports and renders `<GuestBanner />` inside `<main>` before content
- `useEffect` adds `beforeunload` event listener when `isGuest === true`

---

## 10. TUTORIAL OVERLAY SYSTEM

The tutorial system was fully rewritten in the March 2026 pass.

### Files
- `src/components/tutorial/TutorialOverlay.tsx` — single file for entire system
- `src/store/useTutorialStore.ts` — state

### Architecture

**Spotlight approach:** SVG `<mask>` with white fill rect + animated black `<motion.rect>` for the cutout. No `mix-blend-mode` (was broken cross-browser).

**Clickable spotlight:** 4 surrounding blocker divs (top/left/right/bottom strips) at `z-[9988]` each cover the area AROUND the highlighted element. The spotlight area itself has no blocker, so the user can click/interact with highlighted UI.

```tsx
// 4-rect pattern (no single full-screen blocker)
const blockers = [
  { left: 0, top: 0, width: winW, height: sy },                          // top
  { left: 0, top: sy, width: sx, height: sh },                           // left
  { left: sx + sw, top: sy, width: winW - (sx + sw), height: sh },      // right
  { left: 0, top: sy + sh, width: winW, height: winH - (sy + sh) },     // bottom
];
```

### Tour steps (11 total)

| Step | data-tutorial | Description | Optional |
|---|---|---|---|
| 0 | `sidebar-nav` | Sidebar navigation | No |
| 1 | `calendar-view` | Calendar tab | No |
| 2 | `task-view` | Tasks tab | No |
| 3 | `plan-view` | Plan tab | No |
| 4 | `focus-view` | Focus tab | No |
| 5 | `add-event-btn` | Add event button | No |
| 6 | `intelligence-view` | Intelligence panel | No |
| 7 | `cal-view-tabs` | CalendarPage TabsList | **Yes** |
| 8 | `task-board-header` | TaskBoard header | **Yes** |
| 9 | `plan-pool` | DailyPlanView task pool | **Yes** |
| 10 | Completion | Tour done | No |

Optional steps: if target element isn't found, auto-advance after 1500ms.

### data-tutorial attributes added to components

- `src/components/pages/CalendarPage.tsx` → `<TabsList data-tutorial="cal-view-tabs">`
- `src/components/tasks/TaskBoard.tsx` → board header `data-tutorial="task-board-header"`
- `src/components/planner/DailyPlanView.tsx` → task pool div `data-tutorial="plan-pool"`

### First-time prompt flow

On first visit (before tutorial has been seen):
- `TourPrompt` component — bottom-right notification card: "New to Lumina?" with "Show me around →" and "Maybe later"
- Dismissing prompt shows `FloatingTourButton` (persistent `?` circle icon, bottom-right)
- `hasSeenPrompt` is persisted; once true, `TourPrompt` never re-appears
- No `BeaconRing`/pulse animation (was removed)

### Keyboard nav
- `→` / `Enter` → next step
- `Escape` → skip/exit tour

---

## 11. ONBOARDING FLOW STEPS

File: `src/components/OnboardingFlow.tsx`

| Step | Component | Notes |
|---|---|---|
| 0 | `StepWelcome` | Landing with feature bullets |
| 1 | `StepAuth` | Sign in / Create account / Guest path |
| 2 | `StepAboutYou` | Name + role |
| 3 | `StepWorkSchedule` | Work start/end times |
| 4 | `StepFocusPreference` | Morning / midday / evening / none |
| 5 | `StepSessionLength` | 25/5, 50/10, 90/20, custom |
| 6 | `StepCalendarSync` | Connect Google/Outlook (optional, skippable) |
| 7 | `StepFocusGoals` | Multi-select goals |
| 8 | `StepCompletion` | Done. Shows guest amber reminder if `isGuest` |

Navigation: `canContinue()` gates the Continue button. Step 1 requires `authStatus === 'logged in' || isGuest`.

---

## 12. AUTH ARCHITECTURE

### Identity-only OAuth (BetterAuth)
Configured in `src/lib/auth.ts`.
- Google: `openid`, `email`, `profile` scopes only. No calendar scopes.
- Microsoft: identity only.
- Email/password also supported.

### Calendar integration OAuth (separate flow)
Triggered by user clicking "Connect Google Calendar" or "Connect Outlook".
- Opens popup to `/api/integrations/{provider}/connect`
- Callback stores tokens in `integrations` table at `/api/integrations/{provider}/callback`
- CSRF state cookie protection: `lumina_google_connect_state` / `lumina_microsoft_connect_state`
- Tokens are NEVER exposed to client. Always loaded from DB by `session.user.id`.

### Required OAuth redirect URIs in external consoles
- Google Cloud Console: `{BETTER_AUTH_URL}/api/integrations/google/callback`
- Azure AD: `{BETTER_AUTH_URL}/api/integrations/microsoft/callback`
- BetterAuth login: `/api/auth/callback/google`, `/api/auth/callback/microsoft`

### OAuth popup bridge
`src/app/auth/popup-complete/page.tsx` — posts `{ type: 'lumina:oauth-complete', provider, success }` to `window.opener` then closes.

---

## 13. VALIDATION LIBRARY

File: `src/lib/validation.ts`

```ts
// Schemas
nameSchema             // min 1, max 100 chars, trimmed
emailSchema            // valid email format
passwordCreateSchema   // min 8 chars (sign-up)
passwordSchema         // non-empty (sign-in)
titleSchema            // min 1, max 200 chars (event/task titles)
contextNameSchema      // min 1, max 50 chars
dateSchema             // must match /^\d{4}-\d{2}-\d{2}$/

// Utility
getFieldError(schema, value): string | null
// Returns first Zod error message or null if valid
```

---

## 14. PERSISTENCE & HYDRATION

### PersistenceBootstrap
`src/components/PersistenceBootstrap.tsx` — runs once on app mount.
- Fetches events, tasks, focus sessions in parallel.
- Calls store `hydrateFromDB()` on each.
- Dev-only fallback: if fetch fails, reads from localStorage.

### Persistence adapters
`src/lib/persistence/`
- `eventsPersistence.ts` → wrappers for `/api/events`
- `tasksPersistence.ts` → wrappers for `/api/tasks`
- `focusPersistence.ts` → wrappers for `/api/focus-sessions`
- `plannerPersistence.ts` → intentional no-op stub (planner is localStorage-only)

### Data flow
```
UI interaction
  → Zustand store (optimistic update)
    → persistence adapter (fetch call)
      → API route (session check + validation)
        → Drizzle ORM → Neon Postgres
```

---

## 15. FOCUS SESSION FLOW

### Two timer systems
1. **Focus Timer** (`FocusSessionView.tsx` + `FocusTimer.tsx` + `useFocusStore`) — dedicated countdown from TaskBoard "Start focus"
2. **Pomodoro** (`PomodoroView.tsx` + `usePomodoroStore`) — work/break cycles with task selector

Both write to the same `POST /api/focus-sessions` endpoint with `taskId`/`taskTitle` when a session completes.

### Interruption / resume (both timers)
When a running session is interrupted (user clicks Stop with a task linked):
- `MobileBottomSheet` prompt: "Did you finish [task title]?"
  - **Yes, mark done** → `updateTask(taskId, { status: 'done', remainingFocusTime: null })`, saves partial session (if ≥ 60s) to DB
  - **Not yet** → saves `remainingFocusTime = workDuration - elapsed` on task, saves partial session (if ≥ 60s) to DB
- Next time the task is selected in Pomodoro's "Focusing on" or started from TaskBoard, `remainingFocusTime` powers a "Resume from X remaining?" prompt

### Pomodoro → Task wiring
- PomodoroView reads `useFocusStore.activeSession` on mount to pre-populate task selector (if user started from TaskBoard)
- On natural session completion: sends `taskId`/`taskTitle` to `onSessionComplete`, clears `remainingFocusTime`, and `FocusPage` triggers `useLinkStore.promptTaskCompletion()` → `TaskCompletionPrompt` appears in AppShell
- Session history entries include taskTitle so `/focus/done` and session history cards display it
- Task selector card shows pulsing green dot when timer running, hides deselect button mid-session

Primary files: `PomodoroView.tsx`, `FocusPage.tsx`, `FocusSessionView.tsx`, `FocusTimer.tsx`, `TaskBoard.tsx`

### Session persistence
- Active timer state: localStorage only (by design — ephemeral)
- Completed sessions: DB-backed via `POST /api/focus-sessions`

---

## 16. PERFORMANCE / CONTRIBUTION SYSTEM

File: `src/components/performance/contributions/ContributionGrid.tsx`
- GitHub-style heatmap of daily focus/task activity
- `buildContributionCalendar()` computes grid from focus sessions + completed tasks
- Color levels computed by `getContributionLevel(score)`
- Year selection: `ContributionYearSelector`

---

## 17. INTELLIGENCE ENGINE

`src/lib/intelligence/`
- `engine.ts` — orchestrates analysis
- `recommendations.ts` — generates task scheduling suggestions
- `focusWindows.ts` — finds optimal focus time blocks
- `calendarAnalysis.ts` — analyses meeting density
- `conflicts.ts` — detects scheduling conflicts
- `scoring.ts` — ranks recommendations
- `llmSummary.ts` — Gemini-powered natural language summary

Triggered by `calculateIntelligence()` in `useCalendarStore`.

---

## 18. MOBILE / RESPONSIVE

### AppShell mobile nav
Fixed bottom nav with 5 items: Home, Tasks, Plan, Stats, Focus.
Tokens: `bg-background/90 backdrop-blur-xl border-t border-border`
Active item: `text-primary`
Inactive item: `text-muted-foreground`

### Touch DnD
- `MouseSensor` + `TouchSensor` (hold-to-drag activation delay) in both planner and task board
- `PlanningModal.tsx` and `TaskDialog.tsx` use bottom-sheet pattern on mobile

### Safe area
- `pb-[calc(env(safe-area-inset-bottom)+72px)]` — prevents iOS home indicator overlap on mobile
- `pb-safe` on mobile nav

---

## 19. KNOWN GAPS / OPEN ISSUES

| # | Severity | Description |
|---|---|---|
| 1 | Medium | Task status vocabulary dual boundary: DB uses `in_progress`, UI uses `doing`. API normalizes both ways. New code should use `in_progress` in DB calls. |
| 2 | ~~High~~ Resolved | ~~Event contract mismatch~~ — Fixed: `category`, `color`, `completed`, `linkedTaskId` now persisted. Recurrence fields stored in `event_recurrence` table with full RRULE support. |
| 3 | ~~Medium~~ Resolved | ~~Planner localStorage-only~~ — Fixed long ago (v20): full DB persistence via `/api/planner-items` (GET/POST/PATCH/DELETE, `src/app/api/planner-items/*`), client adapter `src/lib/persistence/plannerPersistence.ts` (real — `migrateMany` is the only deliberate no-op, reserved for a future localStorage-import flow), Zustand optimistic updates with rollback-plus-retry toast in `useDailyPlanStore`. DB is sole source of truth; no `persist` middleware. Hydrated in parallel by `PersistenceBootstrap.tsx:161-167`. **Do not re-implement at `/api/planner/*`** — that URL is unused. Documented explicitly in §34.4 after a v27 task was filed against an outdated mental model. |
| 4 | Low | No unique DB constraint for one primary local calendar per user (app logic handles it but DB doesn't enforce). |
| 5 | ~~Low~~ Resolved | ~~`taskTitle` not persisted~~ — Fixed: `task_title` column added, API reads/writes it, UI renders with "Deep work" fallback. |
| 6 | ~~Medium~~ Resolved | ~~Recurring event visual indicator~~ — Fixed: `RepeatIcon` shown in `TimeGridEvent.tsx` (Day/Week) and `EventItem.tsx` (Month). Opacity 50 normally, 100 on `isRecurrenceException`. Hidden on very short events. |
| 7 | ~~Low~~ Resolved | ~~Sequential create+link~~ — Fixed: Atomic `POST /api/events/create-linked` endpoint wraps event insert + recurrence insert + task link update in one `db.transaction()`. Client wrapper `createLinkedEvent()` in `linkPersistence.ts`. `useTaskBoardStore.scheduleAsEvent()` convenience method added. |
| 8 | ~~Low~~ Resolved | ~~Inline `/task` blocks~~ — Fixed: Custom `taskBlock` block spec with `taskId` stored in block props. `/task` slash command creates a real task via `POST /api/tasks` first, then inserts a `taskBlock` with the returned `taskId`. Block-level ID mapping replaces the old content-matching approach. Two-way sync: task board changes dispatch `lumina:task-updated` CustomEvent, doc editor listens and updates block state. Removing a taskBlock from the editor archives the linked task. |
| 9 | ~~Medium~~ Resolved | ~~Multi-column layout deferred~~ — Fixed: `@blocknote/xl-multi-column` installed. Schema extended with `withMultiColumn`. `/columns` slash command opens `ColumnRatioPicker` (6 ratio presets: 50/50, 70/30, 30/70, 33/33/33, 50/25/25, 25/50/25). CSS overrides in `globals.css` handle flex layout, resize handles, and mobile vertical stacking. |
| 10 | ~~Low~~ Resolved | ~~Migrate DocEditor from mantine to shadcn~~ — Fixed: `@blocknote/mantine` replaced with `@blocknote/shadcn`. Mantine fully removed from dependency tree. Lazy xl-multi-column chunk reduced from 512KB to 450KB. globals.css reduced from 494 to 360 lines (all Mantine overrides removed). |
| 11 | ~~High~~ Resolved | ~~Single-key shortcuts intercept typing in BlockNote editor~~ — Fixed: `AppShell.tsx` global keydown handler now checks `e.target.isContentEditable` and `e.target.closest('[contenteditable]')` in addition to `HTMLInputElement`/`HTMLTextAreaElement`. Keys like `p`, `t`, `f`, `n`, `g`, `m`, `w`, `d` no longer fire navigation/actions when typing in the editor. |
| 12 | ~~Medium~~ Resolved | ~~Block type selector dropdown broken (dark bg, truncated labels)~~ — Fixed: CSS overrides in `globals.css` target `[role="listbox"]` and `[role="option"]` inside `[data-radix-popper-content-wrapper]`. Dropdown now uses `--popover`/`--border` tokens, 160px min-width, no label truncation, themed hover/selected states. |
| 13 | ~~Low~~ Resolved | ~~Formatting toolbar buttons too small~~ — Fixed: CSS overrides give toolbar buttons 28px compact targets, 15px icons, primary-tinted active states. Block type combobox: 100px min-width, borderless, 12px font. Side menu (plus/drag): 20px square, 14px icons. |
| 14 | ~~Medium~~ Resolved | ~~GuestBanner links to /onboarding~~ — Fixed: "Create an account" link now goes to `/auth/signin` (standalone auth page) instead of re-running the full 9-step onboarding. On auth success: marks onboarding complete, clears guest mode, resets tutorial prompt. |
| 15 | ~~Medium~~ Resolved | ~~`text-primary-foreground` not resolving~~ — Fixed: `tailwind.config.js` was missing `foreground` key in the `primary` color object. Added `foreground: 'hsl(var(--primary-foreground))'`. All `bg-primary` buttons now render white text in both modes. |
| 16 | ~~Low~~ Resolved | ~~Light mode borders too faint~~ — Fixed: `--border` darkened from 87% to 82% lightness. Card borders, input borders visible on white backgrounds. Contribution heatmap cells use stronger fills in light mode (20%/35% vs 15%/30%). |
| 17 | ~~Low~~ Resolved | ~~Custom selection colors causing readability issues~~ — Fixed: Removed ALL `::selection` overrides (globals.css, BlockNote, AppShell `selection:` Tailwind classes). Browser defaults used everywhere. |
| 18 | ~~Low~~ Resolved | ~~Pomodoro page scrollbar visible~~ — Fixed: Right settings panel `overflow-y-auto` → `overflow-hidden`. Page container gets `no-scrollbar` utility. |
| 19 | ~~Low~~ Resolved | ~~BlockNote dropdown menus show scrollbar on open~~ — Fixed: All dropdown menus, color picker, sub-content panels have `overflow: hidden`, `scrollbar-width: none`, `::-webkit-scrollbar { display: none }`. |
| 20 | ~~Low~~ Resolved | ~~BlockNote tooltips not light-mode friendly~~ — Fixed: Override `[data-slot="tooltip-content"]` to use `--popover`/`--popover-foreground` instead of `bg-primary`. |
| 21 | ~~Medium~~ Resolved | ~~Sonner toasts look generic (over-rounded, left accent border, heavy shadows)~~ — Fixed: Created shadcn `Toaster` wrapper at `src/components/ui/sonner.tsx` using `unstyled: true` (Sonner strips visual defaults, keeps animations/positioning). All styling is plain Tailwind with semantic tokens — zero `!important`, zero hardcoded colors. `theme={resolvedTheme}` syncs with next-themes. Deleted custom `Toaster.tsx`, `useToastStore.ts`, and `sonnerConfig.ts`. `notify()` utility migrated from Zustand store to Sonner `toast()`. One unified toast system now — no more dual-toaster overlap. |
| 22 | ~~Medium~~ Resolved | ~~GuestBanner pushes calendar height down~~ — Fixed: Changed from `flex-shrink-0` in-flow element to `absolute top-0 left-0 right-0 z-30` overlay with `backdrop-blur-sm`. No longer affects layout of content below. Animation changed from height expand to y-slide + opacity. |
| 23 | ~~Medium~~ Resolved | ~~GuestBanner persists after signing in~~ — Fixed: `PersistenceBootstrap` now checks `session?.user?.id` on mount — if a valid auth session exists and `isGuest` is still true, calls `clearGuestSession()` to wipe the stale localStorage flag. Previously `clearGuestSession()` was never called from any auth flow. |

---

## 20. IMPLEMENTED FEATURES (FORMERLY BACKLOG)

### 20.1 Pomodoro tab + session feedback — COMPLETE
- `/focus` page refactored into 3 tabs: Focus Timer | Pomodoro | Stopwatch
- Floating circle FAB (TimerCallout) removed from AppShell
- `PomodoroView`: SVG progress ring, work/break cycle (4 work → long break), Web Audio chime on completion
- `PomodoroFeedbackModal`: forced mood selection (5 emojis), optional note, posts to `POST /api/mood-logs`
- `MoodAnalysisCard`: 3-day mood trend analysis, shown above Pomodoro timer, dismissible, with reflection input for declining trends

### 20.2 Ambient sound drawer — COMPLETE
- Primary: CDN-hosted audio files (archive.org for brown, jsdelivr for rain/forest/ocean). Fallback: Web Audio API synthesis
- Tracks: brown, rainfall, forest, ocean (white noise removed)
- `useAmbientStore` owns full audio lifecycle — components never import `noiseGenerator.ts` directly
- `noiseGenerator.ts` uses session-ID guard to prevent ghost audio from orphaned async callbacks
- `AmbientSoundDrawer`: bottom sheet with grid of sound cards, volume slider
- `FloatingAmbientPlayer`: animated waveform circle at bottom-right, click to stop
- Sidebar has "Ambient Sounds" button to open drawer
- PomodoroView has inline ambient section in right panel (synced with drawer)

### 20.3 Streaks + achievements + coins — COMPLETE
- DB-backed: `users` table extended with coins, dailyStreak, bestDailyStreak, sessionStreak, bestSessionStreak, lastFocusDate, lastSessionAt
- `achievements` table for unlocked milestones, `mood_logs` table for session feedback
- Server-side streak calculation in `POST /api/focus-sessions` (atomic transaction)
- 1 coin per minute earned. Achievements at 5/10 session streaks, 7/30 day streaks, 100/500 coins
- `useStreakStore` (Zustand + persist) for client state
- Performance page: 4-card streak stats row (daily streak, session streak, best day, coins)
- Achievement toasts via sonner on unlock
- Streak recovery card + placeholder premium dialog (HTTP 402)

### 20.4 Stopwatch — COMPLETE
- `StopwatchView`: HH:MM:SS.cs display, requestAnimationFrame timing, up to 20 laps
- Fastest/slowest lap highlighting, Framer Motion layout animations
- Third tab in FocusPage

### 20.5 Contact / Feedback — COMPLETE (NEW)
- `ContactDrawer`: right-side drawer with type/subject/message/email fields
- Zod inline validation on blur, character counter, rate limiting (60s)
- `POST /api/contact` → `contact_submissions` table
- Sidebar has "Contact" paper-plane icon button

### 20.6 RFC 5545 Recurring Events — COMPLETE
- `event_recurrence` table with RRULE text, exdates array, recurrence end
- `rruleEngine.ts`: parse, expand, build, describe RRULEs via `rrule` npm package. `validateRRule(rrule, dtstart)` (v26) rejects sub-daily frequencies, COUNT>500, INTERVAL>1000, length>500 — called before any RRULE is stored to prevent DoS.
- `GET /api/events/expand`: virtual instance expansion with 366-day window cap
- Edit scope semantics: `this` (exdate + exception), `this_and_following` (DB transaction series split), `all` (update master)
- `RecurrenceSelector.tsx`: presets + custom builder
- `EditRecurrenceDialog.tsx`: scope picker for edit/delete operations
- EventModal integration for create/edit/delete with recurrence

### 20.9 Smart Daily Brief — COMPLETE
- `GET /api/daily-brief`: parallel fetch of events, tasks, planner items, focus sessions, user streak, cached narrative
- Reuses `detectFocusWindows` from `focusWindows.ts` for best focus window (no duplicated logic)
- Gemini 2.0 Flash generates 2-sentence personalised narrative, cached in `daily_brief_cache` table (UNIQUE user_id + date)
- `useDailyBriefStore` with Zustand persist, midnight refresh timer, tab visibility handler
- `DailyBriefCard.tsx` with Lottie animated icons (no emojis), desktop 2-panel + mobile stacked layout
- Dismissible per day, auto-refetch on day change, guest fallback (no Gemini call)
- `LottieIcon.tsx` wrapper with hover-replay via lottieRef

### 20.8 Task ↔ Event Two-Way Link — COMPLETE
- `linked_event_id` UUID column added to tasks table with FK → events(id) ON DELETE SET NULL
- Tasks API GET/POST/PATCH all handle `linkedEventId` (was hardcoded to `null` before)
- `unlinkEvent` store method now persists the unlink to DB via `tasksPersistence.updateOne`
- Bidirectional cascade: deleting event nulls task's `linkedEventId` (DB FK), deleting task nulls event's `linkedTaskId` (DB FK)
- Index on `tasks.linked_event_id` for reverse lookups

### 20.10 Pomodoro↔Task integration — COMPLETE
- Task selector in PomodoroView wired to real focus session system
- On mount: reads `useFocusStore.activeSession` to pre-populate task (if started from TaskBoard)
- On session complete: sends `taskId`/`taskTitle` via `onSessionComplete` → `POST /api/focus-sessions`
- FocusPage calls `useLinkStore.promptTaskCompletion()` → `TaskCompletionPrompt` appears in AppShell
- Session history entries include task title (visible in `/focus/done` and session cards)
- Interrupt flow: `MobileBottomSheet` with "Yes, mark done" / "Not yet" — saves `remainingFocusTime` or marks task done
- Resume flow: if task has `remainingFocusTime`, shows "Resume from X remaining?" link
- Task card shows pulsing green dot when timer running, hides × button mid-session
- Two-column Pomodoro layout: timer left, 280px settings panel right (session config, ambient, task selector)
- Files: `PomodoroView.tsx`, `FocusPage.tsx`, `pomodoro/page.tsx`

### 20.7 Natural Language Event Input — COMPLETE
- `POST /api/intelligence/parse-event`: server-side Gemini 2.0 Flash NL→structured event parser
- `ParsedEventConfirmCard.tsx`: inline confirmation with confidence-based border (amber < 0.7, emerald ≥ 0.7)
- Profile.tsx Commitments section rewritten: parse → confirm → add flow
- `created_via_nl` boolean column on events table for analytics
- Gemini API key server-side only — never in client bundle

### 20.11 Subtasks (3-Level Hierarchy) — COMPLETE
- DB: `parent_task_id` UUID nullable self-ref FK (CASCADE delete), `depth` integer (0/1/2), index on parent_task_id
- API: POST validates depth (rejects depth ≥ 2 parents), GET returns flat with `parentTaskId`/`depth` fields. PATCH: parentTaskId immutable.
- Store: flat `tasks[]` array. New actions: `addSubtask(parentId, {title, ...})`, modified `deleteTask` (recursive descendant removal). New selectors: `selectRootTasksByStatus`, `selectSubtasks`, `selectSubtaskProgress`, `selectDescendantCount`.
- TaskCard: subtask progress pill ("2/5 subtasks" + chevron), Framer Motion expand/collapse, SubtaskRow with checkbox/title/priority badge, InlineAddSubtask input, auto-prompt toast when all subtasks complete.
- TaskBoard: `columnTasks` filters to root only (`!t.parentTaskId`), `subtaskMap` precomputed for O(1) lookup, handlers for add/toggle/delete subtasks.
- TaskDialog: "Subtasks" section in edit mode with progress bar, checkbox list, inline add input, click-to-open subtask editing.
- DailyPlanView: pool filters to root tasks only. PlannedTaskCard: optional `subtaskCount` badge.
- Files: `src/db/schema/tasks.ts`, `src/db/schema/index.ts`, `src/types/task.ts`, `src/app/api/tasks/route.ts`, `src/store/useTaskBoardStore.ts`, `src/utils/taskBoard.ts`, `src/components/tasks/TaskCard.tsx`, `src/components/tasks/TaskBoard.tsx`, `src/components/tasks/TaskColumn.tsx`, `src/components/tasks/TaskDialog.tsx`, `src/components/planner/DailyPlanView.tsx`, `src/components/planner/PlannedTaskCard.tsx`

### 20.12 Task List View — COMPLETE
- View toggle in TaskBoard header: kanban grid / list icons, active has `bg-muted` background. Persisted via `lumina_task_view_prefs` localStorage key.
- `TaskListView.tsx`: full-width table with 9 columns (expand chevron, checkbox, title, priority, difficulty, due date, status popover, focus time, actions dropdown).
- Sorting: click column headers to sort (toggle asc/desc). Sort by title (alpha), priority/difficulty/status (rank order), due date (earliest first, nulls last), focus time (highest first).
- Grouping: "Group by" dropdown (Status/Priority/Difficulty/Due Date/None). Each group is collapsible with Framer Motion height animation. Group collapse state persisted.
- Inline status change: Radix Popover on status pill, optimistic update.
- Subtask expansion: chevron on parent rows, subtask rows slide in with AnimatePresence height animation. Sub-subtasks not shown in list (simplicity).
- Mobile responsive: difficulty + focus time columns hidden on `< md`.
- Focus time: computed from `useFocusStore.sessionHistory`, memoized as `Record<taskId, totalSeconds>` in TaskBoard.
- Shared badge config: `src/utils/taskBadges.ts` exports `PRIORITY_META`, `DIFFICULTY_META`, `PRIORITY_ORDER`, `DIFFICULTY_ORDER`, `STATUS_ORDER`. Used by both TaskCard and TaskListView.
- AnimatePresence `mode="wait"` wraps kanban ↔ list transition (150ms fade).
- Files: `src/components/tasks/TaskListView.tsx` (NEW), `src/utils/taskBadges.ts` (NEW), `src/components/tasks/TaskBoard.tsx`, `src/components/tasks/TaskCard.tsx`, `src/store/useTaskBoardStore.ts`

### 20.13 Goals / OKR System — COMPLETE
- **Database**: `goals` table (status enum: active/completed/archived, timeframe enum: weekly/monthly/quarterly/yearly/custom, semantic color names) + `goal_targets` table (type enum: number/percentage/boolean/task_completion, linked_task_ids as JSON text).
- **API**: `GET/POST /api/goals` (list with targets + create atomically), `PATCH/DELETE /api/goals/[id]` (soft archive default, ?hard=true for delete), `POST /api/goals/[id]/targets`, `PATCH/DELETE /api/goals/[id]/targets/[targetId]`.
- **Task auto-progress**: PATCH /api/tasks/[id] fires fire-and-forget update to all task_completion targets referencing the changed task, recounting done tasks.
- **Store**: `useGoalsStore` with goals[], dbHydrated, CRUD for goals + targets, optimistic updates, progress selectors. Hydrated via PersistenceBootstrap.
- **Persistence**: `src/lib/persistence/goalsPersistence.ts` — fetchAllForCurrentUser, createOne, updateOne, deleteOne, addTarget, updateTarget, deleteTarget.
- **GoalsPage**: `/goals` route, 2-column card grid, status filter (active/completed/archived), timeframe filter tabs, staggered card entrance animation, skeleton loading, empty state.
- **GoalCard**: emoji + colored left border (5 semantic colors), title, timeframe badge, date range, animated progress bar, compact targets list (3 max + overflow), days remaining.
- **GoalDetailSheet**: right-side sheet (480px), SVG progress ring (reused Pomodoro pattern), time-elapsed bar, targets with type-specific controls (number stepper, percentage stepper, boolean toggle, task completion list), add target inline form.
- **GoalDialog**: MobileBottomSheet, emoji grid picker (20 presets), color swatches, timeframe auto-fill (weekly/monthly/quarterly/yearly), date range, description, inline targets builder.
- **Task dialog integration**: "Goals" section in TaskDialog (edit mode) showing linked targets, "Link to goal target" picker popover for task_completion targets.
- **Sidebar**: "Goals" nav item with target icon between Tasks and Plan Day.
- Files: `src/db/schema/goals.ts`, `src/db/schema/goalTargets.ts`, `src/db/schema/index.ts`, `src/types/goal.ts`, `src/app/api/goals/route.ts`, `src/app/api/goals/[id]/route.ts`, `src/app/api/goals/[id]/targets/route.ts`, `src/app/api/goals/[id]/targets/[targetId]/route.ts`, `src/app/api/tasks/[id]/route.ts`, `src/lib/persistence/goalsPersistence.ts`, `src/store/useGoalsStore.ts`, `src/components/PersistenceBootstrap.tsx`, `src/components/Sidebar.tsx`, `src/app/(app)/goals/page.tsx`, `src/components/pages/GoalsPage.tsx`, `src/components/goals/GoalDetailSheet.tsx`, `src/components/goals/GoalDialog.tsx`, `src/components/tasks/TaskDialog.tsx`

### 20.14 Coins Economy System — COMPLETE
- **Database**: `coin_transactions` table (amount, reason, label, metadata). `users` table extended with `active_cosmetics` (JSONB), `owned_items` (JSONB string[]), `consumables` (JSONB).
- **awardCoins engine**: `src/lib/coins/awardCoins.ts` — atomic DB transaction: insert coin_transaction + update user balance. Batch variant `awardCoinsBatch()` for multi-award.
- **Earn rules**: `src/lib/coins/earnRules.ts` — functions return Award[] arrays for: focus sessions (+5 base, +2 per 10min, priority bonus, Pomodoro cycle +20), task completion (+5/+10 hard, early/on-time bonus, all-subtasks +10, daily bursts +25/+50), goals (+10 create, +30 at 50%, +100-300 complete), streaks (milestones at 3/7/14/30 days, 5/10 sessions), daily actions (brief +10, plan day +15, first task +5), docs (+15 first, +10 long, +5 AI).
- **Earn triggers wired into**: POST /api/focus-sessions (focus + streak awards, focus boost consumable), PATCH /api/tasks/[id] (task completion + burst + subtask + multiplier consumable), POST /api/goals (creation award), PATCH /api/goals/[id] (completion awards).
- **Shop**: 16 items across 3 categories: power-ups (focus boost, task multiplier, streak shield, goal accelerator, auto-plan), cosmetics (4 accent themes, confetti, 3 badges), feature unlocks (extended history, custom categories, extra templates). Config in `src/config/shopItems.ts`.
- **API**: GET /api/coins (full economy data), POST /api/shop/purchase (atomic buy), POST /api/shop/activate-cosmetic (equip).
- **Store**: `useCoinsStore` — balance, transactions, consumables, ownedItems, activeCosmetics. Actions: purchaseItem (optimistic), activateCosmetic, addEarnedCoins. Hydrated via PersistenceBootstrap.
- **CosmeticsProvider**: Wraps app layout, injects `--primary` CSS variable override when accent color cosmetic active. Supports purple/rose/cyan/amber themes.
- **ShopPage**: `/shop` route, category filter tabs, item cards with emoji/cost/buy/equip, active consumable display, coin balance header.
- **Sidebar**: "Shop" nav item with coin balance badge.
- Files: `src/db/schema/coinTransactions.ts`, `src/db/schema/users.ts` (modified), `src/db/schema/index.ts` (modified), `src/types/coins.ts`, `src/config/shopItems.ts`, `src/lib/coins/awardCoins.ts`, `src/lib/coins/earnRules.ts`, `src/lib/persistence/coinsPersistence.ts`, `src/store/useCoinsStore.ts`, `src/app/api/coins/route.ts`, `src/app/api/shop/purchase/route.ts`, `src/app/api/shop/activate-cosmetic/route.ts`, `src/app/api/focus-sessions/route.ts` (modified), `src/app/api/tasks/[id]/route.ts` (modified), `src/app/api/goals/route.ts` (modified), `src/app/api/goals/[id]/route.ts` (modified), `src/components/PersistenceBootstrap.tsx` (modified), `src/components/CosmeticsProvider.tsx`, `src/app/providers.tsx` (modified), `src/app/(app)/shop/page.tsx`, `src/components/pages/ShopPage.tsx`, `src/components/Sidebar.tsx` (modified)

---

### 20.15 Coins Economy Wiring — COMPLETE
- **ConfettiEffect**: `src/components/ui/ConfettiEffect.tsx` — `triggerConfetti()` using canvas-confetti, respects prefers-reduced-motion. Fires on task completion when user owns confetti_unlock + activeCosmetics.confetti=true.
- **showCoinToast**: `src/lib/coins/showCoinToast.ts` — sonner toast for coin earn/spend. Called from TaskBoard (on task complete), FocusPage (on session complete).
- **Client wiring**: TaskBoard.tsx — `onTaskCompleted()` fires confetti + coin toast + updates useCoinsStore balance. FocusPage.tsx — reads coinsEarned from API response, calls showCoinToast + addEarnedCoins.
- **Daily brief trigger**: POST /api/coins/award-brief — awards 10 coins once per day on brief dismiss. Called from useDailyBriefStore.dismiss().
- **Planner trigger**: POST /api/planner-items — awards 15 coins when 3rd task planned today (deduped per day).
- **Docs triggers**: POST /api/docs — awards 15 coins for first doc ever. PATCH /api/docs/[id] — awards 10 coins for 500+ word doc (deduped per doc).
- **Streak shield**: POST /api/streaks/recover — checks consumables.streakShield > 0, decrements shield, restores streak, sets lastFocusDate to today. Returns { shieldUsed: true, restoredStreak, remainingShields }. Falls back to 402 if no shields.
- **LottieOverlay**: `src/components/ui/LottieOverlay.tsx` — fixed z-50 centered overlay, auto-dismiss after duration, AnimatePresence fade. For streak milestones and goal completion celebrations.
- Files: `src/components/ui/ConfettiEffect.tsx` (NEW), `src/lib/coins/showCoinToast.ts` (NEW), `src/components/ui/LottieOverlay.tsx` (NEW), `src/app/api/coins/award-brief/route.ts` (NEW), `src/components/tasks/TaskBoard.tsx` (modified), `src/components/pages/FocusPage.tsx` (modified), `src/store/useDailyBriefStore.ts` (modified), `src/app/api/planner-items/route.ts` (modified), `src/app/api/docs/route.ts` (modified), `src/app/api/docs/[id]/route.ts` (modified), `src/app/api/streaks/recover/route.ts` (rewritten)

### 20.16 Full App Polish Pass — COMPLETE
- **Loading skeletons**: ShopPage (6-card grid skeleton during `!dbHydrated`), TaskBoard list mode (8-row table skeleton during `!mounted`). GoalsPage already had skeleton.
- **PageTransition**: `src/components/ui/PageTransition.tsx` — wraps page content in AppShell with AnimatePresence `mode="wait"`. Fade+slide animation (opacity 0→1, y: 6→0, 150ms easeOut) on route changes keyed by pathname.
- **Cmd+K extended**: QuickSwitcher now searches Goals (active goals by title, shows progress % + timeframe badge, max 3) and Shop items (by name, shows cost, max 3). Results grouped: DOCS → TASKS → EVENTS → GOALS → SHOP → ACTIONS.
- **Accessibility**: TaskCard subtask chevron (aria-expanded, aria-label). TaskListView sort headers (aria-sort). TaskListView rows (role=row, keyboard Enter to open, tabIndex). GoalCard (role=button, keyboard Enter/Space, aria-label with progress %). Progress bars (role=progressbar, aria-valuenow/min/max). Focus rings (focus-visible:ring-2 on GoalCard, ShopItemCard, sort headers, subtask chevron).
- **Micro-interactions**: ShopItemCard hover:scale-[1.01] (150ms). GoalCard progress bar animates from 0 on mount (600ms, existing).
- **Consistency**: All new cards use p-4, bg-card, border border-border, rounded-xl. Same pattern as TaskCard.
- Files: `src/components/ui/PageTransition.tsx` (NEW), `src/app/(app)/AppShell.tsx` (modified), `src/components/pages/ShopPage.tsx` (modified: skeleton, hover, focus ring), `src/components/tasks/TaskBoard.tsx` (modified: list skeleton), `src/components/docs/QuickSwitcher.tsx` (modified: goals+shop search), `src/components/tasks/TaskCard.tsx` (modified: a11y), `src/components/tasks/TaskListView.tsx` (modified: a11y), `src/components/pages/GoalsPage.tsx` (modified: a11y)

### 20.17 Task Filter & Search Bar — COMPLETE
- **Store state (useTaskBoardStore)**: new fields `searchQuery`, `priorityFilter: TaskPriority[]`, `difficultyFilter: TaskDifficulty[]`, `dueDateFilter: DueDateFilter` ('all' | 'overdue' | 'today' | 'this_week' | 'next_week' | 'no_date' | 'has_date'). Actions: `setSearchQuery`, `setPriorityFilter`, `setDifficultyFilter`, `setDueDateFilter`, `clearAllFilters`. Persisted in the same `lumina_task_view_prefs` localStorage key as view prefs.
- **Filter engine**: `src/utils/taskFilters.ts` — pure `filterTasks()` (AND-composes all filters, search matches title/description/subtask titles), `hasActiveFilters()`, `activeFilterCount()` helpers. Uses date-fns (`startOfToday`, `isToday`, `isThisWeek`, `addDays`, `isWithinInterval`, `isBefore`) for due date logic.
- **Highlight utility**: `src/utils/highlightText.tsx` — wraps matching substrings in `<mark className="bg-primary/20 text-foreground rounded px-0.5 not-italic">`. Case-insensitive. Used in TaskCard + TaskListView title rendering.
- **TaskFilterBar** (`src/components/tasks/TaskFilterBar.tsx`): search input (debounced 250ms), Priority/Difficulty multi-select Radix Popovers (checkbox pattern, with Select All/Clear), Due date single-select Popover, Clear button (only when active). Desktop layout uses inline dropdowns. Mobile (< md): Priority/Difficulty popovers hidden, replaced with a single "Filters" button that opens a `MobileBottomSheet` containing all three filter sections + Clear/Done actions. Active count badge on mobile button when filters applied.
- **Integration**: TaskBoard memoizes `columnTasks` after filter (kanban shows filtered results), TaskListView filters root tasks before sort+group. Both show "Showing X of Y tasks" count line when filters active (AnimatePresence height animation). TaskListView shows "No tasks match your filters" empty state with Clear button when filtered result is 0 and raw count > 0.
- Files: `src/components/tasks/TaskFilterBar.tsx` (NEW), `src/utils/taskFilters.ts` (NEW), `src/utils/highlightText.tsx` (NEW), `src/store/useTaskBoardStore.ts` (modified), `src/components/tasks/TaskBoard.tsx` (modified), `src/components/tasks/TaskListView.tsx` (modified), `src/components/tasks/TaskCard.tsx` (modified)

### 20.18 Dashboard Widgets — COMPLETE
- **GoalsWidget** (`src/components/dashboard/GoalsWidget.tsx`): shows top 3 active goals sorted by end_date asc. Each row: emoji + title + progress % + days left badge (Overdue in destructive, Due today in amber, otherwise muted). Animated progress bar on mount. Empty state: "No active goals" with Create link. Skeleton while `!dbHydrated`.
- **CoinsWidget** (`src/components/dashboard/CoinsWidget.tsx`): large 🪙 balance (text-3xl bold tabular-nums) + last 3 transactions with label, signed amount (emerald for earn), and relative time (`formatDistanceToNow`). Empty state: encouraging copy. Skeleton while `!dbHydrated`.
- **TodaySummaryWidget** (`src/components/dashboard/TodaySummaryWidget.tsx`): 2x2 grid stat cells: Due today (calendar icon), Completed today (check icon), Focus time (clock icon, "Xh Ym"), Day streak (flame icon, amber). Data from `useTaskBoardStore`, `useFocusStore.sessionHistory`, `useStreakStore`. Skeleton while any store not hydrated.
- **Integration**: Added to `CalendarPage` between `DailyBriefCard` and the calendar grid, as a 3-col responsive grid (1 col mobile, 3 cols md+). Widgets use staggered Framer Motion mount animation.
- **Critical fix**: Changed GoalsWidget from `useGoalsStore(selectActiveGoals)` to `useGoalsStore(s => s.goals)` + `useMemo` — the selector returned a new array every render causing "getSnapshot should be cached" infinite loop. Pattern note: Zustand selectors that transform state (filter/sort/slice) must be wrapped in useMemo on the consumer side, or the selector must return stable references.
- Files: `src/components/dashboard/GoalsWidget.tsx` (NEW), `src/components/dashboard/CoinsWidget.tsx` (NEW), `src/components/dashboard/TodaySummaryWidget.tsx` (NEW), `src/components/pages/CalendarPage.tsx` (modified)

### 20.19 Duplicate Task Action — COMPLETE
- **API**: `POST /api/tasks/[id]/duplicate` — fetches original (ownership check), inserts new task with `title = "{title} (copy)"`, `status = 'todo'`, fresh `id/createdAt/updatedAt`, and clears `linkedEventId`/`linkedDocId`/`scheduledStart`/`scheduledEnd`/`remainingFocusTime`/`parentTaskId`. Returns the new task object. Subtasks are NOT duplicated. Coins are NOT awarded.
- **Store action**: `duplicateTask(taskId)` in `useTaskBoardStore` — optimistically inserts a copy at `order: 0` of the todo column (bumps siblings by +1), then POSTs. On success, swaps optimistic id for real id. On failure, removes the optimistic row + fires `toast.error("Couldn't duplicate task")`. Sets `recentlyDuplicatedId` for highlight flash.
- **UI**: New "Duplicate" item in the 3-dot dropdown menu on `TaskCard` (with `CopyIcon`) and `TaskListRow`. Both fire `toast.success('Task duplicated')`. No confirmation dialog — duplication is reversible.
- **Highlight flash**: When a card / row id matches `recentlyDuplicatedId`, applies `bg-primary/10` with a 600ms `transition-[background-color]`. Auto-cleared via `clearRecentlyDuplicated()` after 700ms timeout from inside the matching component.
- Files: `src/app/api/tasks/[id]/duplicate/route.ts` (NEW), `src/store/useTaskBoardStore.ts` (modified — added `duplicateTask`, `recentlyDuplicatedId`, `clearRecentlyDuplicated`), `src/components/tasks/TaskCard.tsx` (modified — `CopyIcon`, menu item, highlight class + auto-clear effect), `src/components/tasks/TaskListView.tsx` (modified — menu item, highlight class)

### 20.21 Focused Craft UI Polish Pass — COMPLETE (v22)
- **Aesthetic direction**: applied Anthropic's frontend-design skill principles — distinctive fonts, warm/cold palette, intentional hierarchy, subtle texture, editorial typography. Rebranded the app's visual language from "generic SaaS dashboard" to "well-crafted focused tool."
- **Typography migration**: dropped Google Fonts Inter entirely. Switched to **Geist Sans + Geist Mono** (via `geist` npm package, wired in `src/app/layout.tsx`) for body/numerals, and **Clash Display + Clash Grotesk** (self-hosted variable fonts under `/public/`) for display headings and the Lumina wordmark. Letter-spacing tightened to `-0.011em` body / `-0.025em` display. Stylistic sets `ss01`, `cv11` enabled on Geist.
- **Warm paper palette**: rewrote every CSS variable in `globals.css` to shift light-mode neutrals into the warm hue family (H 30–40°, low saturation). Dark mode got `--foreground: 36 20% 96%` warm off-white ink. See Section 4 table.
- **Grain overlay**: `body::before` pseudo-element renders an inline SVG `feTurbulence` noise as a data-URI — 0.035 opacity light / 0.045 opacity dark, `mix-blend-mode` flipped between modes. Zero HTTP requests, pure atmospheric depth.
- **Shadow system** (`tailwind.config.js`): added `shadow-card` / `card-hover` / `card-lift` tiers using warm ink `rgba(17,17,28,...)` instead of pure black. Legacy `shadow-soft / elevated / layered` preserved.
- **.card-lift utility** (`globals.css`): shared hover treatment — rest shadow → 1px lift + shadow bloom + border warming. Applied to GoalCard, ShopItemCard, TaskCard (non-drag), CoinsWidget, GoalsWidget, TodaySummaryWidget. Signature easing `cubic-bezier(0.16, 1, 0.3, 1)` exposed as Tailwind `ease-signature`. Includes `:focus-visible` parity and `prefers-reduced-motion` fallback.
- **Editorial page headers**: unified 3-layer treatment across TaskBoard, GoalsPage, ShopPage, PerformancePage, DocsHomePage, IntelligencePage, DailyPlanHeader, auth signin. Small-caps mono eyebrow (10px, 0.2em tracking) + font-display title (2xl→3xl, `-0.035em` tracking, medium weight) + italic supporting line. Hairline `border-b border-border/60` beneath.
- **Sidebar editorial refinement**: Clash Display 24px wordmark + "Focused Craft" tagline. Active nav item uses two shared `motion.div layoutId`s — `sidebar-active-nav-bg` (subtle wash) + `sidebar-active-nav-rail` (2px primary left rail). Streak displayed as `{value}` + `font-mono d · streak`. Workspace section label uses `text-[10px] font-medium uppercase tracking-[0.18em]`. Badges are mono numerals, no pill chips.
- **Empty states**: Goals page empty state rewritten as editorial moment — floating emoji + `font-display` headline ("A quiet slate.") + italic caption + outline button with PlusIcon. Replaces the old ghost-link text.
- **Button refinement**: unified 200ms signature easing across all color/transform/shadow transitions. `active:scale-[0.98]` press feedback. `outline` variant warms its border on hover (`hover:border-foreground/20`). Uses the new `transition-[background-color,border-color,color,transform,box-shadow]` split for clean interaction.
- **Commits**: `3eec6c6` typography + palette + grain (Phase 1), `1205394` sidebar editorial (Phase 2B), `e7f46dd` page headers (Phase 2A), `badbe76` cards (Phase 2C), `9cc22b5` empty states + buttons (Phase 3), `8f9b712` auth page (Phase 4), `c31eb2a` Insights + skeleton depth (Phase 5), `2d92c57` planner header (Phase 6).
- **Files touched**: `src/app/layout.tsx`, `src/app/globals.css`, `tailwind.config.js`, `src/components/ui/button.tsx`, `src/components/Sidebar.tsx`, `src/components/tasks/TaskBoard.tsx`, `src/components/tasks/TaskCard.tsx`, `src/components/pages/GoalsPage.tsx`, `src/components/pages/ShopPage.tsx`, `src/components/pages/PerformancePage.tsx`, `src/components/pages/DocsHomePage.tsx`, `src/components/pages/IntelligencePage.tsx`, `src/components/pages/CalendarPage.tsx`, `src/components/planner/DailyPlanHeader.tsx`, `src/components/dashboard/CoinsWidget.tsx`, `src/components/dashboard/GoalsWidget.tsx`, `src/components/dashboard/TodaySummaryWidget.tsx`, `src/app/auth/signin/page.tsx`.

### 20.22 Vitest Testing Layer — COMPLETE (v22)
- **Motivation**: before this pass the repo had zero tests. `tsc --noEmit` + `next build` only prove compile health, they don't verify behavior.
- **Runner**: Vitest 4 with jsdom environment. Config at `vitest.config.ts` (@ alias to `./src`, setupFiles pointing at `tests/setup.ts`, css: false so tests don't need Tailwind compilation).
- **Setup**: `tests/setup.ts` imports `@testing-library/jest-dom/vitest`, auto-cleans mounted React trees in `afterEach`, stubs `matchMedia` / `ResizeObserver` / `scrollTo` (Radix components crash in jsdom without them).
- **Scripts**: `npm test` (CI mode, single run), `npm run test:watch`, `npm run test:ui` (Vitest UI dashboard).
- **Current coverage — 84 tests across 7 files:**
  - `tests/design-system.test.ts` (15 tests) — reads `globals.css` / `tailwind.config.js` / `layout.tsx` as strings and asserts crafted tokens present: `.card-lift` utility with hover + focus-visible + reduced-motion fallback, signature cubic-bezier easing, warm paper HSL (hue 30s-40s), grain overlay via `body::before` with `feTurbulence`, Clash Display + Clash Grotesk `@font-face`s, `-0.025em` display tracking, shadow-card tiers, Geist font variables wired in layout, no lingering Inter references.
  - `tests/button.test.tsx` (8 tests) — renders default/outline/ghost/destructive/secondary/link variants, every size (default/sm/lg/icon), confirms signature easing + `active:scale-[0.98]` + outline warm hover, disabled state.
  - `tests/editorial-headers.test.ts` (16 tests across 5 pages + 2 extras) — reads each page source string and asserts: exact `Workspace · [Section]` eyebrow, mono uppercase 0.2em tracking, font-display title with `-0.035em` tracking. Auth page: Begin/Return eyebrows + shadow-card. Sidebar: font-logo wordmark.
  - `tests/goal-progress.test.ts` (15 tests) — pure function coverage of `computeTargetProgress` for every target type (`number` / `percentage` / `boolean` / `task_completion`) with clamping, divide-by-zero, and `computeGoalProgress` averaging + rounding.
  - `tests/shop-config.test.ts` (9 tests) — unique ids, positive integer costs, powerups consumable with `consumableKey`, cosmetics/unlocks non-consumable, every `accent_*` has a matching `ACCENT_COLORS` HSL entry in correct format, every item has name/desc/emoji, `SHOP_ITEM_MAP` count matches and resolves by id.
  - `tests/useCoinsStore.test.ts` (15 tests) — hydration populates state once (idempotent), `purchaseItem` rejects for unknown items / insufficient balance, consumable purchase increments counter, permanent purchase adds to `ownedItems`, server failure rolls back balance, `addEarnedCoins` caps transaction history at 50, selectors (`selectCoinBalance`, `selectOwnedItems`, `ownsItem`).
  - `tests/shop-item-icon.test.tsx` (6 tests) — every non-accent SKU has a registry entry, every `accent_*` id renders a swatch filled with the correct `ACCENT_COLORS` HSL, currentColor stroke for parent tinting, size prop honored, unknown-id fallback to neutral circle.
- **Mocking pattern**: `vi.mock('@/lib/persistence/coinsPersistence', …)` hoists mocks above store imports so Zustand stores can be tested in isolation without hitting the API.
- **Files**: `vitest.config.ts`, `tests/setup.ts`, `tests/*.test.{ts,tsx}`. Commit `9efda0c` (layer + first 78 tests), `146c295` (+6 shop-item-icon tests).

### 20.23 Shop SVG Icons — COMPLETE (v22)
- **Motivation**: emoji glyphs render differently on macOS / Windows / Android / Linux (different color palettes, outlines, proportions) — breaks the Focused Craft aesthetic. Replaced every shop emoji with hand-tuned outline SVGs on a 1.5px stroke matching the rest of Lumina's iconography.
- **Component**: `src/components/shop/ShopItemIcon.tsx` exports `<ShopItemIcon id={item.id} size={20} />` and a `SHOP_ICON_IDS` array. All icons use `stroke="currentColor"` so parent tiles can tint them (primary / violet / amber by category).
- **Registry** (12 line-icons): `focus_boost` (lightning bolt), `task_multiplier` (4-point sparkle), `streak_shield` (shield with inner flame), `goal_accelerator` (rocket with dashes), `auto_plan` (calendar + spark), `confetti_unlock` (party popper), `badge_deep_worker` (head + headphones), `badge_streak_master` (flame), `badge_goal_crusher` (trophy), `extended_history` (bar chart), `custom_categories` (tag with dot), `extra_templates` (stacked documents).
- **Accent swatches**: `accent_purple / rose / cyan / amber` are handled by a dedicated `<AccentSwatch>` variant that pulls the HSL from `ACCENT_COLORS` in `shopItems.ts` — the icon *is* the color you're buying. Outer ring in currentColor, filled inner circle at the accent HSL, white gloss highlight.
- **Shop page integration**: `src/components/pages/ShopPage.tsx` wraps the icon in a 40×40px tinted rounded-xl tile (`bg-primary/10 text-primary` for powerups, `bg-violet-500/10 text-violet-600` for cosmetics, `bg-amber-500/10 text-amber-600` for unlocks). Active-consumables chips also use the SVG inline with the count badge.
- **Data shape untouched**: `item.emoji` still lives in `shopItems.ts` as a fallback and for any consumer that needs a plain text representation. The SVG component is rendering-only.
- **Test coverage**: `tests/shop-item-icon.test.tsx` asserts every non-accent SKU in `SHOP_ITEMS` has a registry entry, every accent renders with the correct HSL fill, currentColor stroke is present, size prop is honored, unknown ids fall back to a neutral circle.
- **Files**: `src/components/shop/ShopItemIcon.tsx` (new), `src/components/pages/ShopPage.tsx` (icon tile integration), `tests/shop-item-icon.test.tsx` (new). Commit `146c295`.

### 20.24 Performance + Route Lag Fixes — COMPLETE (v23)
- **Lazy-loading**: GoalsPage dialogs (`GoalDialog`, `GoalDetailSheet`), TaskBoard dialogs (`TaskDialog`, `TaskScheduleDialog`) wrapped in `React.lazy` + conditional render. QuickSwitcher lazy in AppShell. Other AppShell modals (EventModal, TutorialOverlay, AmbientSoundDrawer, InstallPrompt) tried lazy but reverted to eager — Suspense on always-rendered modals caused route-change stalls.
- **canvas-confetti**: `triggerConfetti` in `ConfettiEffect` is now `async` — dynamic-imports `canvas-confetti` at call time instead of top-level import.
- **Removed dep**: `emoji-picker-react` removed from package.json (unused).
- **Bundle analyzer**: `@next/bundle-analyzer` added, `next.config.mjs` wraps config with `withBundleAnalyzer` when `ANALYZE=true`. npm script `"analyze"`.
- **Security headers** (v26): `next.config.mjs` exports `async headers()` applying to every route: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo/FLoC off), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, CSP with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Styles/scripts remain `unsafe-inline`/`unsafe-eval` for Next.js + framer-motion compatibility.
- **Per-field Zustand selectors**: full-store destructures (`const { a, b } = useStore()`) replaced with individual `useStore(s => s.field)` selectors across AppShell, Sidebar, CalendarPage, TimerCallout, useCalendar, EventModal, MonthView, DayView, WeekView, Profile. Only `OnboardingFlow` still uses bare `useCalendarStore()`.
- **Scoped theme transition**: global `* { transition: background-color 400ms }` moved to `html.transitioning-theme *` in `globals.css` — was the root cause of route-change lag (every element transitioned on mount).
- **PageTransition gutted**: `AnimatePresence mode="wait"` removed entirely, component is now a plain `<div>`. Eliminates exit-animation delay between routes.
- **Focus outlines killed**: `*:focus` and `*:focus-visible` set to `outline: none; box-shadow: none` globally in `globals.css`.
- **Task columns full height**: kanban flex wrapper changed from `items-start` to `items-stretch`. Skeleton wrapper accepts `className` for flex passthrough. Drop zone removed `min-h-[120px]`.
- **Calendar/planner scroll**: CalendarPage calendar container gets `overflow-y-auto`. DailyPlanView timeline wrapper gets `overflow-hidden`.
- **Sidebar wash**: active wash opacity softened from 4%/6% to 2.5%/4%. SidebarMenuButton stripped shadcn `bg-accent/70` fill on active — now relies on `font-medium` + foreground color + motion wash + 2px primary rail.
- Commits: `e20d007`, `879f8e8`, `c310af9`, `d0e0d9f`, `9a7a3bd`, `d80d630`, `22523ad`.

### 20.25 Dashboard Consolidation (DailyBriefStrip) — COMPLETE (v23)
- **Removed**: `TodaySummaryWidget`, `GoalsWidget`, `CoinsWidget` from CalendarPage. Earlier intermediate commits (`ea0f1f6` unify goals+coins into stat grid, `9561330` fold daily brief into Today widget header) were superseded.
- **New component**: `src/components/dashboard/DailyBriefStrip.tsx` — single horizontal strip replacing all three widgets. Contains greeting + date + chip row: meetings count, focus window time, due today, coins (links to `/shop`), goals (links to `/goals`), streak, completed today. Each chip: 12px icon + bold value + muted label. Scrolls horizontally on mobile.
- **Card treatment**: `rounded-2xl border bg-card shadow-card` wrapper (commit `1eae32a`).
- **MonthView**: `MAX_EVENTS_PER_CELL` tried bumping to 2, reverted to 1 (commit `1eae32a`).
- Commits: `ea0f1f6`, `9561330`, `3f16704`, `1eae32a`.

### 20.26 Palette Hygiene Pass — COMPLETE (v23)
- **Scope**: every remaining `text-gray-*`, `bg-gray-*`, `border-gray-*`, `bg-white` converted to semantic tokens across MomentumCircle, DayCalendarTimeline, TimeGridEvent, TimeSlotCell, DailyPlanView, TimerCallout, CalendarShared, AppShell, NotificationSettings.
- **CalendarShared.tsx rewrite**: extracted semantic class constants — `SURFACE_CLS`, `CELL_CLS`, `CELL_HOVER_CLS`, `HEADER_CLS`, `TIME_LABEL_CLS`, `WEEKDAY_LABEL_CLS`, `DATE_NUMBER_CLS`, `HOUR_LINE_CLS`, `QUARTER_LINE_CLS`, `TIME_SIDEBAR_CLS`, `GRID_CANVAS_CLS` — all using semantic tokens + `shadow-card` + `ease-signature`.
- **Guard test**: `tests/no-hardcoded-colors.test.ts` (4 tests) — uses `git grep` to assert zero matches of banned patterns (`text-gray-`, `bg-gray-`, `border-gray-`, `bg-white`) in `src/` files. Prevents regression.
- Commit: `9113be1`.

### 20.20 Boneyard Skeleton Migration — COMPLETE
- **Library**: `boneyard-js@^1.7.6` — auto-generates pixel-perfect skeletons from real DOM via a Playwright-powered CLI.
- **Pattern**: `<Skeleton name="..." loading={flag} fallback={<handcraftedSkeleton />}>{real content}</Skeleton>`. Boneyard's `Skeleton` wraps the real component and uses `fallback` until captured bones exist in the registry.
- **Key requirement**: real content MUST be the `children` of `<Skeleton>` (not a sibling branch), because boneyard snapshots children to generate bones. Pages previously using `{!mounted ? <skeleton> : <real>}` early-return patterns were restructured to wrap the real render with `<Skeleton loading={!mounted}>`.
- **Bones generated** (9 total, `npx boneyard-js build`): `dashboard.TodaySummaryWidget` (12 bones), `dashboard.GoalsWidget` (2), `dashboard.CoinsWidget` (3), `page.GoalsPage.grid` (3), `page.ShopPage.grid` (128), `tasks.TaskBoard.kanban` (13), `tasks.TaskBoard.list` (2), `planner.DailyPlanView` (107–118 responsive), `page.PerformancePage` (422). All written to `src/bones/*.bones.json`.
- **List view capture**: `viewMode` defaults to `'kanban'` so the list branch normally never mounts. TaskBoard has a build-only offscreen renderer (`isBoneyardBuild && viewMode === 'kanban'`) that mounts a second `<Skeleton name="tasks.TaskBoard.list">` at `position: absolute; left: -99999px` so the CLI can snapshot it without affecting the visible UI.
- **Onboarding bypass**: `src/app/(app)/AppShell.tsx` checks `window.__BONEYARD_BUILD` (set automatically by the CLI) and skips the onboarding redirect during `npx boneyard-js build` so the CLI can crawl protected routes. Zero production impact.
- **Import collision**: shadcn `<Skeleton>` primitive at `src/components/ui/skeleton.tsx` (simple `animate-pulse bg-muted` div) is still used inside fallback markup. Aliased as `SkeletonPrimitive` where boneyard's `Skeleton` is also imported.
- **Registry**: `src/bones/registry.js` auto-generated by CLI (contains `registerBones({ ... })`). Imported once in `src/app/providers.tsx` as a side-effect.
- **Regenerating bones**: start dev server, run `npx boneyard-js build` (auto-detects localhost:3000). Takes ~1 min to visit every route at 6 breakpoints.
- Files: `src/bones/*.bones.json` + `src/bones/registry.js` (CLI-generated), `src/app/providers.tsx` (registry import), `src/app/(app)/AppShell.tsx` (__BONEYARD_BUILD redirect bypass), `src/components/dashboard/GoalsWidget.tsx`, `src/components/dashboard/CoinsWidget.tsx`, `src/components/dashboard/TodaySummaryWidget.tsx`, `src/components/pages/GoalsPage.tsx`, `src/components/pages/ShopPage.tsx`, `src/components/pages/PerformancePage.tsx`, `src/components/tasks/TaskBoard.tsx`, `src/components/planner/DailyPlanView.tsx`, `package.json` (deps: `boneyard-js`, `playwright`)

---

## 21. FILE NAMING CONVENTIONS

- Components: `PascalCase.tsx`
- Hooks: `useXxx.ts`
- Stores: `useXxxStore.ts`
- Utilities: `camelCase.ts`
- API routes: `route.ts` inside directory
- Schemas: `schema/tableName.ts`

---

## 22. ENVIRONMENT VARIABLES REQUIRED

```
DATABASE_URL                   # Neon Postgres connection string
BETTER_AUTH_SECRET             # Session signing secret
BETTER_AUTH_URL                # Public base URL (e.g. https://yourdomain.com)
GOOGLE_CLIENT_ID               # Google OAuth app (identity login)
GOOGLE_CLIENT_SECRET
MICROSOFT_CLIENT_ID            # Azure AD app (identity login)
MICROSOFT_CLIENT_SECRET
GOOGLE_CALENDAR_CLIENT_ID      # Google OAuth app (calendar integration)
GOOGLE_CALENDAR_CLIENT_SECRET
GEMINI_API_KEY                 # Google Gemini (intelligence summaries)
NEXT_PUBLIC_APP_URL            # Same as BETTER_AUTH_URL, public-facing
VAPID_PUBLIC_KEY               # Web Push VAPID public key (server-side reference)
VAPID_PRIVATE_KEY              # Web Push VAPID private key (server-only, NEVER in client)
VAPID_SUBJECT                  # mailto:your@email.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY   # Same as VAPID_PUBLIC_KEY — exposed to client for PushManager.subscribe()
CRON_SECRET                    # Bearer token for Vercel cron job authentication
```

---

## 23. GIT / DEPLOYMENT

- Repo: GitHub (`bahrawyX/lumina`)
- Branch: `main`
- Deployment: Vercel (auto-deploy on push to main)
- Every commit to main triggers a new Vercel build

---

## 24. PWA + PUSH NOTIFICATIONS

### Architecture
- **Service worker**: `public/sw.js` — handles push events, notification clicks, offline fallback
- **Registration**: inline `<script>` in `layout.tsx`, production-only (`process.env.NODE_ENV === 'production'`)
- **Manifest**: `public/manifest.json` — standalone display, 4 icon sizes, 3 shortcuts
- **Offline**: `public/offline.html` — minimal dark-theme page, served by SW when navigation fails

### Push Flow
1. User opens NotificationSettings sheet (bell icon in sidebar)
2. `useNotificationStore.init()` checks browser support, fetches server prefs, syncs timezone
3. User clicks "Allow Notifications" → `requestPermission()` → browser prompt
4. On grant: `subscribe()` → `PushManager.subscribe()` with VAPID key → `POST /api/push/subscribe` (upsert)
5. Server sends via `sendPushToUser()` using `web-push` npm package with VAPID credentials
6. SW `push` event → `showNotification()` with icon, badge, actions
7. SW `notificationclick` → focus existing window or open new one at target URL

### Cron Jobs (vercel.json)
All run every 5 minutes. Protected by `CRON_SECRET` Bearer token via `verifyCronSecret()`.
- `/api/cron/daily-brief` — 8 AM user local time
- `/api/cron/event-reminders` — 10-15 min before event start (absolute timestamps)
- `/api/cron/streak-reminder` — 8 PM user local time

### Timezone
- `users.timezone` column (IANA string, default 'UTC')
- Synced from client browser on notification store init via PATCH `/api/users/notification-preferences`
- Cron routes use `Intl.DateTimeFormat` with user's timezone to compute local hour

### PWA Icons
Generated via `sharp` — purple (#6D59E0) background with white "L" letter.
Files: `pwa-64.png`, `pwa-192.png`, `pwa-512.png`, `pwa-512-maskable.png`, `badge-72.png`, `shortcut-*.png`

### iOS
- `apple-mobile-web-app-capable: yes`, `apple-mobile-web-app-status-bar-style: black-translucent`
- `globals.css`: `overscroll-behavior-y: none` + fixed body in standalone mode
- `InstallPrompt.tsx`: detects iOS and shows "Tap share → Add to Home Screen" instructions

### Install Prompt
- `InstallPrompt.tsx`: tracks visits in localStorage, shows after 3+
- Captures `beforeinstallprompt` event for Chrome/Edge native install
- Dismissal persisted — won't show again

---

## 25. LUMINA DOCS

### Architecture
Full document/knowledge system integrated into the app. Documents link to tasks, events, and focus sessions — unlike Notion/ClickUp where documents are isolated.

### Editor
- **BlockNote** (`@blocknote/react`, `@blocknote/core`, `@blocknote/shadcn`, `@blocknote/xl-multi-column`)
- Notion-style block editor; default slash menu disabled (`slashMenu={false}`)
- **Schema**: Extended via `withMultiColumn(BlockNoteSchema.create({...}))` which adds `columnList` and `column` block types. Custom `taskBlock` block spec added via `createReactBlockSpec` with `taskId` and `checked` props.
- **SSR**: `DocEditor` loaded via `next/dynamic` with `{ ssr: false }`. Page route wraps `DocPage` in `<div suppressHydrationWarning>` to prevent Next.js 16 Turbopack hydration crashes from BlockNote's client-only DOM.
- **Custom slash menu** — `LuminaSuggestionMenu` React component inside
  `DocEditor.tsx`. Replaces BlockNote's default suggestion menu entirely so styling
  is plain Tailwind (`w-64`, `max-h-72`, `bg-popover`, `border-border/60`),
  no CSS specificity wars with BlockNote's stylesheet.
- **Theme** — `BlockNoteView` receives `theme={resolvedTheme}` (string `'light'`|`'dark'`) from Lumina's own `useTheme` (`@/components/theme-provider`). The shadcn renderer sets `data-color-scheme` on `.bn-container` accordingly. CSS variables (`--bn-colors-*`) map to Lumina HSL tokens. `next-themes` is **not** in the tree.
- **Slash items** (built into `getLuminaSlashMenuItems`):
  - All BlockNote defaults (Headings, Basic Blocks, Lists, Image, Video, …)
  - **Audio** — native BlockNote `audio` block, group "Media"
  - **Task** — custom `taskBlock` with `taskId` prop, group "Lumina". Creates real task via `POST /api/tasks` first, then inserts block with returned ID. Checkbox syncs status bidirectionally via `lumina:taskblock-toggle` and `lumina:task-updated` CustomEvents.
  - **Columns** — opens `ColumnRatioPicker` popover with 6 ratio presets (50/50, 70/30, 30/70, 33/33/33, 50/25/25, 25/50/25). Inserts `columnList` block with `column` children at specified flex ratios.
  - **Callout** — `💡 ` prefix paragraph, group "Lumina"
  - **Divider** — long em-dash run, group "Lumina"
  - Each item has an inline-SVG `icon` rendered inside a 28×28 muted box.
- **Task block two-way sync**: `useTaskBoardStore.updateTask()` dispatches `lumina:task-updated` CustomEvent when status/title changes. DocEditor listens and updates matching `taskBlock` blocks. Removing a taskBlock from the doc triggers task archival via `PATCH /api/tasks/{id}`.
- Auto-save: 1000ms debounce, "Saving…"/"✓ Saved" indicator (text-only, emerald-500/60).
- **Keyboard shortcut guard**: AppShell's global `keydown` handler (single-key shortcuts like `p`, `t`, `f`, `n`, `g`, `m`, `w`, `d`) checks `e.target.isContentEditable` and `e.target.closest('[contenteditable]')` to bail out when the user is typing in the BlockNote editor. Without this, single-key presses would trigger navigation/actions instead of inserting characters.
- **Dark mode**: CSS `!important` overrides in `globals.css` force transparent backgrounds on BlockNote layers inside `.lumina-editor`. `BlockNoteView` receives `theme={resolvedTheme}` from the theme provider.
- **Last edited**: Relative time via `formatDistanceToNow` + `·` separator + save indicator.
- **AI assist slash command** (`/ai`, also triggered by aliases: `ask`, `generate`, `assist`, `gemini`) — group "Lumina". Opens `AIPromptInput` floating card below the cursor's anchor block. On submit, inserts a `✨ Generating…` placeholder paragraph, streams from `POST /api/docs/ai-stream` with `{ prompt, context }`, calls `editor.updateBlock` per streamed chunk, and removes the placeholder block on error or empty stream. 429 → `toast.error('AI assist limit reached. Try again in a minute.')`. Network errors → `toast.error('AI assist unavailable')`. The icon is a chat-bubble SVG (two lines inside a rounded rect).
- **`AIPromptInput` component** (`src/components/docs/AIPromptInput.tsx`) — fixed z-[60] card positioned below the anchor block. Chat-bubble icon, text input, `↵ send` mono chip (disabled below 3 chars). `Enter` submits; `Escape` cancels without mutation.

### Database
#### `docs` table
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto gen |
| user_id | uuid FK→users | cascade delete |
| parent_id | uuid | self-referential, nullable (max depth 5) |
| title | varchar(512) | default 'Untitled' |
| content | jsonb | BlockNote document JSON |
| content_text | text | plain text for FTS |
| icon | varchar(64) | emoji |
| cover_image | text | nullable |
| cover_gradient | integer | index into COVER_GRADIENTS array |
| is_archived | boolean | default false |
| is_pinned | boolean | default false |
| position | integer | sibling ordering |
| linked_task_id | uuid FK→tasks | SET NULL on delete |
| linked_event_id | uuid FK→events | SET NULL on delete |
| word_count | integer | default 0 |
| created_at / updated_at | timestamptz | |

Indexes: user_id, parent_id, (user_id, parent_id), linked_task_id, linked_event_id, GIN FTS on title+content_text.

#### Additional columns
- `tasks.linked_doc_id` (uuid, nullable)
- `tasks.parent_task_id` (uuid, nullable, self-ref FK → tasks.id ON DELETE CASCADE) — subtask hierarchy, NULL = root task
- `tasks.depth` (integer, NOT NULL, default 0) — 0=root, 1=subtask, 2=sub-subtask. Max 3 levels.
- Index: `tasks_parent_task_id_idx` on parent_task_id
- `events.linked_doc_id` (uuid, nullable)

#### Goals tables
- `goals` table: id(UUID PK), user_id(FK→users CASCADE), title(varchar 255), description(text), emoji(varchar 10), color(varchar 20 — semantic name: blue/green/purple/orange/red), status(enum: active/completed/archived), timeframe(enum: weekly/monthly/quarterly/yearly/custom), start_date(timestamptz), end_date(timestamptz), created_at, updated_at. Indexes: user_id, status.
- `goal_targets` table: id(UUID PK), goal_id(FK→goals CASCADE), title(varchar 255), description(text), type(enum: number/percentage/boolean/task_completion), current_value(numeric 10,2), target_value(numeric 10,2), unit(varchar 50), linked_task_ids(text — JSON array), order(int), created_at, updated_at. Index: goal_id.
- Relations: goals.user → users, goals.targets → many(goalTargets), goalTargets.goal → one(goals)

### API Routes
| Route | Method | Description |
|---|---|---|
| `/api/docs` | GET | Tree list (no content), sorted by pinned/position/updated_at |
| `/api/docs` | POST | Create doc, validates nesting depth ≤ 5 |
| `/api/docs/[id]` | GET | Full doc with content |
| `/api/docs/[id]` | PATCH | Update with 409 stale-write protection; returns `{ ok: true, updatedAt: string }` so the client can advance its baseline |
| `/api/docs/[id]` | DELETE | Soft delete (archive). `?hard=true` + `{confirm:true}` for permanent |
| `/api/docs/search` | GET | PostgreSQL FTS with `to_tsquery` prefix search (`:*` suffix), `ts_headline` `<mark>` excerpts, limit 20 |
| `/api/docs/ai-stream` | POST | Gemini streaming proxy, 10/min rate limit |

### Store: `useDocsStore` (src/store/useDocsStore.ts)
State: `docs`, `openDocId`, `openDocContent`, `expandedIds`, `dbHydrated`, `isSaving`, `lastSavedAt`, `searchQuery`, `searchResults`, `isSearching`
Actions: `hydrateFromDb`, `createDoc`, `updateDoc`, `archiveDoc`, `restoreDoc`, `deleteDoc`, `pinDoc`, `moveDoc`, `saveContent` (1000ms debounced), `search`, `clearSearch`, `openDoc`, `closeDoc`, `toggleExpanded`
Stale-write handling: `UpdateOneResult` in `docsPersistence.ts` is a discriminated union — `{ status: 'success'; updatedAt: string }` | `{ status: 'conflict' }` | `{ status: 'error' }`. Both `updateDoc` and `saveContent` advance the `lastSavedAt` / `openDocContent.updatedAt` on success so the next request always sends a current baseline. 409 from the server → `status: 'conflict'` → store shows a conflict toast without overwriting local edits.

### UI Components
| File | Description |
|---|---|
| `src/components/docs/SidebarDocsTree.tsx` | Full-featured sidebar tree (expand/collapse, context menu, inline rename, add subpage, emoji picker). Currently unused — replaced by inline tree in Sidebar.tsx |
| `src/components/Sidebar.tsx` (inline) | `SidebarDocsInlineTree` + `InlineDocItem` — compact nested doc tree rendered under the Docs nav item. Chevron toggle, 12px depth nesting, active doc highlight. Uses `useDocsStore.expandedIds` |
| `src/components/docs/DocEditor.tsx` | BlockNote wrapper with `lumina-editor` class, transparent bg, inherited font, custom `taskBlock` spec, multi-column schema, two-way task sync, `/ai` slash command with Gemini streaming |
| `src/components/docs/AIPromptInput.tsx` | Floating AI prompt card (z-[60]): chat-bubble icon, text input, `↵ send` chip. Enter → submit, Escape → cancel |
| `src/components/docs/ColumnRatioPicker.tsx` | Visual column ratio picker (6 presets), backdrop-blur popover, mobile note |
| `src/components/docs/DocBreadcrumb.tsx` | Parent chain navigation with 12px icons at each level |
| `src/components/docs/DocSaveIndicator.tsx` | "Saving..."/"Saved ✓" AnimatePresence |
| `src/components/docs/DocRightSidebar.tsx` | Doc info, linked task/event, focus time |
| `src/components/docs/DocsEmptyAnimation.tsx` | SVG animated empty state (floating clipboard + blinking cursor, 120x120) |
| `src/components/docs/QuickSwitcher.tsx` | Cmd+K global search overlay — docs section uses `/api/docs/search` API (200ms debounce) for prefix matching |
| `src/components/pages/DocsHomePage.tsx` | /docs — greeting, search, pinned grid (20px icons), recent list (14px icons), animated empty state |
| `src/components/pages/DocPage.tsx` | /docs/[id] — cover, CompactEmojiPicker icon selector, text-3xl title, editor, right sidebar. `skipNextBlurRef` guards `handleTitleBlur` from firing after an Escape-revert (prevents stale-value write race) |

### CSS Overrides (globals.css)
BlockNote editor themed via a mix of the `Theme` object (passed to
`BlockNoteView`) and a small set of overrides in `globals.css`:
- **Editor**: transparent background, inherited font family, 15px/1.7 line-height
- **Headings**: H1 text-3xl 700, H2 text-2xl 600, H3 text-xl 600
- **Slash menu**: **no CSS** — fully owned by `LuminaSuggestionMenu` (Tailwind)
- **Formatting toolbar**: 8px radius, 28px compact buttons, 15px SVG icons, primary-tinted active state (`data-state="on"`)
- **Code blocks**: JetBrains Mono, muted background, 8px radius
- **Drag handle**: hidden by default, 0.4 opacity on block hover, 0.8 on handle hover
- **Side menu** (plus + drag): 20×20px buttons, 14px icons
- **Tooltips**: neutral `--popover`/`--popover-foreground` instead of `bg-primary` (light mode friendly)
- **Dropdown menus**: `overflow: hidden`, no scrollbar flash on open (all menus, color picker, sub-content)
- **Selection**: browser defaults (all custom `::selection` overrides removed)
- **Block type selector dropdown**: Radix Select (`[role="listbox"]`) styled via CSS overrides — `--popover`/`--border` tokens, 160px min-width, no label truncation, themed hover/selected/checked states for both light and dark modes. Combobox trigger: 110px min-width, borderless, 13px font.
- **Shadcn renderer**: `@blocknote/shadcn` uses Radix primitives natively — no Mantine override needed. BlockNote toolbar, menus, and popovers inherit from Lumina's CSS variables via `--bn-colors-*` tokens.
- **Multi-column**: `.bn-column-list` flex row, `.bn-column` flex with `--column-width`, resize handles hidden until hover, mobile stacks vertically at 768px

### Multi-column layout
- **`@blocknote/xl-multi-column`** installed. Schema extended via `withMultiColumn()`.
- `/columns` slash command opens `ColumnRatioPicker.tsx` with 6 ratio presets.
- `columnList` block contains `column` children, each with `--column-width` CSS custom property for flex sizing.
- CSS overrides in `globals.css`: flex layout, 16px gap, resize handles (4px, border color, opacity transition), mobile stacking at 768px breakpoint.
- `multiColumnDropCursor` from the package enables drag-and-drop between columns.

### Icon Sizes
| Context | Size |
|---|---|
| Sidebar tree | 16px |
| Page header | 24px (text-3xl via emoji) |
| Cards (pinned) | 20px |
| Breadcrumb | 12px |
| Recent list | 14px |

### Pages
- `/docs` → `src/app/(app)/docs/page.tsx`
- `/docs/[id]` → `src/app/(app)/docs/[id]/page.tsx`

### Templates (src/lib/docs/templates.ts)
6 built-in: Meeting Notes, Project Brief, Weekly Review, Goal Setting, Daily Journal, SOP/Process Guide

### Integrations
- **TaskDialog**: "Linked document" section — search/link/unlink docs, "Create doc for this task"
- **EventModal**: "Meeting notes" section — create notes from template with event context, open/unlink
- **Quick Switcher**: Cmd+K searches docs + tasks + events + actions

### Mobile
- Cover hidden on mobile
- Right sidebar hidden, accessible via ··· menu button
- Pinned cards single column
- Mobile FAB for new doc
- Breadcrumbs: compact with immediate parent only

## 26. STANDALONE AUTH PAGE

### Route
`/auth/signin` → `src/app/auth/signin/page.tsx`

### Purpose
Guest-to-account conversion page. Linked from GuestBanner ("Create an account to save permanently →"). Replaces the previous flow of sending guests back through the full 9-step onboarding.

### Features
- Centered card layout with Lumina logo
- Sign in / Create account tab toggle (same UI as onboarding step 1)
- Email + password fields with inline Zod validation
- Google OAuth via popup (reuses `lumina:oauth-complete` message protocol)
- No "Continue as Guest" option (user is already a guest)
- "← Back" button

### On successful auth
1. `useOnboardingStore.getState().complete()` — prevents AppShell redirect to `/onboarding`
2. `useGuestStore.getState().setGuest(false)` — clears guest mode
3. `useTutorialStore.setState({ hasSeenPrompt: false, hasCompletedTutorial: false })` — resets tutorial so "New to Lumina? Explore" prompt reappears
4. `router.replace('/')` — redirects to home

### Key reuse
- `useLuminaAuthClient()` from `AuthProvider.tsx`
- OAuth popup pattern from `OnboardingFlow.tsx` (inlined as `useOAuthPopup` hook)
- Validation schemas from `src/lib/validation.ts`
- `GoogleProviderIcon` from `src/components/icons`

---

## 27. FOCUSED CRAFT DESIGN SYSTEM (v22)

### Intent
Make Lumina feel like a well-crafted tool rather than a generic SaaS dashboard. Applied the principles from Anthropic's frontend-design skill (`github.com/anthropics/skills/tree/main/skills/frontend-design`): distinctive fonts, warm vs cold palette, intentional hierarchy, subtle texture, editorial typography.

### Font stack
| Tailwind class | Family | Use |
|---|---|---|
| `font-sans` | Geist Sans (via `geist/font/sans`) | Body text, numerals in compact UI |
| `font-mono` | Geist Mono (via `geist/font/mono`) | Eyebrow labels, tabular numerals, code |
| `font-display` | Clash Display → Clash Grotesk fallback | Hero titles, large numerals |
| `font-logo` | Clash Display | Lumina wordmark |

**Important**: Inter / Roboto / Space Grotesk are explicitly banned. The test `tests/design-system.test.ts` asserts the config does not reference `'Inter'`.

### Palette shift
Light mode migrated to a **warm paper metaphor**. Hue values in the 30°–40° range (amber-tinted neutrals), low saturation. Dark mode also keeps a warm foreground (`36 20% 96%` off-white ink) instead of pure white. See Section 4 for the full HSL table.

### Grain overlay
```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  opacity: 0.035;  /* 0.045 in dark */
  background-image: url("data:image/svg+xml;utf8,<svg ...><filter id='n'><feTurbulence ... /></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  mix-blend-mode: multiply;  /* screen in dark */
}
```

### The `.card-lift` utility
Single CSS class applied via `className="card-lift ..."` on any card surface. Handles rest shadow, hover lift, focus-visible parity, reduced-motion fallback, and dark-mode shadow intensity in one place. Replaces ad-hoc `hover:shadow-md transition-shadow` patterns across the app. The signature `cubic-bezier(0.16, 1, 0.3, 1)` easing is also exposed as Tailwind `ease-signature` for other transitions.

### Editorial page-header rhythm
Every workspace page uses the same header pattern (see Section 4 for code). The three layers — mono eyebrow, display-weight title, italic supporting line — give every page a consistent "you are here" signal without needing breadcrumbs.

### Sidebar identity
- 24px Clash Display wordmark "Lumina" with "Focused Craft" tagline
- Active nav item uses two **shared Framer Motion `layoutId`s** (`sidebar-active-nav-bg` and `sidebar-active-nav-rail`) so the active indicator animates smoothly between items
- Section labels: `text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/50`
- Profile footer: top border-t, mono role text, 6px avatar radius
- Badges: mono small numerals (e.g. `3` for active goal count), no pill/chip backgrounds

### CalendarShared semantic rewrite (v23)
`CalendarShared.tsx` fully rewritten: all inline Tailwind classes extracted into named constants (`SURFACE_CLS`, `CELL_CLS`, `CELL_HOVER_CLS`, `HEADER_CLS`, `TIME_LABEL_CLS`, `WEEKDAY_LABEL_CLS`, `DATE_NUMBER_CLS`, `HOUR_LINE_CLS`, `QUARTER_LINE_CLS`, `TIME_SIDEBAR_CLS`, `GRID_CANVAS_CLS`) — each uses only semantic tokens, `shadow-card`, and `ease-signature`. Zero hard-coded grays remain anywhere in `src/`.

### Scoped theme transition (v23)
The global `* { transition: background-color 400ms }` was the root cause of route-change lag — every element animated on mount. Now scoped to `html.transitioning-theme *` so the transition only fires during theme switches. This single fix eliminated the perceived lag.

### Polish phase commit history
| Commit | Phase |
|---|---|
| `3eec6c6` | 1 — typography + warm palette + grain |
| `1205394` | 2B — sidebar editorial |
| `e7f46dd` | 2A — page headers editorial |
| `badbe76` | 2C — card depth + motion signature |
| `9cc22b5` | 3 — empty states + button refinement |
| `8f9b712` | 4 — auth page editorial |
| `c31eb2a` | 5 — Insights + skeleton depth |
| `2d92c57` | 6 — planner header |

---

## 28. TESTING LAYER

### Runner
Vitest 4 with jsdom — `vitest.config.ts` wires `@` → `./src`, points `setupFiles` at `tests/setup.ts`, and disables CSS processing (`css: false`) so tests don't need Tailwind.

### Setup (`tests/setup.ts`)
- Imports `@testing-library/jest-dom/vitest` for DOM assertions
- `afterEach(cleanup)` — unmounts React trees between tests
- Stubs for jsdom gaps: `matchMedia`, `ResizeObserver`, `scrollTo`

### Scripts
| Command | Use |
|---|---|
| `npm test` | Single run, CI-style |
| `npm run test:watch` | Watch mode |
| `npm run test:ui` | Vitest UI dashboard |

### Test files (102 tests total)
| File | Tests | Coverage |
|---|---|---|
| `tests/design-system.test.ts` | 15 | globals.css / tailwind.config / layout.tsx carry the crafted tokens (card-lift, signature easing, shadow-card, warm HSL, grain, Clash+Geist fonts) |
| `tests/button.test.tsx` | 8 | Every variant + size renders, signature easing + active:scale present, outline hover border warms |
| `tests/editorial-headers.test.ts` | 16 | Every page + auth + sidebar still ships the Workspace · [Section] eyebrow + -0.035em display title |
| `tests/goal-progress.test.ts` | 15 | `computeTargetProgress` for all 4 target types with clamping + divide-by-zero; `computeGoalProgress` averaging + rounding |
| `tests/shop-config.test.ts` | 9 | Unique ids, positive costs, powerup/consumable invariants, every `accent_*` maps to ACCENT_COLORS |
| `tests/useCoinsStore.test.ts` | 15 | Hydration idempotency, purchase success/rollback, insufficient funds, transaction cap, selectors |
| `tests/shop-item-icon.test.tsx` | 6 | Every SKU has icon, accent swatches use correct HSL, currentColor stroke, size prop, fallback |
| `tests/no-hardcoded-colors.test.ts` | 4 | Palette hygiene guard — `git grep` asserts zero `text-gray-*`, `bg-gray-*`, `border-gray-*`, `bg-white` in `src/` |
| `tests/seo.test.ts` | 14 | Guards SEO plumbing: metadataBase, title template, og/twitter/robots/alternates/viewport metadata, lang="en", robots.ts + sitemap.ts exist, `public/og.png` exists, og:image points to `/og.png`, (app) layout sets noindex, JSON-LD present |

### Patterns
- **String-level assertions** for design tokens: `readFileSync` → regex match. Fast, no render needed, catches accidental deletions.
- **Pure function tests** for all math (`computeGoalProgress`, `computeTargetProgress`) — zero mocking.
- **Zustand store testing**: `vi.mock('@/lib/persistence/…', …)` hoisted above store import, `useStore.setState({…})` to reset between tests in `beforeEach`.
- **RTL render tests** for stateless presentational components (Button, ShopItemIcon).
- **Config validation** for registries (shop items) to catch duplicate ids / missing fields.

### What is NOT covered (yet) — by this Vitest layer
- Full page integration tests (GoalsPage, ShopPage, TaskBoard) — they import stores + persistence + boneyard with deeply nested children. Worth adding later with MSW or fetch stubs.
- API route handler tests
- Visual regression (the E2E layer captures raw PNGs for manual review — see §33; pixel-diffing not wired up yet)

E2E coverage lives in a separate Playwright layer — see **§33. E2E TESTING LAYER**.

### Adding a new test
1. Drop a `*.test.ts` or `*.test.tsx` file under `tests/`.
2. Use the `@/` alias for all project imports.
3. For store tests, always mock the persistence module with `vi.mock` before importing the store.
4. Run `npm test`.

---

## 29. SHOP SVG ICON SYSTEM

### Component
`src/components/shop/ShopItemIcon.tsx` exports `<ShopItemIcon id={item.id} size={20} className={...} />`.

### Registry (12 line-icons)
| SKU id | Icon |
|---|---|
| `focus_boost` | Lightning bolt |
| `task_multiplier` | 4-point sparkle |
| `streak_shield` | Shield with inner flame |
| `goal_accelerator` | Rocket with motion dashes |
| `auto_plan` | Calendar + spark |
| `confetti_unlock` | Party popper |
| `badge_deep_worker` | Head + headphones |
| `badge_streak_master` | Flame |
| `badge_goal_crusher` | Trophy |
| `extended_history` | Bar chart |
| `custom_categories` | Tag with dot |
| `extra_templates` | Stacked documents |

### Accent swatches
`accent_*` ids use a dedicated `<AccentSwatch>` that:
- Pulls HSL from `ACCENT_COLORS` in `src/config/shopItems.ts`
- Renders an outer ring in `currentColor` at 0.35 opacity for contrast
- Renders a filled inner circle at the accent HSL
- Adds a white gloss highlight at `opacity 0.5`

The icon **is** the color being purchased.

### Integration
- **Card tile** (`src/components/pages/ShopPage.tsx`): 40×40px rounded-xl, tinted by category:
  - Powerup: `bg-primary/10 text-primary`
  - Cosmetic: `bg-violet-500/10 text-violet-600 dark:text-violet-400`
  - Unlock: `bg-amber-500/10 text-amber-600 dark:text-amber-400`
- **Active consumables chip**: uses `<ShopItemIcon size={12} />` inline with the count label.

### Fallback
Unknown `id` → renders a neutral 18px circle. Never throws.

### `item.emoji` still exists
The `emoji` field on `SHOP_ITEMS` rows is preserved in `src/config/shopItems.ts` for any consumer (toasts, mobile share sheets, notifications) that needs a text representation. The SVG component is rendering-only.

---

---

## 30. SESSION v24 CHANGES

### 30.1 Task Board Full-Height Columns — FIXED
- **Root cause**: Boneyard's `<Skeleton>` wraps children in a plain `<div data-boneyard-content>` that is `display: block` — breaks flex height chain.
- **Fix 1**: Global CSS rule in `globals.css` for `[data-boneyard-content="true"]` sets `flex: 1 1 0%; display: flex; flex-direction: column; min-height: 0`.
- **Fix 2**: Kanban flex wrapper changed from `h-full` to `flex-1 min-h-0` in `TaskBoard.tsx`.
- Columns now stretch to full viewport height.

### 30.2 Plan Day Timeline Scrollable — FIXED
- **Root cause**: `DayCalendarTimeline` scroll container had `flex-1` but missing `min-h-0`, causing it to expand to full content height (1920px) instead of being constrained by parent.
- **Fix 1**: Added `min-h-0` to DayCalendarTimeline's scroll container (`DayCalendarTimeline.tsx`).
- **Fix 2**: Added `className="flex-1 flex flex-col min-h-0"` to Boneyard `<Skeleton>` in `DailyPlanView.tsx`.
- Timeline now scrolls through full 24-hour day.

### 30.3 PlannedTaskCard Redesign — COMPLETE
- **Old**: flat primary-tinted card (`shadow-soft`, `bg-primary/5`), cramped 8px fonts, always-visible grip icon.
- **New**: `bg-card` surface with `shadow-card` / `shadow-card-hover`, 3px left accent bar (primary purple, emerald when done), `rounded-xl`, signature cubic-bezier easing, grip hidden until hover, refined checkbox, 12px title / 10px mono time labels.
- Block height multiplier increased from `0.75` to `0.9`, min height `20px` to `32px` in `DayCalendarTimeline.tsx`.
- Files: `src/components/planner/PlannedTaskCard.tsx` (rewritten), `src/components/calendar/DayCalendarTimeline.tsx` (height tweak).

### 30.4 Focus/Pomodoro Editorial Headers — COMPLETE
- `/pomodoro` page (`src/app/(app)/pomodoro/page.tsx`): added `Workspace · Focus` eyebrow, `Pomodoro` display title, italic supporting line, border-b separator. Content area restructured to `flex-1 min-h-0 overflow-y-auto`.
- `/focus` page (`src/components/pages/FocusPage.tsx`): added `Workspace · Focus` eyebrow, `Focus` display title, italic supporting line. Tabs component changed from `h-full` to `flex-1 min-h-0`.
- Both pages now match the editorial header pattern used across TaskBoard, GoalsPage, ShopPage, PerformancePage, DocsHomePage, IntelligencePage.

---

## 31. SESSION v25 CHANGES

### 31.1 Static OG Image — COMPLETE
- **Before**: `src/app/opengraph-image.tsx` and `src/app/twitter-image.tsx` were dynamic edge routes that rendered JSX via `ImageResponse` on every request.
- **After**: Both files deleted. `layout.tsx` `openGraph.images` and `twitter.images` both point to `'/og.png'` (served from `public/`).
- **File**: `public/og.png` — 1200×630 static image used for all social previews.
- **Why**: Static PNG is instantly cached by Vercel CDN; no cold-start edge invocation needed for every link share. Simpler, faster, more reliable.
- **Files changed**: `src/app/layout.tsx` (og/twitter image URLs), deleted `src/app/opengraph-image.tsx`, deleted `src/app/twitter-image.tsx`.

### 31.2 FeatureShowcase Reverted to Icon Cards — COMPLETE
- `src/components/landing/FeatureShowcase.tsx` stripped of all mockup image/video code. Back to clean icon + title + description card layout.
- No `Image`, no `<video>`, no `MockupFrame` component, no `Mockup` type.
- Six feature cards rendered in a `grid-cols-1 md:grid-cols-3` grid with `md:col-span-2` on Calendar and Documents.

### 31.3 Landing Page Components — DOCUMENTED
- **`src/components/landing/LandingPage.tsx`**: Top-level shell. Mounts `<CustomCursor />` (landing-only) and `<SmoothScroll />` (Lenis). Contains all landing sections.
- **`src/components/landing/LandingPageWrapper.tsx`**: Auth-aware wrapper rendered by `/` app route. Normally redirects authenticated users to `/calendar`. Accepts `?preview=1` query param to bypass the redirect — lets signed-in users view the landing page at `/?preview=1` without being kicked out.
- **`src/components/landing/CustomCursor.tsx`**: Custom cursor shown only on the landing page. Reads `--primary` CSS variable for theme awareness. Zone-aware: looks up the DOM for `data-cursor-label` / `data-cursor-color` attributes (set by `<CursorZone>`). Not mounted in the authenticated app shell — deliberately confined to landing.
- **`src/components/landing/HeroSection.tsx`**: Hero with Lottie animation via `useLottieHover` + `LOTTIES.hero`. Uses `<CursorZone>`. Do not modify without re-testing animation replay on hover.

### 31.4 SEO Test Added — COMPLETE
- `tests/seo.test.ts`: 14 static-analysis tests guarding SEO plumbing.
- Key assertions: `metadataBase`, title/template, `openGraph`, `twitter`, `robots`, `alternates`, `viewport.themeColor`, `lang="en"`, `robots.ts` + `sitemap.ts` existence, `public/og.png` existence, `og.png` referenced in layout, (app) layout has `noindex`, `JsonLd` component present.
- Test was updated in v25 to replace the check for the now-deleted `opengraph-image.tsx` with checks for `public/og.png` and the `/og.png` string in `layout.tsx`.

---

## 32. SESSION v26 CHANGES — Security Audit (2026-04-18)

Comprehensive read-the-code security audit across all ~40 API routes, auth flows, external integrations, and frontend rendering.

### 32.1 Cron Secret (CRITICAL fix) — `src/lib/cronAuth.ts`
- **Before**: `auth === \`Bearer ${process.env.CRON_SECRET}\`` — string equality via `===` (timing-unsafe), and if `CRON_SECRET` was unset it compared against the literal `"Bearer undefined"` (fail-open).
- **After**: fails closed when secret is absent or <32 chars; reads both `authorization` and `Authorization` header casings; uses `crypto.timingSafeEqual` via Node `node:crypto`.

### 32.2 Google OAuth CSRF (CRITICAL fix) — `src/lib/integrations/google/oauth.ts`
- **Before**: state was `JSON.stringify({ userId })` — predictable, passed over the URL, and the callback extracted `userId` from it without ever verifying it against anything stored server-side.
- **After**: state is `crypto.randomUUID()`, stored in an `httpOnly; SameSite=Lax; Secure` cookie (`lumina_google_connect_state`) with 10-min TTL. Callback verifies via `crypto.timingSafeEqual`. Integration row is bound to `session.user.id` from the authenticated session — not from the URL-supplied state.
- Google callback no longer leaks raw Google API error bodies to the client; full error is `console.error`'d server-side and the client gets a generic redirect.

### 32.3 Microsoft OAuth (defense-in-depth) — `src/lib/integrations/microsoft/oauth.ts`
- State cookie comparison was `!==` (timing-unsafe). Updated to use the same `safeEqual` helper.

### 32.4 Security Headers (HIGH fix) — `next.config.mjs`
- Added `async headers()` export applying a `securityHeaders` array to `/:path*`.
- Headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- CSP: `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`; styles/scripts remain `unsafe-inline`/`unsafe-eval` for Next.js + framer-motion inline styles.

### 32.5 RRULE DoS Pre-Validation (CRITICAL fix) — `src/lib/recurrence/rruleEngine.ts`, `src/app/api/events/route.ts`, `src/app/api/events/[id]/route.ts`
- **New export**: `validateRRule(rruleStr, dtstart): { ok: true } | { ok: false; reason: string }`.
- Rejects: sub-daily frequencies (`HOURLY`/`MINUTELY`/`SECONDLY`), `COUNT > 500`, `INTERVAL > 1000`, length > 500 chars, or invalid RRULE syntax.
- Wired into POST `/api/events` (before inserting `event_recurrence`) and PATCH `/api/events/[id]` with `editScope=all` (before updating the rule). Returns HTTP 400 with `{ error: "Invalid recurrence: <reason>" }`.

### 32.6 Rate Limiting (HIGH fix) — `src/lib/rateLimit.ts` (NEW), `src/app/api/intelligence/parse-event/route.ts`, `src/app/api/daily-brief/route.ts`
- **`src/lib/rateLimit.ts`**: shared `createRateLimiter(name, { windowMs, max })` — sliding-window in-memory per-key limiter. `rateLimitedResponse(retryAfterMs)` returns a 429 JSON response with `Retry-After` header. ⚠️ Per-process; replace the bucket store with Redis for multi-instance deployments.
- **parse-event**: 20 requests/min per user (Gemini calls cost money).
- **daily-brief `?refresh=true`**: 6 refreshes/hour per user. The uncached path runs Gemini narrative generation; the cached path remains unlimited.

### 32.7 Docs Search XSS (MEDIUM fix) — `src/app/api/docs/search/route.ts`
- **Before**: `ts_headline()` emitted `<mark>` tags into the raw excerpt, which `DocsHomePage` rendered via `dangerouslySetInnerHTML`. User-controlled `contentText` (e.g. `<script>…`) would appear as HTML.
- **After**: Postgres emits sentinel tokens (`\u0001LUMI_MARK_START\u0001` / `\u0001LUMI_MARK_END\u0001`). The API route HTML-escapes the entire excerpt (escaping `&`, `<`, `>`, `"`, `'`), then substitutes sentinels with `<mark>` / `</mark>`. Only the safe highlight tags survive as HTML.

### 32.8 npm audit — 0 vulnerabilities
- `npm audit fix` applied before the audit: 6 vulnerabilities (1 critical protobufjs, 4 high, 1 moderate) resolved via non-breaking updates. 18 packages changed. Post-fix: 0 vulnerabilities across 1036 packages.

### 32.9 Verified safe (no change)
- **IDOR**: all `UPDATE`/`DELETE` on user data filter `eq(table.userId, userId)` — confirmed for events, tasks, docs, goals, focus-sessions, push subscriptions, integrations.
- **Push send** (`/api/push/send`): hardcoded to `sendPushToUser(session.user.id, …)` — cannot target other users.
- **Raw SQL** (`sql\`…\``): every occurrence is a Drizzle parameterized template tag — no string interpolation of user input.
- **`dangerouslySetInnerHTML`**: `JsonLd.tsx` (`JSON.stringify` — safe), `layout.tsx` (static SW registration — safe). Docs search excerpt fixed above.
- **Open redirect**: OAuth callbacks redirect to `${baseURL}/auth/popup-complete` where `baseURL` comes from env or request origin — not from user input.
- **Secrets**: `.env*` gitignored; only `NEXT_PUBLIC_BETTER_AUTH_URL` is client-exposed (intentional).

### 32.10 Test count
- 102 Vitest tests across 9 files — unchanged.
- **+54 Playwright E2E tests** added in v26 across 12 specs under `tests/e2e/` — see §33.

### 32.11 Files changed in v26
```
 next.config.mjs                               | +53 (security headers)
 src/app/api/daily-brief/route.ts              | +17 (refresh rate limit)
 src/app/api/docs/search/route.ts              | +24 (XSS-safe excerpt)
 src/app/api/events/[id]/route.ts              | +10 (RRULE validation)
 src/app/api/events/route.ts                   | +16 (RRULE validation)
 src/app/api/intelligence/parse-event/route.ts | +13 (rate limit)
 src/lib/cronAuth.ts                           | rewrite (timing-safe)
 src/lib/integrations/google/oauth.ts          | rewrite (CSRF fix)
 src/lib/integrations/microsoft/oauth.ts       | +15 (timingSafeEqual)
 src/lib/recurrence/rruleEngine.ts             | +50 (validateRRule)
 src/lib/rateLimit.ts                          | NEW
 package-lock.json                             | npm audit fix
```

---

## 33. E2E TESTING LAYER (v26)

A new Playwright-based end-to-end layer complements the Vitest unit suite. Goal: catch crashes, hydration errors, and SPA-routing regressions across every app route without needing a human to click through the app.

### 33.1 Tooling

- **Playwright 1.59** — single-browser (`chromium`) + `chromium-mobile` project (Pixel 7 viewport).
- **dotenv** — `playwright.config.ts` requires `dotenv/config` before reading `process.env`, so `.env.local` (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.) is loaded for the spawned dev server.
- **Auto-webServer**: Playwright starts `npm run dev` on `http://localhost:3000` if it's not already running and waits for a 200 before invoking any spec. `reuseExistingServer: true` during local dev.

### 33.2 Directory

```
tests/e2e/
├── fixtures/
│   ├── guest.ts      ← seedGuest() + `test` extended with a `guestPage` fixture
│   └── helpers.ts    ← collectConsole(), waitForAppReady()
├── calendar.spec.ts
├── tasks.spec.ts
├── plan.spec.ts
├── pomodoro.spec.ts
├── focus.spec.ts
├── goals.spec.ts
├── performance.spec.ts
├── shop.spec.ts
├── intelligence.spec.ts
├── docs.spec.ts
├── navigation.spec.ts
└── visual/
    └── screenshots.spec.ts
```

### 33.3 Guest-mode fixture

The app doesn't hard-gate routes server-side — `AppShell` only redirects to `/onboarding` when `lumina-onboarding.state.completed` is false. The fixture exploits this: before any page loads, `context.addInitScript` seeds the three localStorage keys that Zustand persist middleware reads:

| Key | State shape | Purpose |
|---|---|---|
| `lumina-guest` | `{ isGuest: true, bannerDismissed: true }` | Enables guest-mode affordances, hides the amber banner |
| `lumina-onboarding` | `{ completed: true, step: 6, userName, workStart/End, timezone, focusPreference, focusSessionLength, … }` | Satisfies `useOnboardingStore.completed` gate |
| `lumina-tutorial` | `{ hasCompletedTutorial: true, hasSeenPrompt: true }` | Suppresses both the `TutorialOverlay` and the `TourPrompt` dismissible card. Shape must match `useTutorialStore`'s `partialize` exactly. |

All values are wrapped in the `{ state, version: 0 }` envelope that Zustand persist uses.

Export: `test` (extended Playwright test) with a `guestPage` fixture and `expect`.

```ts
import { test, expect } from './fixtures/guest';

test('...', async ({ guestPage: page }) => { /* page is already a seeded guest */ });
```

### 33.4 Console-noise filter — `helpers.ts`

`collectConsole(page).appErrors()` returns only error-level messages that represent real app bugs. It strips:

- `favicon`, `/api/auth/*`, `better-auth`, `service-worker`, `manifest.webmanifest`, `web-push`
- `net::ERR_ABORTED`, downloadable-fonts warnings, `[DEP0…]` Node deprecations
- Guest-mode-expected 401/403/404s from DB-backed API routes
- Next.js dev-mode noise: `[Fast Refresh]`, `[HMR]`, `Extra attributes from the server`
- SVG-path `Expected number` warnings (kept as a safety net even after the v26 BrownNoiseIcon fix — see §33.7)

`waitForAppReady(page, timeout = 15_000)` waits for:
1. Any element with `z-[9999]` class (the hydration overlay) to unmount
2. `networkidle`

### 33.5 Spec patterns

Each route spec follows the same shape:

```ts
test('renders X', async ({ guestPage: page }) => {
  const con = collectConsole(page);
  await page.goto('/route', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await expect(page).toHaveURL(/\/route/);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

  const errs = con.appErrors().map((e) => e.text());
  expect(errs, `console errors:\n${errs.join('\n')}`).toEqual([]);
});
```

- `navigation.spec.ts` visits every route in a data-driven loop, then clicks sidebar buttons by `aria-label` (they sit *over* the `<a>` element) and asserts `__navCount === 0` using a `beforeunload` counter to prove client-side routing.
- `docs.spec.ts` additionally hits an invalid doc id to verify the error boundary renders without crashing.

### 33.6 Visual capture — `visual/screenshots.spec.ts`

Writes full-page PNGs for every authenticated route (via `guestPage`) and every public route (via a plain fresh context) to `playwright-screenshots/`. `animations: 'disabled'` keeps frame variance down. Output directory is gitignored. This is **raw capture, not pixel-diff regression** — humans (or a `Claude-in-Chrome` session) can eyeball them.

### 33.7 BrownNoiseIcon SVG-path fix (v26)

Root cause of the flood of `<path> attribute d: Expected number` warnings on `/pomodoro` and `/focus`: `src/components/ui/AnimatedIcons.tsx::BrownNoiseIcon` used framer-motion's `animate={{ d: [...] }}` to morph between two SVG paths. framer-motion's `d` interpolation serializes adjacent positive integers without a separator, so midway through the tween the attribute becomes e.g. `M6 12c2 2 4 2 6 0s4 2 6 0` → `…c2 2 426 0s…`, which the browser SVG parser rejects. Fix: replace the single `<motion.path>` with **two static `<motion.path>` elements cross-fading via `animate={{ opacity: [1, 0, 1] }}` / `[0, 1, 0]`**. No `d` mutation, no console noise. See AnimatedIcons.tsx lines ~455–485.

### 33.8 Scripts

| Command | Use |
|---|---|
| `npm run test:e2e` | Full headless run (both projects) |
| `npm run test:e2e:ui` | Playwright UI mode (time-travel debugging) |
| `npm run test:e2e:headed` | Watch the browser drive the app |
| `npm run test:e2e:debug` | `PWDEBUG=1`, pauses at `await page.pause()` |

### 33.9 What is NOT covered

- **Real authenticated flows** (sign-up, sign-in, OAuth popup). Guest-mode is a deliberate proxy to avoid BetterAuth + Neon in CI.
- **Write operations** that depend on DB-backed API routes (create task, create event, start focus session) — they'd 401 in guest mode. Worth adding later with a test-seeded DB user.
- **Pixel-diff visual regression** (`@playwright/experimental-ct-react` or `toMatchSnapshot`) — we only capture raw PNGs today.
- **Cross-browser** (WebKit, Firefox) — Chromium-only because the dev server is Next.js turbopack which occasionally glitches on non-Chromium.
- **Mobile sidebar / drawer interactions** beyond viewport-only checks. The `chromium-mobile` project exists but most specs assert only that the page renders without errors.
- **A11y audits** — not wired into the E2E layer (worth adding `@axe-core/playwright`).

### 33.10 Adding a new spec

1. Create `tests/e2e/<area>.spec.ts`.
2. Import from the local fixture: `import { test, expect } from './fixtures/guest';`.
3. Use `guestPage` (not `page`) to get a seeded guest context.
4. Call `waitForAppReady(page)` after every `goto`.
5. Assert on `collectConsole(page).appErrors()` at the end — add any legitimate 3rd-party noise you find to the IGNORE array in `helpers.ts`.
6. Run `npm run test:e2e -- <spec-name>` to iterate.

### 33.11 Files added in v26 (E2E)

```
playwright.config.ts                              | NEW
tests/e2e/fixtures/guest.ts                       | NEW
tests/e2e/fixtures/helpers.ts                     | NEW
tests/e2e/calendar.spec.ts                        | NEW
tests/e2e/tasks.spec.ts                           | NEW
tests/e2e/plan.spec.ts                            | NEW
tests/e2e/pomodoro.spec.ts                        | NEW
tests/e2e/focus.spec.ts                           | NEW
tests/e2e/goals.spec.ts                           | NEW
tests/e2e/performance.spec.ts                     | NEW
tests/e2e/shop.spec.ts                            | NEW
tests/e2e/intelligence.spec.ts                    | NEW
tests/e2e/docs.spec.ts                            | NEW
tests/e2e/navigation.spec.ts                      | NEW
tests/e2e/visual/screenshots.spec.ts              | NEW
src/components/ui/AnimatedIcons.tsx               | BrownNoiseIcon d-attr → opacity cross-fade
package.json                                      | +4 test:e2e scripts, +playwright devDep
.gitignore                                        | +playwright-screenshots/, +test-results/, +playwright-report/
```

---

## 34. SESSION v27 CHANGES (2026-04-19)

Three small but load-bearing changes. One is a real security hardening, one is a UX dedup, and one is a documentation fix to prevent future phantom work.

### 34.1 Sign-in autofill hardening — `src/app/auth/signin/page.tsx`

**Problem.** After a user signed out and returned to `/auth/signin`, the browser autofilled both email AND password into the form. Because the submit button was a plain `<button type="button">` (no form submit guard) and the fields pre-populated, a second person on a shared device could log straight in without typing anything.

**Root cause.** The password input used `autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}`. `current-password` is the browser-standard opt-in to saved-password autofill — correct for most apps, wrong for this threat model.

**Fix.** Force the password field to `autoComplete="new-password"` in both modes. Browsers treat `new-password` as a "create-new" field and skip saved-credential autofill, while still letting password managers offer to *save* new passwords during sign-up. Belt-and-braces, also set `data-lpignore="true"` and `data-1p-ignore="true"` (1Password + LastPass inline-fill heuristics) and change the `name` to a non-standard token so legacy extensions don't pattern-match on "password". Email field is unchanged — `autoComplete="email"` still allows the account picker (good UX; it's just the identifier).

**Sign-out cookie behavior verified.** `Sidebar.tsx:handleSignOut` calls `authClient.signOut()` (BetterAuth server endpoint clears the httpOnly session cookie) and then `window.location.href = '/'` — a hard reload, no React re-render race. The signin page also early-returns to `/calendar` if `session?.user` is still present on mount, so if BetterAuth ever failed to clear the cookie the user would be routed away from signin entirely (no half-authed state exposes the form). No change needed here.

**How to verify manually.**
1. Sign in with email + password
2. Click Sign out in the sidebar → full reload to `/`
3. Navigate to `/auth/signin`
4. Email field may auto-fill (by design). Password field **must be empty**.

### 34.2 Onboarding calendar step — single context-aware button — `src/components/OnboardingFlow.tsx`

**Problem.** Step 6 (`StepCalendarSync`) had both a global footer "Continue" button AND an in-step "Skip — I don't use a calendar right now" link. Both fired the same `goNext` action. The footer button was always enabled because `canContinue()` returns `true` for this step (it's intentionally skippable). Users reported this as confusing.

**Fix.**
- Removed the in-step Skip button and the `onSkip` prop from `StepCalendarSync`.
- Footer button is now context-aware:
  - `step === 6` && no calendar connected → label `Skip for now`, outline/secondary styling, no arrow.
  - `step === 6` && at least one calendar connected → label `Continue`, primary filled styling, arrow.
  - All other steps → unchanged.
- `showArrow` and `label` are computed inline in an IIFE inside the JSX so the existing prop contract of the footer button survives.

No behavioral regression: `canContinue()` still returns `true` on this step, so the button is always clickable; only the visual treatment and label change based on connection state.

### 34.3 CODEBASE_REFERENCE correction — planner DB persistence was never a stub

A v27 task was filed asking to "wire the planner_items schema to a real API" and "replace the no-op persistence stub" with 8 phases of implementation. After Phase 0 reading it became clear the work had been done already (v20), the URL convention was just different from what the task author expected:

| What the task assumed | What actually exists |
|---|---|
| `POST /api/planner` | `POST /api/planner-items` (functionally identical) |
| Stub `plannerPersistence.ts` with no-op exports | Full `fetchAllForCurrentUser` / `createOne` / `createMany` / `updateOne` / `deleteOne` — only `migrateMany` is deliberately deferred (future localStorage-import flow) |
| `scheduledItems` persisted to Zustand `persist` middleware | Store uses no `persist` wrapper at all — DB is the sole source of truth |
| Bootstrap not calling planner | `PersistenceBootstrap.tsx:161-167` already in the `Promise.allSettled` hydration block |
| Missing optimistic updates | All 5 write actions (`addPlanItem`, `batchAddPlanItems`, `removePlanItem`, `removeAllByTaskId`, `updatePlanItem`) already optimistic with rollback + retry toast |
| `isAutoScheduled` boolean missing from store | Not needed by the UI; DB stores it for the coin-award side effect (award 15 coins when user has planned exactly 3 tasks for today) |

**Decision:** Do not duplicate the endpoints at `/api/planner/*`. Do not touch the working implementation. Row #3 of §19 now points here so future readers don't repeat the investigation.

### 34.4 Planner persistence reference — canonical paths

```
DB table                 → src/db/schema/plannerItems.ts
  planner_items            (FK cascade on users.id + tasks.id,
                            user_id+start_time index,
                            end_time > start_time CHECK)

API routes               → src/app/api/planner-items/route.ts      (GET + POST)
                           src/app/api/planner-items/[id]/route.ts (PATCH + DELETE)

Client adapter           → src/lib/persistence/plannerPersistence.ts
                           (ISO ↔ HH:mm conversion)

Store                    → src/store/useDailyPlanStore.ts
                           (plansByDate, dbHydrated, optimistic actions)

Hydration                → src/components/PersistenceBootstrap.tsx (line 161-167)
```

### 34.5 Files changed in v27

```
src/app/auth/signin/page.tsx          | password autoComplete + LP/1P ignore attrs
src/components/OnboardingFlow.tsx     | drop onSkip prop, remove in-step Skip,
                                        context-aware footer label
CODEBASE_REFERENCE_Lumina_Next.md     | v27 header, §19 row 3 expanded, §34 NEW
```

### 34.6 Test count (unchanged)
- 102 Vitest tests, 54 Playwright tests — no new specs added (both fixes are covered by existing auth + onboarding smoke tests).

---

## 35. SESSION v28 CHANGES — Mobile polish for Android Chrome (2026-04-19)

The app rendered on Pixel-class mobile viewports but had several P0 usability
blockers: the Task Board kanban was unusable at 412px, the Calendar week grid
compressed 7 columns into ~58px each, and input focus triggered iOS/Android
auto-zoom because inline font-sizes were below the 16px threshold. v28 lands
an audit-driven sweep: capture before screenshots → apply targeted
`useIsMobile()` overrides (desktop layout is byte-for-byte unchanged) →
capture after screenshots → add a mobile-tagged Playwright spec.

### 35.1 Input zoom prevention (P0)

`src/app/globals.css` gains a single media query:

```css
@media (max-width: 768px) {
  input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='color']),
  textarea,
  select {
    font-size: 16px;
  }
}
```

Both iOS Safari and Android Chrome auto-zoom any focused input whose
computed font-size is below 16px. The zoom locks the viewport and forces
the user to pinch-out afterwards — a small pain that repeats dozens of
times a session. The rule is scoped to ≤768px so desktop typography is
completely untouched.

### 35.2 Task Board force-list on mobile (P0)

`src/components/tasks/TaskBoard.tsx`:
- imports `useIsMobile`
- renames the store selector to `storedViewMode`
- computes the effective `viewMode` as `isMobile ? 'list' : storedViewMode`
- hides the view-switcher on mobile via `hidden md:flex`

The store value is never mutated — the user's desktop preference is
preserved and re-applies as soon as the viewport crosses the breakpoint.

### 35.3 Calendar force-day on mobile (P0)

`src/components/pages/CalendarPage.tsx`:
- imports `useIsMobile`
- renames the store selector to `storedView`
- maps `isMobile && storedView === ViewType.WEEK` → `ViewType.DAY`
- wraps the Month/Week/Day tabs in `hidden md:block`

A 7-column grid at 412px gives ~58px per column — too narrow for event
titles. Day view is the only readable option on mobile. Month view still
works on mobile and is kept accessible via the mobile bottom nav (which
doesn't go through the view-switcher tabs).

### 35.4 Contribution heatmap horizontal scroll (P1)

`src/components/performance/contributions/ContributionGrid.tsx` wraps its
year-wide grid in `overflow-x-auto no-scrollbar -mx-2 px-2` so the grid
pans horizontally instead of stretching the page width beyond the
viewport. `no-scrollbar` hides the scrollbar on desktop where the grid
fits naturally.

### 35.5 Mobile Playwright spec

New `tests/e2e/mobile.spec.ts` (14 tests, tagged `@mobile`):
- **No horizontal overflow** — 10 parametrised tests, one per guest route,
  asserting `document.documentElement.scrollWidth ≤ clientWidth + 1`
- **Task Board force-lists** — H1 reads "Tasks" (not "Task Board") and
  the kanban toggle is hidden
- **Calendar force-day** — seeds `view=week` in localStorage and asserts
  the Week tab is hidden (so Day view is rendered instead)
- **Input zoom prevention** — computed font-size on both email + password
  inputs on `/auth/signin` is ≥ 16px
- **Bottom-nav positioning** — visible and pinned to the bottom third of
  the viewport on `/tasks`

`playwright.config.ts` — `chromium-desktop` project gains
`grepInvert: /@mobile\b(?!.*@cross)/` so mobile-only specs run only on
`chromium-mobile` (14 audit + 14 screenshot specs under that project).

### 35.6 Before/after screenshot spec

`tests/e2e/visual/mobile-screenshots.spec.ts` accepts a
`MOBILE_SNAPSHOT_DIR` env var that controls the subdirectory under
`playwright-screenshots/`. A before/after pair can be captured without
duplicating the spec:

```bash
MOBILE_SNAPSHOT_DIR=mobile        npx playwright test --project=chromium-mobile mobile-screenshots
MOBILE_SNAPSHOT_DIR=mobile-after  npx playwright test --project=chromium-mobile mobile-screenshots
```

14 routes × 2 runs = 28 images under
`playwright-screenshots/mobile/` and `playwright-screenshots/mobile-after/`.

### 35.7 Files touched

```
src/app/globals.css                                  | @media (max-width:768px) 16px rule
src/components/tasks/TaskBoard.tsx                   | useIsMobile + force-list + hide toggle
src/components/pages/CalendarPage.tsx                | useIsMobile + map week→day + hide tabs
src/components/performance/contributions/ContributionGrid.tsx | overflow-x-auto wrap
playwright.config.ts                                 | grepInvert for mobile-only specs
tests/e2e/mobile.spec.ts                             | 14 new mobile audit tests
tests/e2e/visual/mobile-screenshots.spec.ts          | env-var-driven screenshot spec (already existed)
CODEBASE_REFERENCE_Lumina_Next.md                    | v28 header + §35 NEW
```

### 35.8 Test count

- Vitest: 102/102
- Playwright desktop: 54/54
- Playwright mobile: 28/28 (14 audit + 14 visual)

### 35.9 Desktop parity

All three `useIsMobile()` overrides compute `isMobile` at runtime via the
SSR-safe matchMedia hook. Behind `>=768px` the hook returns `false` so
every change is a strict no-op on desktop. No store writes, no DOM
changes, no layout shifts. Desktop visual regression (54 screenshots
under `playwright-screenshots/desktop/`) is unchanged.

---

## 36. SESSION v29 CHANGES (2026-04-25)

Three clusters of work across two committed sessions (`0a0a03e` and `b196ce6`).

---

### 36.1 Docs — P0 stale-write race (`src/app/api/docs/[id]/route.ts`, `src/lib/persistence/docsPersistence.ts`, `src/store/useDocsStore.ts`)

**Problem.** After a user edited a doc title, the server processed the PATCH but the response body was `{ ok: true }` with no timestamp. The client never advanced its `lastSavedAt` baseline. The next content auto-save used the stale timestamp → server returned 409 "conflict" → save silently failed.

**Root cause.** Drizzle `update().set().where()` was not chained with `.returning()`, so the server-authoritative `updatedAt` was never sent back to the client.

**Fix.**
- `PATCH /api/docs/[id]` now uses `.returning({ updatedAt: docs.updatedAt })` via Drizzle and returns `{ ok: true, updatedAt: string }`.
- `docsPersistence.ts` — `UpdateOneResult` changed from a string union to a discriminated union: `{ status: 'success'; updatedAt: string } | { status: 'conflict' } | { status: 'error' }`.
- `useDocsStore.updateDoc` — on success, syncs `result.updatedAt` into `openDocContent.updatedAt`.
- `useDocsStore.saveContent` — on success, sets `lastSavedAt: result.updatedAt` and syncs `openDocContent.updatedAt`.

**Effect.** Title edit → content auto-save → no 409. Each successful write advances the baseline.

---

### 36.2 Docs — P1 Escape-revert race (`src/components/pages/DocPage.tsx`)

**Problem.** Pressing Escape in the title input called `setTitle(previous)` (async React state update) then `.blur()` (synchronous DOM). The `blur` event fired before the state update landed, so `handleTitleBlur` read the still-dirty value and issued a PATCH with the typed (not reverted) text.

**Fix.** Added `skipNextBlurRef = useRef(false)`. The Escape handler sets it to `true` before calling `.blur()`; `handleTitleBlur` checks and short-circuits if `true`, then clears the ref.

---

### 36.3 Docs — AI assist slash command (`src/components/docs/DocEditor.tsx`, `src/components/docs/AIPromptInput.tsx`)

New `/ai` slash command in the BlockNote editor (group "Lumina", aliases: `ai`, `ask`, `generate`, `assist`, `gemini`).

**`AIPromptInput` component** — fixed-position floating card rendered when `aiPrompt` state is non-null. Positioned below the anchor block using `document.querySelector('[data-id="${blockId}"]')` getBoundingClientRect; falls back to selection rect. Chat-bubble SVG icon. `Enter` submits (min 3 chars), `Escape` cancels.

**`handleAISubmit` flow**:
1. Inserts a `✨ Generating…` placeholder paragraph below the anchor block.
2. POST `/api/docs/ai-stream` with `{ prompt, context }`.
3. `ReadableStream.getReader()` — reads chunks, calls `editor.updateBlock` per chunk to stream content into the placeholder.
4. On empty stream → `editor.removeBlocks([placeholderId])`.
5. On network error → remove placeholder + `toast.error('AI assist unavailable')`.
6. On 429 → remove placeholder + `toast.error('AI assist limit reached. Try again in a minute.')`.

**Icon**: chat-bubble SVG (`<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5...">`).

---

### 36.4 Planner — P0 UUID resolver registry (`src/store/useTaskBoardStore.ts`, `src/store/useDailyPlanStore.ts`)

**Problem.** Tasks created via the quick-add flow use `uid()` (a short non-UUID string) as their optimistic ID. `POST /api/planner-items` validates `taskId` with Zod `.uuid()` and rejects non-UUIDs with 400. A user who drags a freshly added task to the timeline before the `addTask` DB round-trip completes would silently fail to save the plan item.

**Fix.** Module-level resolver registry in `useTaskBoardStore.ts`:

```ts
// Module-level (not Zustand state)
const optimisticIdResolveMap = new Map<string, string | null>();
const optimisticIdWaiters = new Map<string, Array<(dbId: string | null) => void>>();

export function resolveTaskDbId(taskId: string, timeoutMs = 5000): Promise<string | null>
```

- If `taskId` is already a UUID → resolves immediately.
- Otherwise → waits for `notifyOptimisticIdResolved(optimisticId, dbId)` fired by `addTask`'s DB callback, or times out after 5 s returning `null` (causes the plan item add to roll back).
- `addTask` calls `notifyOptimisticIdResolved` on every outcome: success (passes DB UUID), failure (passes `null`), or when `dbId === task.id` (already a UUID, no-op waiter).

`useDailyPlanStore.addPlanItem` and `batchAddPlanItems` await `resolveTaskDbId` before the persistence call; patch local `taskId` if the DB UUID differs from the optimistic one; drop items whose task never arrived in the DB.

---

### 36.5 Planner — P1 `removeAllByTaskId` rollback fix (`src/store/useDailyPlanStore.ts`)

**Problem.** The per-item `.catch(() => null)` inside `Promise.all` silently absorbed individual deletion failures, making the outer `.catch` unreachable. The snapshot therefore never rolled back on partial failure.

**Fix.** Each deletion is mapped to `.then(() => true, () => false)`; if any result is `false` the snapshot is restored and a save-error toast is shown.

---

### 36.6 Planner — Mobile tab switcher (`src/components/planner/DailyPlanView.tsx`)

New `mobileTab: 'pool' | 'timeline'` state. A `role="tablist"` bar above the two columns switches visibility on small screens:
- Pool column: `${mobileTab === 'pool' ? 'flex' : 'hidden'} md:flex`
- Timeline column: `${mobileTab === 'timeline' ? 'flex' : 'hidden'} md:flex`

Desktop layout is byte-for-byte unchanged (both columns always `md:flex`).

---

### 36.7 Planner — Date navigation (`src/store/useDailyPlanStore.ts`, `src/app/api/planner-items/route.ts`, `src/components/planner/DailyPlanView.tsx`, `src/components/planner/DailyPlanHeader.tsx`, `src/components/planner/TodayTimeline.tsx`)

**`useDailyPlanStore` additions**:
- `viewDate: string` — which YYYY-MM-DD the planner UI is showing; defaults to today; session-only (no localStorage / DB persistence).
- `setViewDate(date)` — validates with `isValidDate`; no-ops on invalid input.

**`GET /api/planner-items`** now accepts `?date=YYYY-MM-DD`. Validates with `DATE_PARAM_RE`. Computes `[startBound, endBound)` as `[local midnight on date, local midnight on date+1)` and adds SQL `>=`/`<` conditions. Without the param, returns all items (existing behaviour preserved).

**`DailyPlanView.tsx`**:
```ts
const viewDate = useDailyPlanStore((s) => s.viewDate);
const isViewingToday = viewDate === today;  // "today" = format(new Date(), 'yyyy-MM-dd')
const viewDateAsDate = useMemo(() => parseISO(viewDate), [viewDate]);
const navigateDay = useCallback((delta) =>
  setViewDate(format(addDays(parseISO(viewDate), delta), 'yyyy-MM-dd')), [viewDate]);
const goToToday = useCallback(() => setViewDate(format(new Date(), 'yyyy-MM-dd')), []);
```

- `viewDateEvents`, `planItems`, `plannedTaskIds` all keyed by `viewDate`.
- Separate `todayPlannedTaskIds` memo (always from `plansByDate[today]`) drives `rolloverCandidates` so Roll Over always operates on today's tasks regardless of the viewed date.
- `handleAutoPlanDay` uses `viewDate`; start time is `09:00` when not viewing today.

**`DailyPlanHeader.tsx`** additions:
- New props: `isViewingToday`, `onPrevDay`, `onNextDay`, `onGoToToday`.
- `eyebrowLabel`: `isViewingToday ? 'PLAN · TODAY' : 'PLAN · ${format(date, 'MMM d').toUpperCase()}'`.
- Inline `NavArrow` component (`ChevronLeftIcon`/`ChevronRightIcon`).
- "Today" chip rendered only when `!isViewingToday && onGoToToday`.

**`TodayTimeline.tsx`**: new optional `viewDate?: string` prop. `dateStr = viewDate ?? format(new Date(), 'yyyy-MM-dd')`. Calendar events memo uses `instanceDate: dateStr`.

---

### 36.8 Planner — Roll Over UX (`src/components/planner/RollOverButton.tsx`, `src/components/planner/DailyPlanView.tsx`)

Changes to the Roll Over feature:
- **Renamed**: "Roll Over" → **"Push to Tomorrow"**. Spinner copy "Rolling…" → "Pushing…".
- **Hidden off-today**: `onRollOver` prop in `DailyPlanView` is `isViewingToday ? handleRollOverTasks : undefined`. `DailyPlanHeader` skips rendering `RollOverButton` when `onRollOver` is undefined.
- **Empty-state toast**: 0 candidates → `toast('Nothing to roll over')` instead of silent no-op. The button stays clickable (no `rolloverCount === 0` disable) so this toast always fires.
- **Count toast**: success → `toast.success(\`${count} task${count === 1 ? '' : 's'} pushed to tomorrow\`)`.
- **Tooltip**: "Move unfinished tasks from today's plan to tomorrow". Added `aria-label` attribute.

---

### 36.9 Files changed in v29

```
src/app/api/docs/[id]/route.ts                     | PATCH returns { ok, updatedAt } via .returning()
src/lib/persistence/docsPersistence.ts             | UpdateOneResult → discriminated union
src/store/useDocsStore.ts                          | updateDoc + saveContent sync updatedAt
src/components/pages/DocPage.tsx                   | skipNextBlurRef Escape-revert guard
src/components/docs/DocEditor.tsx                  | /ai slash command, AIPromptInput overlay, chat-bubble icon
src/components/docs/AIPromptInput.tsx              | NEW — floating AI prompt card
src/store/useTaskBoardStore.ts                     | resolveTaskDbId + notifyOptimisticIdResolved registry
src/store/useDailyPlanStore.ts                     | resolveTaskDbId calls; removeAllByTaskId fix; viewDate + setViewDate; mobile tab state
src/app/api/planner-items/route.ts                 | GET ?date=YYYY-MM-DD filter
src/components/planner/DailyPlanView.tsx            | viewDate navigation; mobile tab switcher; roll-over count toast
src/components/planner/DailyPlanHeader.tsx          | isViewingToday + NavArrow + Today chip
src/components/planner/TodayTimeline.tsx            | viewDate prop
src/components/planner/RollOverButton.tsx           | renamed "Push to Tomorrow"; aria-label
CODEBASE_REFERENCE_Lumina_Next.md                  | v29 header + §36 NEW; §6 useDailyPlanStore/useTaskBoardStore updated; §25 docs updated
```

### 36.10 Test count (unchanged from v28)
- Vitest: 102/102
- Playwright desktop: 54/54
- Playwright mobile: 28/28

---

---

## 37. SESSION v30 CHANGES

### 37.1 Goals — CoinsBadge visibility + timeframe-correct coin toast (`src/components/pages/GoalsPage.tsx`)

**Problem.** Completing a goal showed a coin toast hardcoded to `showCoinToast(100, ...)` regardless of timeframe, and there was no persistent coin balance indicator on the Goals page.

**`GoalsPage` header** — wrapped the New Goal button in a flex row and added `<CoinsBadge variant="chip" />` to its left:

```tsx
<div className="flex items-center gap-2 flex-shrink-0">
  <CoinsBadge variant="chip" />
  <Button size="sm" onClick={() => { setEditingGoal(null); setDialogOpen(true); }}>
    <PlusIcon /> New Goal
  </Button>
</div>
```

**`handleComplete` fix** — coin amount is now computed from `goalCompleteAwards`:

```ts
import { goalCompleteAwards } from '@/lib/coins/earnRules';

// inside handleComplete:
const earned = goalCompleteAwards(goal.timeframe).reduce((s, a) => s + a.amount, 0);
showCoinToast(earned, 'Goal completed!');
```

`goalCompleteAwards(timeframe)` returns: base 100 + weekly +50, monthly +150, quarterly +300.

---

### 37.2 GoalDetailSheet — coin toast on `handleMarkComplete` (`src/components/goals/GoalDetailSheet.tsx`)

`handleMarkComplete` previously called `updateGoal(...)` then `onClose()` silently. Added timeframe-correct coin toast:

```ts
import { showCoinToast } from '@/lib/coins/showCoinToast';
import { goalCompleteAwards } from '@/lib/coins/earnRules';

// inside handleMarkComplete:
const earned = goalCompleteAwards(liveGoal.timeframe).reduce((s, a) => s + a.amount, 0);
showCoinToast(earned, 'Goal completed!');
onClose();
```

---

### 37.3 GoalCard — inline target editing (`src/components/pages/GoalsPage.tsx`)

**New local state on `GoalCard`**:
```ts
const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
const [targetDraft, setTargetDraft] = useState(0);
```

**Card click guard** — clicking the card now also checks `editingTargetId`:
```tsx
onClick={() => !editingProgress && !editingTargetId && onSelect(goal)}
```

**`visibleTargets`** — filters out the synthetic progress target before rendering:
```ts
const visibleTargets = goal.targets.filter(
  t => !(t.title === 'Progress' && t.type === 'percentage')
);
```

**Per-target interactive controls** (all wrapped in `<div onClick={e => e.stopPropagation()}>` to block card-click propagation):

| Target type | Control rendered |
|---|---|
| `boolean` | Pill toggle button: `✗ Not done` / `✓ Done` — calls `updateTarget(goal.id, t.id, { current: t.current ? 0 : 1 })` |
| `number` | `−` / current value / `+` step buttons (±1); clicking the value opens an inline `<input type="range">` min=0 max=target |
| `percentage` | Same as number but `max={100}` and renders `%` suffix |
| `task_completion` | Read-only chip showing `X / total tasks` |

When an inline slider is open (`editingTargetId === t.id`): `targetDraft` tracks the slider value; `onMouseUp`/`onTouchEnd` commit via `updateTarget` + clear `editingTargetId`.

---

### 37.4 IntelligenceRecommendationCard — explanation humanization (`src/components/planner/IntelligenceRecommendationCard.tsx`)

**Problem.** The AI intelligence engine embeds raw UUIDs and ISO timestamps in recommendation explanations, e.g. `"Plan task fad33636-d466-4f67-a8a8-b12ddf1c2ec7 between 2026-05-02T08:00:00.000Z and ..."`.

**Solution.** Post-process at render time — no API changes.

```ts
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_RE  = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

function fmtIso(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function humanize(text: string, tasks: { id: string; title: string }[]): string {
  let out = text.replace(UUID_RE, (id) => {
    const task = tasks.find((t) => t.id === id);
    return task ? `"${task.title}"` : id.slice(0, 8) + '…';
  });
  out = out.replace(ISO_RE, fmtIso);
  return out;
}
```

In the component:
```tsx
const tasks = useTaskBoardStore((s) => s.tasks);
const explanation = humanize(recommendation.explanation, tasks);
// ...
<p className="...">{explanation}</p>
```

Unknown UUIDs (not found in store) are shortened to first 8 chars + `…`.

---

### 37.5 PersistenceBootstrap — auth name sync (`src/components/PersistenceBootstrap.tsx`)

**Problem.** `useCalendarStore` ships with a hardcoded `defaultProfile` of `{ name: 'Alexander Sterling', role: 'Creative Director', ... }`. The sidebar footer and Profile page showed this placeholder instead of the real user's name.

**Fix.** New `useEffect` on `session?.user?.id` syncs the real auth values into the store:

```ts
useEffect(() => {
  const u = session?.user;
  if (!u) return;
  const patch: Record<string, string> = {};
  if (u.name)  patch.name  = u.name;
  if (u.email) patch.email = u.email;
  if (Object.keys(patch).length > 0) {
    useCalendarStore.getState().updateProfile(patch);
  }
}, [session?.user?.id]);
```

Runs once per real session change (login/switch). `updateProfile` already persists to the `lumina-calendar` localStorage key so the name survives page refreshes.

---

### 37.6 useFocusStore — `applyFocusResult` + streak/coin chain (`src/store/useFocusStore.ts`)

**Problem.** `finishSession` and `cancelSession` saved to DB but did not update `useStreakStore` or `useCoinsStore` from the server's `FocusSessionResult` response.

**`applyFocusResult` helper**:
```ts
function applyFocusResult(result: FocusSessionResult | null) {
  if (!result) return;
  if (result.newStreak != null) {
    useStreakStore.getState().setStreak(result.newStreak);
  }
  if (result.coinsEarned != null && result.coinsEarned > 0) {
    useCoinsStore.getState().addCoins(result.coinsEarned);
    showCoinToast(result.coinsEarned, 'Focus session complete!');
  }
}
```

Both `finishSession` and `cancelSession` now chain:
```ts
focusPersistence.createOne(payload)
  .then(applyFocusResult)
  .catch(() => {});
```

---

### 37.7 focusPersistence — `createOne` returns result (`src/lib/persistence/focusPersistence.ts`)

`createOne` was `Promise<void>`; changed to `Promise<FocusSessionResult | null>`.

```ts
export async function createOne(payload: NewFocusSession): Promise<FocusSessionResult | null> {
  const res = await fetch('/api/focus-sessions', { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) return null;
  return res.json() as Promise<FocusSessionResult>;
}
```

`FocusSessionResult` shape (returned by `POST /api/focus-sessions`):
```ts
interface FocusSessionResult {
  id: string;
  coinsEarned?: number;
  newStreak?: number;
}
```

---

### 37.8 parse-event route — Gemini 429 detection (`src/app/api/intelligence/parse-event/route.ts`)

**Problem.** Gemini quota errors throw an object with `{ status: 429 }`. The catch block previously returned HTTP 422 for all errors, showing "Couldn't understand that" to the user.

**Fix.** Catch block now checks `err.status` and maps quota errors to HTTP 429:

```ts
const errStatus = (err as { status?: number }).status;
if (errStatus === 429) {
  console.warn('[POST /api/intelligence/parse-event] Gemini quota exceeded');
  return NextResponse.json(
    { error: 'AI service quota exceeded. Please try again later.' },
    { status: 429 },
  );
}
```

---

### 37.9 Profile — Recent Sessions from store (`src/components/pages/Profile.tsx`)

**Problem.** Recent Sessions section was reading focus history from a stale localStorage snapshot.

**Fix.** Component now subscribes to `useFocusStore`:
```ts
const sessionHistory = useFocusStore((s) => s.sessionHistory);
```
Renders the last N entries from `sessionHistory` (already hydrated from DB by `PersistenceBootstrap`). No localStorage read.

---

### 37.10 Files changed in v30

```
src/components/pages/GoalsPage.tsx                    | CoinsBadge chip in header; goalCompleteAwards toast; GoalCard inline target editing
src/components/goals/GoalDetailSheet.tsx              | showCoinToast + goalCompleteAwards in handleMarkComplete
src/components/planner/IntelligenceRecommendationCard.tsx | humanize() UUID→title + ISO→readable time
src/components/PersistenceBootstrap.tsx               | useEffect syncing session.user.name/email → useCalendarStore.profile
src/store/useFocusStore.ts                            | applyFocusResult helper; finishSession + cancelSession chain .then(applyFocusResult)
src/lib/persistence/focusPersistence.ts               | createOne returns Promise<FocusSessionResult | null>
src/app/api/intelligence/parse-event/route.ts         | err.status === 429 → HTTP 429 response
src/components/pages/Profile.tsx                      | Recent Sessions from useFocusStore.sessionHistory
CODEBASE_REFERENCE_Lumina_Next.md                     | v30 header + §37 NEW
```

### 37.11 Test count (unchanged from v29)
- Vitest: 102/102
- Playwright desktop: 54/54
- Playwright mobile: 28/28

---

*End of reference. This document should be kept up to date after every significant feature addition or architectural change.*

---

# Lumina — Codebase Reference (Post-Migration)
# Stack: Next.js 16 · React 19.2.3 · Tiptap 3.22.5
# BlockNote has been fully removed. Do not reference it anywhere.
# Last updated: post 6-phase BlockNote → Tiptap migration + QA pass
# ═══════════════════════════════════════════════════════════════

---

## HOW TO USE THIS DOCUMENT

This is the single source of truth for the Lumina docs editor system.
Feed it to Claude Code at the start of any session involving the editor.
It replaces the old CODEBASE_REFERENCE that contained BlockNote references.

---

## TECH STACK

```
Framework:     Next.js 16.2.x (App Router, Turbopack)
Runtime:       React 19.2.3
Language:      TypeScript 5 (strict)
Styling:       Tailwind CSS 3.4 + shadcn/ui conventions
State:         Zustand 5
Animation:     Framer Motion 12
ORM:           Drizzle 0.45 → Neon Postgres
Auth:          better-auth 1.5
AI:            Google Gemini (via /api/docs/ai-stream)
Toasts:        sonner
Dates:         date-fns 4
DnD:           @dnd-kit/core + @dnd-kit/sortable
Editor:        Tiptap 3.22.5 (replaces BlockNote — fully removed)
```

---

## EDITOR ARCHITECTURE

### Entry point

```
src/app/(app)/docs/[id]/page.tsx
  └── src/components/pages/DocPage.tsx          ← owns title, cover, metadata bar
        └── src/components/docs/DocEditor.tsx   ← loaded via next/dynamic ssr:false
```

### Why `ssr: false`

ProseMirror (Tiptap's engine) mutates the DOM directly on mount. SSR produces
HTML that doesn't match the client-mounted editor, causing hydration crashes.
`suppressHydrationWarning` is on the wrapper div in DocPage.tsx for the same reason.
**Do not remove either of these.**

### Editor instance exposure (dev only)

In development, `window.__luminaEditor` exposes the Tiptap editor instance
for testing and the Playwright e2e suite. It is guarded by `NODE_ENV !== 'production'`
and must never ship to production.

---

## INSTALLED TIPTAP PACKAGES (all at 3.22.5 unless noted)

```
@tiptap/react                        ← useEditor, EditorContent, BubbleMenu,
                                       ReactNodeViewRenderer, NodeViewWrapper,
                                       NodeViewContent, useEditorState
@tiptap/pm                           ← ProseMirror peer dep wrapper
@tiptap/starter-kit                  ← bold, italic, strike, code, blockquote,
                                       bulletList, orderedList, listItem,
                                       heading, horizontalRule, hardBreak,
                                       history, doc, paragraph, text
@tiptap/extension-placeholder
@tiptap/extension-typography         ← smart quotes, em dashes, ellipsis
@tiptap/extension-task-list          ← native checklist (≠ custom taskBlock)
@tiptap/extension-task-item
@tiptap/extension-image
@tiptap/extension-link
@tiptap/extension-color
@tiptap/extension-text-style
@tiptap/extension-highlight
@tiptap/extension-code-block-lowlight
@tiptap/extension-character-count
@tiptap/extension-drag-handle-react  ← separate peer dep (not in starter-kit)
@tiptap/extension-underline
@tiptap/extension-table
@tiptap/extension-table-row
@tiptap/extension-table-cell
@tiptap/extension-table-header
@tiptap/extension-mathematics        ← KaTeX math (blockMath + inlineMath nodes)
@tiptap/suggestion                   ← slash command engine
lowlight                             ← syntax highlighting for code blocks
tippy.js                             ← slash menu positioning
katex                                ← KaTeX peer dep for mathematics
```

**@blocknote/* packages: ZERO. Completely removed. Do not reinstall.**

---

## EDITOR FILES

### Core

| File | Purpose |
|------|---------|
| `src/components/docs/DocEditor.tsx` | Main editor component. Uses `useEditor` hook. Registered extensions, state, portals, event wiring. Loaded via `next/dynamic ssr:false`. |
| `src/components/docs/FloatingToolbar.tsx` | Animated bubble format toolbar. Uses `BubbleMenu` from `@tiptap/react/menus` (v3 API — **not** `@tiptap/react`). Uses Floating UI `options` — **not** `tippyOptions` (that was v2). |
| `src/components/docs/SlashMenuList.tsx` | `forwardRef` component rendered inside tippy. Framer Motion entrance, keyboard nav, group labels. |
| `src/components/docs/SlashMenuRenderer.tsx` | tippy.js + ReactRenderer bridge. Lifecycle: `onStart / onUpdate / onKeyDown / onExit`. |
| `src/components/docs/slashItems.ts` | All 22 slash command definitions. `buildSlashItems(callbacks?)` returns `SlashItem[]`. |
| `src/components/docs/AIPromptInput.tsx` | Floating AI prompt card. Props: `{ onSubmit, onCancel, position: {top, left} }`. Min 3 chars to enable submit. Enter = submit, Escape = cancel. |
| `src/components/docs/ColumnRatioPicker.tsx` | 6-preset column ratio picker. Props: `{ onSelect(ratio: ColumnRatio), onClose }`. Ratio is `{ widths: number[] }`. |
| `src/components/docs/DocLinkPicker.tsx` | Doc search picker. Debounced 300ms → `GET /api/docs/search?q=`. Shows up to 5 results. |
| `src/components/docs/DocSaveIndicator.tsx` | "Saving…" pulsing dot / "✓ Saved" 3s fade. Reads `isSaving` + `lastSavedAt` from `useDocsStore`. |
| `src/components/docs/DocBreadcrumb.tsx` | Parent chain breadcrumb navigation. |
| `src/components/docs/DocRightSidebar.tsx` | Doc info panel (linked task/event). |

### Extensions directory: `src/components/docs/extensions/`

| File | Node/Extension name | Type |
|------|---------------------|------|
| `TaskBlockExtension.ts` | `taskBlock` | Custom Node (atom, draggable) |
| `TaskBlockNodeView.tsx` | — | React NodeView for taskBlock |
| `ToggleExtension.ts` | `toggle` | Custom Node (block, content: block+) |
| `ToggleNodeView.tsx` | — | React NodeView for toggle |
| `BookmarkExtension.ts` | `bookmark` | Custom Node (atom, draggable) |
| `BookmarkNodeView.tsx` | — | React NodeView for bookmark |
| `ColumnExtension.ts` | `column` | Custom Node (group: column, content: block+) |
| `ColumnsExtension.ts` | `columns` | Custom Node (group: block, content: column+) |
| `CodeBlockNodeView.tsx` | — | React NodeView for CodeBlockLowlight |
| `SlashCommandExtension.ts` | `slashCommand` | Extension (wraps @tiptap/suggestion) |
| `KeyboardShortcutsExtension.ts` | `keyboardShortcuts` | Extension |
| `FocusBlockExtension.ts` | `focusBlock` | Extension (ProseMirror Decoration.node) |

---

## REGISTERED EXTENSIONS (exact order matters for ProseMirror)

```ts
// From DocEditor.tsx useEditor({ extensions: [...] })
StarterKit.configure({ codeBlock: false, heading: { levels: [1,2,3] } }),
Underline,
Placeholder.configure({ showOnlyCurrent: true, placeholder: ({ node }) => ... }),
CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'plaintext' }).extend({
  addNodeView() { return ReactNodeViewRenderer(CodeBlockNodeView) }
}),
Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true,
  validate: url => /^(https?:\/\/|\/)/.test(url) }),  // ← accepts relative /docs/id paths
Image.configure({ inline: false, allowBase64: true }),
TextStyle,
Color,
Highlight.configure({ multicolor: true }),
Typography,
TaskList,
TaskItem.configure({ nested: true }),
CharacterCount,
DragHandle,                          // from @tiptap/extension-drag-handle-react
ColumnExtension,                     // ← MUST come before ColumnsExtension
ColumnsExtension,
ToggleExtension,
Table.configure({ resizable: true, handleWidth: 5, cellMinWidth: 100, lastColumnResizable: false }),
TableRow,
TableHeader,
TableCell,
Mathematics,                         // blockMath + inlineMath nodes
BookmarkExtension,
KeyboardShortcutsExtension,
FocusBlockExtension,
TaskBlockExtension,
SlashCommandExtension.configure({    // ← ALWAYS LAST
  docId: string,
  onOpenColumnPicker: () => void,
  onOpenAIPrompt: () => void,
  onOpenDocLinkPicker: () => void,
}),
```

**ColumnExtension must be registered before ColumnsExtension** — ProseMirror
resolves the `column+` content spec at registration time, not render time.
**SlashCommandExtension must be last** — so all node types are registered before
the slash menu tries to insert them.

---

## REGISTERED NODES (25 total)

```
paragraph, blockquote, bulletList, doc, hardBreak, heading,
horizontalRule, listItem, orderedList, text,
codeBlock, image, taskList, taskItem,
column, columns,          ← custom (Tiptap Pro not on free npm — built from scratch)
taskBlock,                ← custom Lumina task card
toggle,                   ← custom collapsible block
bookmark,                 ← custom URL card
table, tableRow, tableHeader, tableCell,
blockMath, inlineMath     ← from @tiptap/extension-mathematics (KaTeX)
```

## REGISTERED MARKS (8 total)

```
link, textStyle, bold, code, italic, strike, underline, highlight
```

---

## SLASH COMMANDS (22 total)

### Group "Basic" (14 items)

| Title | Key aliases | Execute |
|-------|-------------|---------|
| Heading 1 | h1, heading1 | `setHeading({ level: 1 })` |
| Heading 2 | h2, heading2 | `setHeading({ level: 2 })` |
| Heading 3 | h3, heading3 | `setHeading({ level: 3 })` |
| Paragraph | p, text, plain | `setParagraph()` |
| Quote | blockquote, quote | `setBlockquote()` |
| Code Block | code, pre | `setCodeBlock()` |
| Math | math, equation, latex | `insertBlockMath('E = mc^2')` |
| Bullet List | ul, list, bullet | `toggleBulletList()` |
| Ordered List | ol, numbered | `toggleOrderedList()` |
| Task List | checklist, check | `toggleTaskList()` (native — ≠ taskBlock) |
| Toggle | toggle, collapse | `insertContent({ type: 'toggle', ... })` |
| Table | table, grid | `insertTable({ rows:3, cols:3, withHeaderRow:true })` |
| Divider | hr, line, separator | `setHorizontalRule()` |
| Page Link | page, link, doc | opens `DocLinkPicker` portal |

### Group "Media" (4 items)

| Title | Key aliases | Execute |
|-------|-------------|---------|
| Image | img, image, photo | `window.prompt()` → `setImage({ src })` |
| Video | vid, video | `window.prompt()` → inserts `<a>` link |
| Audio | audio, sound, mp3 | `window.prompt()` → inserts `<a>` link |
| Bookmark | bookmark, url, card | `window.prompt()` → `insertContent({ type: 'bookmark', ... })` |

### Group "Lumina" (4 items)

| Title | Key aliases | Execute |
|-------|-------------|---------|
| Task | task, todo, action | `POST /api/tasks` → `insertContent({ type: 'taskBlock', ... })` |
| Columns | columns, col, layout | opens `ColumnRatioPicker` portal |
| Callout | callout, note, info | `insertContent('<p>💡 </p>')` |
| AI Assist | ai, ask, generate | opens `AIPromptInput` portal |

### Filter logic (in SlashCommandExtension)

```ts
const q = query.toLowerCase()
items.filter(item =>
  item.title.toLowerCase().split(' ').some(w => w.startsWith(q)) ||
  item.aliases.some(a => a.startsWith(q))
)
// NOTE: uses startsWith — NOT includes (includes was too broad: "h" matched "Paragraph")
```

---

## CUSTOM NODE DETAILS

### taskBlock

```ts
// Attrs
{ taskId: string | null, checked: boolean, taskTitle: string }

// atom: true  — ProseMirror treats as one opaque unit (no cursor inside)
// draggable: true — DragHandle can reorder it

// CustomEvent bridge (editor ↔ task board):
'lumina:taskblock-toggle'  dispatched by TaskBlockNodeView on checkbox click
                           → DocEditor listener calls useTaskBoardStore.updateTask()
'lumina:task-updated'      dispatched by useTaskBoardStore after DB update
                           → TaskBlockNodeView listener updates attrs
'lumina:open-task'         dispatched by "Open ↗" button
                           → AppShell listener opens TaskDetailSheet

// Archive on delete: PATCH /api/tasks/{taskId} { status: 'archived' }
// Uses taskIdRef (NOT node.attrs.taskId closure) to avoid stale closure bug
// (Tiptap reuses React component instances when ProseMirror swaps nodes)
// KNOWN: /api/tasks/[id] currently rejects 'archived' — server fix pending

// HTML serialization: <div data-type="task-block" data-task-id="..." data-checked="..." data-task-title="...">
```

### toggle

```ts
// Attrs
{ isOpen: boolean }  // default: true

// content: 'block+'  — holds any block-level content inside
// defining: true     — cursor enters/exits cleanly

// Open/close state is stored in node attrs (persists in JSON)
// NodeView uses local useState synced with updateAttributes

// HTML serialization: <details data-type="toggle" data-open="true|false">
```

### bookmark

```ts
// Attrs
{ url: string, title: string }

// atom: true, draggable: true
// Renders as a styled card <a> tag — entire card is clickable (opens URL in new tab)
// No OG metadata fetching (no server-side unfurl) — URL only

// HTML serialization: <div data-type="bookmark" data-url="..." data-title="...">
```

### columns / column

```ts
// ColumnsExtension: group: 'block', content: 'column+'
// ColumnExtension:  group: 'column', content: 'block+', attrs: { ratio: number }

// Custom insertColumns command:
editor.chain().focus().insertColumns([1, 1]).run()   // 50/50
editor.chain().focus().insertColumns([2, 1]).run()   // 70/30

// @tiptap/extension-columns does NOT exist on free npm (Tiptap Pro only)
// These are built from scratch

// HTML: <div data-type="columns"> <div data-type="column" data-ratio="1"> ... </div> </div>
```

---

## CRITICAL ARCHITECTURAL DECISIONS (do not revert)

### 1. FocusBlockExtension uses Decoration.node — NOT classList.add

`classList.add()` on ProseMirror-managed nodes gets clobbered by PM redraws.
The correct approach is a PM plugin returning `Decoration.node`, which is part
of PM's view layer and survives redraws. `FocusBlockExtension.ts` implements this.
The `editor.on('selectionUpdate') + classList.add` pattern does NOT work.

### 2. Block-in animation uses Web Animations API — NOT MutationObserver + setAttribute

`MutationObserver + setAttribute` on PM nodes causes an infinite loop:
PM redraw → fires observer → observer mutates → PM redraws.
The fix uses `element.animate()` (Web Animations API) + a WeakSet to avoid
re-animating the same node instance. `DocEditor.tsx` implements this.

### 3. isPristine (empty state detection) uses useEditorState

`useEditor` in Tiptap v3 does NOT re-render on document changes. Derived values
computed from editor state (like `editor.isEmpty`) go stale without `useEditorState`:
```ts
const isPristine = useEditorState({
  editor,
  selector: ({ editor }) => editor.isEmpty,
})
```

### 4. isFirstUpdate guard REMOVED

Tiptap v3 does NOT fire `onUpdate` on hydration (verified empirically).
The guard was swallowing the user's first real keystroke. It is gone. Do not re-add it.

### 5. No second debounce in DocEditor

`useDocsStore.saveContent()` already debounces at 1s with per-doc keys +
stale-write protection. DocEditor calls `onUpdate` immediately. Adding a second
1s timer in DocEditor would push saves to ~2s.

### 6. taskIdRef pattern for archive-on-delete

```ts
// WRONG — stale closure (Tiptap reuses React instances across node swaps):
useEffect(() => {
  return () => { if (isBeingDeletedRef.current) fetch(`/api/tasks/${node.attrs.taskId}`, ...) }
}, [])

// CORRECT — ref updated on every render:
const taskIdRef = useRef(node.attrs.taskId)
useEffect(() => { taskIdRef.current = node.attrs.taskId })
useEffect(() => {
  return () => { if (isBeingDeletedRef.current) fetch(`/api/tasks/${taskIdRef.current}`, ...) }
}, [])
```

### 7. /ai streaming off-by-one fix

The placeholder position is computed from the post-insert cursor, NOT `insertPos + 1`.
When ProseMirror merges the inserted paragraph into an existing empty paragraph,
`insertPos + 1` lands inside the open token, leaving residue.

### 8. Link extension accepts relative paths

```ts
Link.configure({
  validate: url => /^(https?:\/\/|\/)/.test(url),  // ← accepts /docs/id paths
})
```

### 9. /math uses two .run() calls

```ts
// WRONG — crashes "Position out of range":
editor.chain().focus().deleteRange(range).insertBlockMath('...').run()

// CORRECT:
editor.chain().focus().deleteRange(range).run()
editor.chain().focus().insertBlockMath('E = mc^2').run()
```

### 10. BubbleMenu import path

```ts
// CORRECT (v3):
import { BubbleMenu } from '@tiptap/react/menus'

// WRONG (v2 path — does not exist in v3):
import { BubbleMenu } from '@tiptap/react'
```

---

## AUTO-SAVE

```
onUpdate (Tiptap) → props.onUpdate(editor.getJSON(), editor.getText())
                  → DocPage.tsx handleEditorUpdate (useCallback, [doc.id])
                  → useDocsStore.saveContent(docId, content, textContent)
                  → 1s debounce → PATCH /api/docs/[id]
                  → 409 conflict → toast (stale-write protection, no overwrite)
```

Word count is debounced separately at 500ms to avoid DocPage re-renders per keystroke.

---

## KEYBOARD SHORTCUTS (KeyboardShortcutsExtension)

| Shortcut | Action |
|----------|--------|
| Mod+U | Toggle underline |
| Mod+Shift+H | Toggle highlight |
| Mod+E | Toggle inline code |
| Mod+Alt+1 | Heading 1 |
| Mod+Alt+2 | Heading 2 |
| Mod+Alt+3 | Heading 3 |
| Mod+Alt+0 | Paragraph |
| Mod+Shift+B | Toggle blockquote |
| Mod+S | Force-save (dispatches `lumina:force-save` CustomEvent) |

StarterKit provides: Mod+B (bold), Mod+I (italic), Mod+Z (undo), Mod+Shift+Z (redo),
Tab/Shift+Tab (list indent), Mod+Shift+8 (bullet), Mod+Shift+9 (ordered).

---

## FOCUS MODE

Stored in `localStorage` as `lumina-editor-focus-mode` ('true'/'false').
Default: OFF. Toggle button in DocPage metadata bar.
Implemented via `focus-mode-active` CSS class on `.lumina-editor` wrapper.
Active block tracked by `FocusBlockExtension` (ProseMirror `Decoration.node`).

```css
.lumina-editor.focus-mode-active .ProseMirror > * { opacity: 0.4; transition: opacity 0.15s; }
.lumina-editor.focus-mode-active .ProseMirror > .is-focused-block { opacity: 1; }
.lumina-editor.focus-mode-active .ProseMirror:not(:focus-within) > * { opacity: 1; }
```

---

## DESIGN SYSTEM (editor-specific)

```
font-sans    = Geist Sans       (body, UI, H3)
font-mono    = Geist Mono       (code blocks, inline code, labels, copy button)
font-display = Clash Display    (H1 @ 32px, H2 @ 24px — beats Notion's system fonts)
```

All colors via `hsl(var(--*))` or Tailwind tokens. Zero hardcoded hex in editor CSS.

Palette: warm paper. Light = HSL 30–40° amber-tinted neutrals. Dark = warm off-white.

---

## CSS ORGANIZATION (globals.css)

```
/* [Lumina base styles] */
/* ═══ TIPTAP EDITOR ═══ */      ← added during migration (Phases 2–6)
  — ProseMirror root
  — Headings (Clash Display H1/H2)
  — Placeholder
  — Blockquote, code, lists, task lists
  — Images, links, marks
  — Block-in animation (@keyframes lumina-block-in)
  — Drag handle
  — Tippy reset (lumina-slash theme, lumina-toolbar theme)
  — Task block wrapper
  — Code block NodeView
  — Focus mode
  — Toggle wrapper
  — Columns layout (flex + mobile stack)
  — Table styles
  — AI shimmer (@keyframes ai-shimmer)
  — Mobile overrides (font-size: 16px, drag handle hidden)
/* [End TIPTAP EDITOR] */
```

**No .bn-* or --bn-* rules anywhere.** Zero BlockNote CSS remains.

---

## DATABASE

```sql
-- docs table (relevant columns only)
content       jsonb   -- Tiptap JSON: { type: "doc", content: [...] }
                      -- (was BlockNote JSON array — migrated via scripts/)
content_text  text    -- plain text for PostgreSQL FTS (updated with editor.getText())
```

Migration script: `scripts/migrate-blocknote-to-tiptap.ts`
Status: written and committed. **Not yet run on production.** Run on staging first.

---

## TEST SUITE

```
Vitest:     213 tests passing (104 original + 109 added during migration)
Playwright: 29 e2e tests in tests/e2e/editor.spec.ts
Dev harness: src/app/dev-editor-test/page.tsx (NODE_ENV guard — 404 in production)
```

### Key test files added during migration

```
tests/tiptap-packages.test.ts          verifies all packages installed, @blocknote absent
tests/task-block-extension.test.ts     TaskBlockExtension schema
tests/slash-items.test.ts              all 22 items, filter logic
tests/slash-menu-list.test.tsx         SlashMenuList rendering + keyboard nav
tests/columns-extension.test.ts        ColumnsExtension + ColumnExtension schema
tests/toggle-extension.test.ts         ToggleExtension schema
tests/keyboard-shortcuts-extension.test.ts  shortcuts + Mod-s event dispatch
tests/bookmark-extension.test.ts       BookmarkExtension schema
```

---

## KNOWN OUTSTANDING ITEMS (carry-forward, not regressions)

| # | Severity | Item |
|---|----------|------|
| 1 | Medium | `/api/tasks/[id]` PATCH rejects `status:'archived'` (whitelist: todo\|doing\|done only). Client fires correctly. Fix: add 'archived' to route's zod enum. |
| 2 | Low/UX | Image, Video, Audio, Bookmark use `window.prompt()` for URL input. Works, not polished. Fix: Radix Dialog with URL input. |
| 3 | Low/UX | Toggle NodeView header shows hardcoded "Click to collapse/expand". Fix: render first child block text as summary. |
| 4 | Low/UX | Video/Audio insert plain `<a>` links, not embedded players. Fix: custom VideoExtension + AudioExtension with HTML5 `<video>`/`<audio>`. |
| 5 | Action | DB migration not yet run on production. Run: `npx tsx scripts/migrate-blocknote-to-tiptap.ts` |
| 6 | Action | `git push origin main` — 7 commits ahead of origin. |

---

## APPSHELL KEYBOARD GUARD

The global keydown handler in `AppShell.tsx` must skip single-key shortcuts
when the user is typing in the editor. Confirm these checks are ALL present:

```ts
const target = e.target as HTMLElement
if (
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  target.isContentEditable ||
  target.closest('[contenteditable]') !== null ||
  target.closest('[data-node-view-wrapper]') !== null  // ← covers NodeView internals
) return
```

The `[data-node-view-wrapper]` check is required for taskBlock, toggle, and
bookmark NodeViews. Without it, pressing single-key shortcuts while inside a
NodeView would trigger navigation.

---

## QA STATUS (post browser testing)

Verified live in Chrome MCP + Playwright:

| Feature | Status |
|---------|--------|
| H1/H2 Clash Display font | ✅ 32px / 24px confirmed via computed style |
| H3 Geist Sans | ✅ |
| Bold / Italic / Underline marks | ✅ |
| Blockquote left border | ✅ |
| taskBlock render | ✅ card, checkbox, title, "Open ↗" |
| taskBlock checkbox toggle | ✅ instant, line-through, primary fill |
| Toggle open/close | ✅ chevron rotates, content hides/shows |
| Bookmark card | ✅ link icon, bold title, muted URL |
| Columns layout | ✅ flex row, 2-column DOM |
| Table 3×3 | ✅ header row styled |
| KaTeX math E=mc² | ✅ renders correctly |
| FloatingToolbar | ✅ 11 buttons, animates in/out |
| Focus mode toggle | ✅ ON/OFF label updates |
| Dark mode | ✅ all nodes adapt correctly |
| Light mode | ✅ warm paper background |
| onUpdate / word count | ✅ fires on every change |
| Code block NodeView | ✅ language selector + copy button |
