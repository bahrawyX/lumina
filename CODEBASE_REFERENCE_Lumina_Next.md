# LUMINA — COMPLETE CODEBASE REFERENCE

> **For engineers and LLM consumption.**
> Paste this file at the start of any new Claude session.
> Last updated: 2026-04-02 (v4 — RFC 5545 recurring events, NL event input via Gemini, created_via_nl tracking)

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

### Auth
- **better-auth 1.5** — sessions, email/password, Google OAuth, Microsoft OAuth

### Database
- **Drizzle ORM 0.45** with **Neon Postgres** (`@neondatabase/serverless`)

### AI
- **Google Gemini** (`@google/genai`) — intelligence engine summaries

### Theme
- **next-themes** — dark/light mode

---

## 3. DIRECTORY MAP

```
src/
├── app/
│   ├── (app)/                      ← Authenticated app route group
│   │   ├── layout.tsx              ← Wraps all app pages in <AppShell>
│   │   ├── AppShell.tsx            ← Main shell: sidebar, mobile nav, GuestBanner, beforeunload handler
│   │   ├── page.tsx                ← Calendar view
│   │   ├── tasks/page.tsx          ← Task board
│   │   ├── plan/page.tsx           ← Daily planner
│   │   ├── focus/page.tsx          ← Focus session view
│   │   ├── focus/done/page.tsx     ← Focus history
│   │   ├── performance/page.tsx    ← Contribution heatmap + stats
│   │   └── intelligence/page.tsx  ← Intelligence/profile page
│   ├── auth/
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
│   │   ├── intelligence/
│   │   │   ├── route.ts              ← GET: AI schedule analysis (includes recurring instances)
│   │   │   └── parse-event/route.ts  ← POST: Gemini NL→structured event parser (server-side only)
│   │   ├── users/preferences/route.ts
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
│   │   ├── TaskCard.tsx
│   │   ├── TaskDialog.tsx
│   │   └── TaskScheduleDialog.tsx
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
│   ├── intelligence/               ← AI engine: engine, types, recommendations, scoring, llmSummary
│   ├── integrations/
│   │   ├── google/                 ← OAuth, token refresh, calendar/event CRUD, sync
│   │   └── microsoft/              ← OAuth, token refresh, calendar/event CRUD, sync
│   └── calendar/                   ← Normalize, local CRUD, providers
├── db/
│   └── schema/                     ← users, accounts, sessions, verifications, events,
│                                     tasks, calendars, integrations, focusSessions, plannerItems
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
- `tasks: Task[]`, `dbHydrated: boolean`
- CRUD: `addTask`, `updateTask`, `deleteTask`, `hydrateFromDB`
- Filtering: `filter`, `sort`, `searchQuery`

### `useFocusStore`
- `isRunning`, `isPaused`, `sessionDuration` (seconds), `elapsed`
- `activeTask: Task | null`
- `sessionHistory: FocusSession[]`
- `startSession`, `pauseSession`, `resumeSession`, `stopSession`
- `dbHydrated`, `hydrateFromDB`

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
  activeTrack: AmbientTrack | null; // 'white' | 'brown' | 'rainfall' | 'forest' | 'ocean'
  volume: number;  // 0–1
  drawerOpen: boolean;
  setTrack: (track: AmbientTrack | null) => void;
  setVolume: (v: number) => void;
  stop: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}
```

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
  "linkedEventId": null
}
```

#### `POST /api/tasks`
Required: `title`
Optional: `description`, `status`, `priority`, `dueDate`, `durationMinutes`, `scheduledStart`, `scheduledEnd`, `remainingFocusTime`

#### `PATCH /api/tasks/[id]`
Patchable: `title`, `description`, `status` (todo|doing|in_progress|done|archived), `priority`, `durationMinutes`, `dueDate`, `scheduledStart`, `scheduledEnd`, `remainingFocusTime`

#### `DELETE /api/tasks/[id]`
Response: `{ "ok": true }`

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
Optional: `taskId` (uuid), `timezone` (string, default 'UTC')
Validates: `end > start`, converts seconds → rounded minutes (min 1)
After insert: computes streak update, coins earned, achievement unlocks — all in one DB pass.
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

### Interruption / resume
When a running focus session is interrupted:
- Prompt: "Did you finish this task?"
  - **Yes** → task status = done, `remainingFocusTime = null`
  - **Not yet** → saves remaining seconds to `remainingFocusTime` on task
- Next time the task is started from TaskBoard, `remainingFocusTime` is used to resume

Primary files: `FocusSessionView.tsx`, `FocusTimer.tsx`, `TaskBoard.tsx`

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
| 6 | Medium | Recurring event visual indicator (↻ loop icon) not yet shown on event chips in day/week/month views. Affects: `DayView.tsx`, `WeekView.tsx`, `MonthView.tsx`. |

---

## 20. IMPLEMENTED FEATURES (FORMERLY BACKLOG)

### 20.1 Pomodoro tab + session feedback — COMPLETE
- `/focus` page refactored into 3 tabs: Focus Timer | Pomodoro | Stopwatch
- Floating circle FAB (TimerCallout) removed from AppShell
- `PomodoroView`: SVG progress ring, work/break cycle (4 work → long break), Web Audio chime on completion
- `PomodoroFeedbackModal`: forced mood selection (5 emojis), optional note, posts to `POST /api/mood-logs`
- `MoodAnalysisCard`: 3-day mood trend analysis, shown above Pomodoro timer, dismissible, with reflection input for declining trends

### 20.2 White noise / ambient sound drawer — COMPLETE
- Web Audio API noise synthesis (no external files): white, brown, rainfall, forest, ocean
- `AmbientSoundDrawer`: bottom sheet with grid of sound cards, volume slider
- `FloatingAmbientPlayer`: animated waveform circle at bottom-right (offset when tutorial button visible), click to stop
- Sidebar has "Ambient Sounds" button to open drawer

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

### 20.7 Natural Language Event Input — COMPLETE
- `POST /api/intelligence/parse-event`: server-side Gemini 2.0 Flash NL→structured event parser
- `ParsedEventConfirmCard.tsx`: inline confirmation with confidence-based border (amber < 0.7, emerald ≥ 0.7)
- Profile.tsx Commitments section rewritten: parse → confirm → add flow
- `created_via_nl` boolean column on events table for analytics
- Gemini API key server-side only — never in client bundle

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
```

---

## 23. GIT / DEPLOYMENT

- Repo: GitHub (`bahrawyX/lumina`)
- Branch: `main`
- Deployment: Vercel (auto-deploy on push to main)
- Every commit to main triggers a new Vercel build

---

*End of reference. This document should be kept up to date after every significant feature addition or architectural change.*
