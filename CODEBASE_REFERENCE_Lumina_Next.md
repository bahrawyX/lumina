# LUMINA NEXT — FULL CODEBASE REFERENCE
> Intended for LLM and engineering consumption.
>
> This document mirrors the structure and intent of `CODEBASE_REFERENCE.md`, but targets the **Lumina Next.js architecture** (App Router + BetterAuth + Drizzle + Neon + provider-based sync).
>
> **Last updated:** March 14, 2026

---

## CHANGELOG (Next Migration Reference)

| # | Area | Change |
|---|------|--------|
| 1 | Runtime model | Introduced Next.js App Router model (`app/` layouts/routes) while preserving existing feature modules. |
| 2 | Auth | BetterAuth server route standardized at `app/api/auth/[...all]/route.ts`. |
| 3 | Data layer | Drizzle + Neon wiring documented under `lib/db.ts` and `db/schema/*`. |
| 4 | State model | Zustand remains the interactive source for UI state, drag lifecycle, planner/task/focus UX. |
| 5 | Calendar providers | Provider abstraction documented: Local / Outlook / Google contract. |
| 6 | Sync architecture | Background/API sync flow documented for Outlook/Google routes. |
| 7 | Routing model | React Router paths mapped to App Router target paths. |
| 8 | Core engine safety | Calendar overlap, slot, drag, scheduling engines preserved as immutable core logic. |

---

## TABLE OF CONTENTS
1. [Project Overview](#1-project-overview)
2. [Target Tech Stack](#2-target-tech-stack)
3. [Routing Model (React Router → App Router)](#3-routing-model-react-router--app-router)
4. [Directory Structure (Lumina Next)](#4-directory-structure-lumina-next)
5. [Core Domain Modules (Unchanged)](#5-core-domain-modules-unchanged)
6. [State Management (Zustand Stores)](#6-state-management-zustand-stores)
7. [Auth Layer (BetterAuth)](#7-auth-layer-betterauth)
8. [Database Layer (Drizzle + Neon)](#8-database-layer-drizzle--neon)
9. [Calendar Provider System](#9-calendar-provider-system)
10. [Sync + Background Workflows](#10-sync--background-workflows)
11. [Key Pages / Feature Surfaces](#11-key-pages--feature-surfaces)
12. [Hooks Map](#12-hooks-map)
13. [Environment Variables](#13-environment-variables)
14. [Performance Guarantees and Constraints](#14-performance-guarantees-and-constraints)
15. [Migration Notes & Gotchas](#15-migration-notes--gotchas)

---

## 1. PROJECT OVERVIEW

**App Name:** Lumina  
**Goal:** High-performance planner and calendar SaaS with:
- Month / Week / Day timeline rendering
- Dense overlap compaction and virtualization
- Drag lifecycle isolation (pointer-safe)
- Task board + daily planner timeline
- Focus sessions and performance analytics
- Outlook + Google provider sync model
- BetterAuth sessions and Neon-backed persistence

**Core rule:** migrate framework wiring only; keep domain engines and interaction systems intact.

---

## 2. TARGET TECH STACK

| Layer | Stack |
|------|-------|
| Frontend framework | Next.js (App Router) |
| Language | TypeScript |
| State | Zustand (client-side interaction state) |
| Auth | BetterAuth |
| ORM | Drizzle ORM |
| Database | Neon Postgres |
| UI | shadcn/ui + Tailwind |
| Motion | Framer Motion |
| External calendars | Microsoft Graph + Google Calendar |
| Deployment target | Vercel |

---

## 3. ROUTING MODEL (REACT ROUTER → APP ROUTER)

| Legacy Path | App Router Target |
|------------|-------------------|
| `/` | `/app/(app)/page.tsx` |
| `/onboarding` | `/app/onboarding/page.tsx` |
| `/tasks` | `/app/(app)/tasks/page.tsx` |
| `/plan` | `/app/(app)/plan/page.tsx` |
| `/performance` | `/app/(app)/performance/page.tsx` |
| `/intelligence` | `/app/(app)/intelligence/page.tsx` |
| `/focus` | `/app/(app)/focus/page.tsx` |
| `/focus/done` | `/app/(app)/focus/done/page.tsx` |
| Auth API | `/app/api/auth/[...all]/route.ts` |
| Sync APIs | `/app/api/sync/outlook/route.ts`, `/app/api/sync/google/route.ts` |

**Navigation API target:** `next/navigation` (`useRouter`, `usePathname`) replacing `react-router-dom`.

---

## 4. DIRECTORY STRUCTURE (LUMINA NEXT)

```txt
/
├── app/
│   ├── layout.tsx
│   └── api/
│       └── auth/
│           └── [...all]/
│               └── route.ts
│
├── components/
│   ├── calendar/
│   ├── focus/
│   ├── planner/
│   ├── tasks/
│   ├── performance/
│   └── ui/
│
├── engine/
│   ├── dragEngine.ts
│   ├── overlapEngine.ts
│   └── slotEngine.ts
│
├── hooks/
├── lib/
│   ├── auth.ts
│   ├── auth-client.ts
│   ├── db.ts
│   └── outlook/
│
├── db/
│   └── schema/
│       ├── index.ts
│       └── users.ts
│
├── store/
├── utils/
└── styles/
```

---

## 5. CORE DOMAIN MODULES (UNCHANGED)

These systems are treated as stable domain logic and should not be rewritten during framework migration:

1. **Calendar overlap engine** (`engine/overlapEngine.ts`, `utils/dateUtils.ts`)
2. **Drag lifecycle** (`store/useDragStore.ts`, `engine/dragEngine.ts`, grid handlers in Day/Week views)
3. **Timeline slot engine** (`engine/slotEngine.ts`)
4. **Scheduling pipeline** (`utils/scheduling/*`)
5. **Task board mechanics** (`components/tasks/*`, `store/useTaskBoardStore.ts`)
6. **Planner timeline mechanics** (`components/planner/*`, `store/useDailyPlanStore.ts`)
7. **Dense event compaction + virtualization** (`components/calendar/virtualization/*`)

---

## 6. STATE MANAGEMENT (ZUSTAND STORES)

| Store | Responsibility |
|------|----------------|
| `useCalendarStore` | App-wide calendar UI state, profile, modal, filters, focus mode toggles |
| `useCalendarEventsStore` | Event CRUD + undo/redo history |
| `useDragStore` | Pointer drag source-of-truth for event move lifecycle |
| `useTaskBoardStore` | Task board columns, task updates, linked event association |
| `useDailyPlanStore` | Planned timeline items per date |
| `useFocusStore` | Active focus session/timer state and session history |
| `usePlannerStore` | Outlook connection + synced external events |
| `useOnboardingStore` | Onboarding completion/preferences |
| `useToastStore` | Local toast queue |

**State design principle:** server persists canonical records; Zustand handles fast client interaction state.

---

## 7. AUTH LAYER (BETTERAUTH)

### Server
- `lib/auth.ts` defines BetterAuth instance.
- `app/api/auth/[...all]/route.ts` proxies `GET` and `POST` to `auth.handler(request)`.

### Client
- `lib/auth-client.ts` creates auth client.
- `components/AuthProvider.tsx` exposes auth context.
- `hooks/useUser.ts` provides user/session convenience state.

### Supported auth modes (target)
- Email/password
- Google OAuth
- Microsoft OAuth

---

## 8. DATABASE LAYER (DRIZZLE + NEON)

### Current schema baseline
- `db/schema/users.ts` (`users` table)
- `db/schema/index.ts` exports schema

### Target tables
- `users`
- `events`
- `tasks`
- `planner_items`
- `focus_sessions`
- `calendars`

### DB access
- `lib/db.ts` initializes Neon + Drizzle client.

---

## 9. CALENDAR PROVIDER SYSTEM

Provider contract (target):
- `fetchEvents(userId, rangeStart, rangeEnd)`
- `createEvent(userId, event)`
- `updateEvent(userId, eventId, updates)`
- `deleteEvent(userId, eventId)`

Provider types:
1. `local` (internal Lumina calendar)
2. `google`
3. `outlook`

Current Outlook plumbing lives in:
- `lib/outlook/outlookAuth.ts`
- `lib/outlook/outlookEvents.ts`
- `services/outlookSyncService.ts`
- `hooks/useOutlookSync.ts`

---

## 10. SYNC + BACKGROUND WORKFLOWS

### Outlook
1. Acquire token via MSAL.
2. Fetch external events from Microsoft Graph.
3. Normalize to Lumina event shape.
4. Merge into planner/calendar store.
5. Poll every 5 minutes (current hook pattern).

### Google (target)
1. OAuth token acquisition/storage.
2. Provider fetch + diff.
3. Upsert into user calendar records.
4. Triggered by API route/cron.

### Background execution target
- API routes callable by Vercel Cron or worker queue.

---

## 11. KEY PAGES / FEATURE SURFACES

| Surface | Primary files |
|--------|----------------|
| Calendar shell | `pages/CalendarPage.tsx`, `components/MonthView.tsx`, `WeekView.tsx`, `DayView.tsx` |
| Event modal | `components/EventModal.tsx` |
| Sidebar/workspace navigation | `components/Sidebar.tsx` |
| Tasks | `pages/TasksPage.tsx`, `components/tasks/*` |
| Plan day | `pages/DailyPlanPage.tsx`, `components/planner/*` |
| Focus mode | `pages/FocusPage.tsx`, `components/focus/*` |
| Performance | `pages/PerformancePage.tsx`, `components/performance/*` |
| Onboarding | `pages/OnboardingPage.tsx`, `components/OnboardingFlow.tsx` |

---

## 12. HOOKS MAP

| Hook | Role |
|-----|------|
| `useCalendar` | Computes visible event instances and filters |
| `useOutlookSync` | Poll-based Outlook synchronization lifecycle |
| `useUser` | BetterAuth session state for UI |
| `useContributionYear` | Performance contribution data transforms |
| `useVirtualWindow` | Generic list virtualization utility |
| `useToast` | Toast convenience helper |

Calendar virtualization-specific hooks are in `components/calendar/virtualization/*`.

---

## 13. ENVIRONMENT VARIABLES

Required / target env vars:

```env
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
NEXT_PUBLIC_BETTER_AUTH_URL=
GEMINI_API_KEY=
```

Optional provider env vars (target):

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
```

---

## 14. PERFORMANCE GUARANTEES AND CONSTRAINTS

Must remain true post-migration:
- No global rerender regressions in timeline views.
- Drag remains pointer-smooth and isolated from unrelated state.
- Virtualization and dense compaction stay active in heavy calendars.
- Scheduler utilities keep deterministic outcomes.
- Client interactions do not block on unnecessary server round-trips.

---

## 15. MIGRATION NOTES & GOTCHAS

1. Existing codebase is a Vite/React Router app with partial Next footprint (`app/layout.tsx`, auth API route).
2. During migration, page logic should be reused as client components; avoid rewriting domain logic.
3. Replace route/navigation adapters only (`react-router-dom` → `next/navigation`).
4. Keep store shape stable to avoid regressions in drag/task/planner/focus UI.
5. Move persistence source from localStorage to DB gradually via hydration boundaries, not full rewrite.
6. Provider sync should be abstracted first, then connected to DB-backed per-user calendars.

---

## APPENDIX — QUICK SYMBOL INDEX

- Auth: `auth`, `authClient`, `LuminaAuthProvider`, `useUser`
- Calendar: `useCalendar`, `calculateOverlaps`, `buildHourOccupancyMap`, `calculateDragCollision`
- Stores: `useCalendarStore`, `useCalendarEventsStore`, `useDragStore`, `useTaskBoardStore`, `useDailyPlanStore`, `useFocusStore`
- Sync: `connectOutlook`, `acquireToken`, `fetchOutlookEvents`, `syncOutlookCalendar`

