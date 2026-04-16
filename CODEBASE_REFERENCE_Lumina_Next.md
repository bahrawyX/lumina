# LUMINA — COMPLETE CODEBASE REFERENCE

> **For engineers and LLM consumption.**
> Paste this file at the start of any new Claude session.
> Last updated: 2026-04-16 (v24 — Layout fixes: task board kanban columns now stretch full height via flex-1 + boneyard CSS fix, Plan Day timeline scrollable via min-h-0 chain fix, Skeleton className passthrough on DailyPlanView. PlannedTaskCard redesigned: bg-card surface, shadow-card, left accent bar, signature easing. Planned block height multiplier 0.75→0.9, min 20→32px. Editorial headers added to /pomodoro and /focus pages. 88 Vitest tests.)

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
- Current suite: **84 tests across 7 files** — `design-system`, `button`, `editorial-headers`, `goal-progress`, `shop-config`, `useCoinsStore`, `shop-item-icon`. See Section 27.

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
│   ├── layout.tsx                  ← Root layout: AuthProvider, ThemeProvider, metadata
│   └── providers.tsx
│
├── components/
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
│   │   ├── DailyPlanView.tsx       ← data-tutorial="plan-pool" on task pool container
│   │   ├── DailyPlanHeader.tsx
│   │   ├── TodayTimeline.tsx
│   │   ├── PlannedTaskCard.tsx
│   │   ├── TaskPoolCard.tsx
│   │   ├── FreeTimePanel.tsx
│   │   ├── IntelligencePanel.tsx   ← All dark/zinc tokens replaced with semantic bg-card/border-border
│   │   ├── IntelligenceRecommendationCard.tsx
│   │   ├── PlanningModal.tsx
│   │   └── RollOverButton.tsx
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
│   ├── cronAuth.ts                 ← verifyCronSecret() — Bearer token check for Vercel cron
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

### `useFocusStore`
- `activeSession: ActiveSession | null` — ephemeral timer state (persisted to localStorage for page-reload resume)
- `timerState: 'idle' | 'running' | 'paused'`
- `sessionHistory: FocusSession[]` — DB-hydrated on mount
- Actions: `startSession(taskId, taskTitle, durationSecs)`, `pauseSession`, `resumeSession`, `finishSession`, `cancelSession`, `getElapsedSecs`
- `dbHydrated`, `hydrateFromDb`, `hydrateFromDbFailed`
- Note: FocusSessionView uses this store's timer. PomodoroView uses `usePomodoroStore` for its own timer but reads `useFocusStore.activeSession` on mount to pre-populate the task selector, and writes session results (with taskId/taskTitle) to `sessionHistory`.

### `useDailyPlanStore`
- `scheduledItems: PlannedItem[]`, `unscheduledTasks: Task[]`
- `planDate: string` (YYYY-MM-DD)
- `addToSchedule`, `removeFromSchedule`, `autoPlan`, `rollOver`

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
| 3 | ~~Medium~~ Resolved | ~~Planner localStorage-only~~ — Fixed: Full DB persistence via API routes + Zustand optimistic updates. |
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
- `rruleEngine.ts`: parse, expand, build, describe RRULEs via `rrule` npm package
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
| `/api/docs/[id]` | PATCH | Update with 409 stale-write protection |
| `/api/docs/[id]` | DELETE | Soft delete (archive). `?hard=true` + `{confirm:true}` for permanent |
| `/api/docs/search` | GET | PostgreSQL FTS with `to_tsquery` prefix search (`:*` suffix), `ts_headline` `<mark>` excerpts, limit 20 |
| `/api/docs/ai-stream` | POST | Gemini streaming proxy, 10/min rate limit |

### Store: `useDocsStore` (src/store/useDocsStore.ts)
State: `docs`, `openDocId`, `openDocContent`, `expandedIds`, `dbHydrated`, `isSaving`, `lastSavedAt`, `searchQuery`, `searchResults`, `isSearching`
Actions: `hydrateFromDb`, `createDoc`, `updateDoc`, `archiveDoc`, `restoreDoc`, `deleteDoc`, `pinDoc`, `moveDoc`, `saveContent` (1000ms debounced), `search`, `clearSearch`, `openDoc`, `closeDoc`, `toggleExpanded`

### UI Components
| File | Description |
|---|---|
| `src/components/docs/SidebarDocsTree.tsx` | Full-featured sidebar tree (expand/collapse, context menu, inline rename, add subpage, emoji picker). Currently unused — replaced by inline tree in Sidebar.tsx |
| `src/components/Sidebar.tsx` (inline) | `SidebarDocsInlineTree` + `InlineDocItem` — compact nested doc tree rendered under the Docs nav item. Chevron toggle, 12px depth nesting, active doc highlight. Uses `useDocsStore.expandedIds` |
| `src/components/docs/DocEditor.tsx` | BlockNote wrapper with `lumina-editor` class, transparent bg, inherited font, custom `taskBlock` spec, multi-column schema, two-way task sync |
| `src/components/docs/ColumnRatioPicker.tsx` | Visual column ratio picker (6 presets), backdrop-blur popover, mobile note |
| `src/components/docs/DocBreadcrumb.tsx` | Parent chain navigation with 12px icons at each level |
| `src/components/docs/DocSaveIndicator.tsx` | "Saving..."/"Saved ✓" AnimatePresence |
| `src/components/docs/DocRightSidebar.tsx` | Doc info, linked task/event, focus time |
| `src/components/docs/DocsEmptyAnimation.tsx` | SVG animated empty state (floating clipboard + blinking cursor, 120x120) |
| `src/components/docs/QuickSwitcher.tsx` | Cmd+K global search overlay — docs section uses `/api/docs/search` API (200ms debounce) for prefix matching |
| `src/components/pages/DocsHomePage.tsx` | /docs — greeting, search, pinned grid (20px icons), recent list (14px icons), animated empty state |
| `src/components/pages/DocPage.tsx` | /docs/[id] — cover, CompactEmojiPicker icon selector, text-3xl title, editor, right sidebar |

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

### Test files (88 tests total)
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

### Patterns
- **String-level assertions** for design tokens: `readFileSync` → regex match. Fast, no render needed, catches accidental deletions.
- **Pure function tests** for all math (`computeGoalProgress`, `computeTargetProgress`) — zero mocking.
- **Zustand store testing**: `vi.mock('@/lib/persistence/…', …)` hoisted above store import, `useStore.setState({…})` to reset between tests in `beforeEach`.
- **RTL render tests** for stateless presentational components (Button, ShopItemIcon).
- **Config validation** for registries (shop items) to catch duplicate ids / missing fields.

### What is NOT covered (yet)
- Full page integration tests (GoalsPage, ShopPage, TaskBoard) — they import stores + persistence + boneyard with deeply nested children. Worth adding later with MSW or fetch stubs.
- API route handler tests
- E2E tests (Playwright is installed via boneyard but not used for app tests)
- Visual regression

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

*End of reference. This document should be kept up to date after every significant feature addition or architectural change.*
