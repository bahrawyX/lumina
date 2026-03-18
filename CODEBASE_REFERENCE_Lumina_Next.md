    # LUMINA NEXT - FULL AUDIT REFERENCE
> Intended for engineering and LLM consumption.
>
> This is a code-verified audit of the current repository state, including runtime route contracts, database schema, client/store contracts, and concrete database improvements.
>
> Last updated: 2026-03-18

---

## 0b. Auth vs Integration Separation Addendum (2026-03-18)

This addendum captures the full auth/integration architecture split completed in this pass.

### 0b.1 Auth-vs-integration separation

**Auth flow (identity-only):**
- Google login: `openid`, `email`, `profile` only. Calendar scopes removed from `auth.ts`.
- Microsoft login: identity only. No calendar scopes.
- Both providers are registered in `src/lib/auth.ts` without any calendar scopes.

**Integration flow (explicit user action):**
- User must explicitly click "Connect Google Calendar" or "Connect Outlook Calendar".
- This triggers a **separate** OAuth popup that is NOT the BetterAuth sign-in flow.
- Each integration popup is bound to the authenticated user's session (server verifies session on connect + callback).
- Tokens are stored in the `integrations` table, keyed by `(userId, provider)`.

### 0b.2 New API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/integrations/google/connect` | GET | Initiates Google Calendar OAuth (calendar.readonly + offline + consent). Redirects to Google. |
| `/api/integrations/google/callback` | GET | Receives Google code, exchanges for tokens, upserts into `integrations`, redirects to popup-complete. |
| `/api/integrations/microsoft/connect` | GET | Initiates Microsoft Calendar OAuth (Calendars.Read + select_account). Redirects to Microsoft. |
| `/api/integrations/microsoft/callback` | GET | Receives Microsoft code, exchanges for tokens, upserts into `integrations`, redirects to popup-complete. |
| `/api/integrations/status` | GET | Returns `{ google: { connected }, microsoft: { connected } }` for the authenticated user. Never exposes tokens. |

### 0b.3 CSRF state protection

Each connect endpoint sets an httpOnly cookie (`lumina_google_connect_state` / `lumina_microsoft_connect_state`) with a random nonce. The callback verifies the URL `state` parameter matches the cookie before processing the OAuth code. Cookie expires after 10 minutes.

### 0b.4 Token storage rule

- Google tokens: stored in `integrations` with `provider='google'`, upserted on `(userId, provider)` unique index.
- Microsoft tokens: stored in `integrations` with `provider='microsoft'`, upserted on `(userId, provider)` unique index.
- If Google does not return a `refresh_token` (user already consented), the existing `refresh_token` from DB is preserved.
- `refreshToken` is NEVER returned to the client.

### 0b.5 Redirect URI manual prerequisites

The following redirect URIs must be registered in external OAuth consoles before the integration flow works:

- **Google Cloud Console**: `{BETTER_AUTH_URL}/api/integrations/google/callback`
- **Azure AD App Registration**: `{BETTER_AUTH_URL}/api/integrations/microsoft/callback`

The existing BetterAuth login redirect URIs (`/api/auth/callback/google`, `/api/auth/callback/microsoft`) remain registered and unchanged.

### 0b.6 UI changes

**Sidebar (`src/components/Sidebar.tsx`):**
- `startSocialSignInPopup` removed. Replaced by `openIntegrationPopup(provider)` which opens `/api/integrations/{provider}/connect` directly in a popup.
- `handleGoogleCalendarConnect` and `handleOutlookConnect` now use `openIntegrationPopup`.
- `seedDemoOutlookEvent` usage removed.
- `useEffect` on mount calls `/api/integrations/status` to restore connected state after page reload.

**OnboardingFlow (`src/components/OnboardingFlow.tsx`):**
- `seedDemoOutlookEvent` import removed.
- `handleOutlookConnect` (provider='outlook') now uses `openIntegrationPopup('microsoft')` instead of BetterAuth social sign-in popup.
- `startSocialSignInPopup('google')` for the Google LOGIN step remains correct and unchanged (login-only scopes).

### 0b.7 Outlook sync fix

**`src/hooks/useOutlookSync.ts`:**
- Previously called `syncOutlookCalendar(timezone)` which was a dead stub returning localStorage events.
- Now calls `POST /api/sync/outlook` (the real server endpoint that reads from `integrations` and calls Microsoft Graph).
- Maps raw Graph API events using `mapOutlookEventToLuminaEvent` from `src/lib/outlook/outlookEvents.ts`.
- Auto-disconnects (`setOutlookConnected(false)`) if the server responds 401 (token expired) or 404 (integration not connected).

### 0b.8 MSAL status

No MSAL library code exists in this codebase. Zero live usages of `PublicClientApplication`, `loginPopup`, `acquireTokenSilent`, `@azure/msal-*`. All references were already removed in a prior migration.

### 0b.9 Microsoft: prompt=select_account

`/api/integrations/microsoft/connect` includes `prompt=select_account` in the OAuth URL. This forces Microsoft to always present the account picker, preventing silent reuse of a cached developer account across different users.

### 0b.10 Scope guardrails

- No Zustand stores were modified in this pass.
- No drag/layout/density/virtualization engine logic was modified.
- Existing local event CRUD is unchanged.
- BetterAuth login flows are unchanged.

---

## 0. Final Tightening Addendum (2026-03-18)

This addendum captures the final strict DB-contract tightening pass completed after the baseline audit.

### 0.1 Task status contract

- Canonical DB and API write status remains: `todo | in_progress | done | archived`.
- Legacy UI write value `doing` is still accepted and normalized to `in_progress`.
- `archived` is no longer collapsed into `done`.
- Default board query now excludes archived tasks explicitly, while allowing opt-in via `includeArchived=true|1`.

### 0.2 Event provider and source vocabulary

- Canonical provider at API and DB boundary: `local | google | outlook`.
- Canonical source at API and DB boundary: `manual | google | microsoft | scheduler`.
- Legacy values are normalized once at boundary:
   - provider: `microsoft` -> `outlook`, `lumina/manual/local` -> `local`
   - source: `lumina/local` -> `manual`, `outlook` -> `microsoft`
- API event reads now return canonical source/provider from DB.
- UI-facing persistence adapter maps canonical values to existing UI source vocabulary (`lumina | outlook`) without changing store contracts.

### 0.3 Migration backfill explicit mapping

- Migration `drizzle/0002_pink_komodo.sql` now includes explicit documented legacy source -> canonical provider mapping rules:
   - `lumina/local/manual/scheduler` -> `local`
   - `outlook/microsoft` -> `outlook`
   - `google` -> `google`
   - fallback -> `local`

### 0.4 Sync security tightening

- `/api/sync/outlook` is session-bound.
- Provider token is loaded only from DB integration rows owned by `session.user.id`.
- Client-supplied access tokens are not trusted.
- Missing integration, non-active integration, and expired token all fail safely.

### 0.5 Scope guardrails honored

- No Zustand stores were modified in this tightening pass.
- No drag/layout/density/virtualization engine logic was modified in this tightening pass.
- Existing schema hardening constraints remain intact.

---

## 1. Audit Scope

This document reflects the current behavior of:

- Next.js App Router pages and API routes
- BetterAuth server and client wiring
- Drizzle schema definitions under `src/db/schema`
- Zustand store contracts and persistence adapters
- Calendar/task/focus data flow from UI -> API -> DB

Primary audited files include:

- `src/app/api/auth/[...all]/route.ts`
- `src/app/api/events/route.ts`
- `src/app/api/events/[id]/route.ts`
- `src/app/api/tasks/route.ts`
- `src/app/api/tasks/[id]/route.ts`
- `src/app/api/focus-sessions/route.ts`
- `src/app/api/focus-sessions/[id]/route.ts`
- `src/app/api/sync/outlook/route.ts`
- `src/app/api/sync/google/route.ts`
- `src/lib/auth.ts`
- `src/lib/auth-client.ts`
- `src/lib/db.ts`
- `src/db/schema/*.ts`
- `src/store/*.ts`
- `src/lib/persistence/*.ts`

---

## 2. System Architecture Summary

### 2.1 Runtime layers

1. UI and interaction state
   - Zustand stores handle local interaction speed, undo/redo, drag state, modal state, and ephemeral timer data.
2. Persistence adapters
   - Thin fetch wrappers under `src/lib/persistence` call API routes.
3. API boundary
   - Route handlers in `src/app/api/*` validate session and transform payloads.
4. DB access
   - Drizzle ORM + Neon client via `src/lib/db.ts`.
5. Auth boundary
   - BetterAuth configured in `src/lib/auth.ts` and exposed via catch-all auth route.

### 2.2 Canonical source-of-truth status

- Events: DB-backed (with dev-only localStorage fallback on hydration failure).
- Tasks: DB-backed (with dev-only localStorage fallback on hydration failure).
- Focus session history: DB-backed (active running timer state remains localStorage by design).
- Daily planner items: localStorage-only today (DB table exists but runtime API is intentionally deferred).

---

## 3. Routing Inventory

### 3.1 App pages

- `/` -> app shell main calendar
- `/onboarding` -> onboarding flow
- `/tasks` -> task board
- `/plan` -> daily planning view
- `/focus` -> focus view
- `/performance` -> performance dashboard
- `/intelligence` -> intelligence/profile view

### 3.2 API routes

- `/api/auth/[...all]`
- `/api/events`
- `/api/events/[id]`
- `/api/tasks`
- `/api/tasks/[id]`
- `/api/focus-sessions`
- `/api/focus-sessions/[id]`
- `/api/sync/outlook` — POST, session-bound, reads token from `integrations` table
- `/api/sync/google` — POST, delegates to `runFullGoogleSync`
- `/api/integrations/google/connect` — GET, initiates Google Calendar OAuth popup
- `/api/integrations/google/callback` — GET, handles Google Calendar OAuth callback
- `/api/integrations/google/calendars` — GET/POST, list/import Google calendars
- `/api/integrations/google/events/sync` — POST, sync Google events into DB
- `/api/integrations/microsoft/connect` — GET, initiates Microsoft Calendar OAuth popup
- `/api/integrations/microsoft/callback` — GET, handles Microsoft Calendar OAuth callback
- `/api/integrations/status` — GET, returns connection status for both providers (no tokens)

---

## 4. Auth Layer (BetterAuth)

### 4.1 Server config

Location: `src/lib/auth.ts`

- Auth engine: BetterAuth + Drizzle adapter (`provider: 'pg'`, `usePlural: true`).
- Session DB requirement: throws hard error if DB client unavailable.
- Email/password login enabled.
- Social providers are conditionally registered:
  - Google only if both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` exist.
  - Microsoft only if both `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` exist.

### 4.2 Auth route adapters and aliases

Location: `src/app/api/auth/[...all]/route.ts`

- Alias 1: `/session` is normalized to `/get-session`.
- Alias 2: `/sign-in/microsoft` is converted to `/sign-in/social` POST body with:
  - `provider: "microsoft"`
  - `callbackURL` from query or origin root fallback

This alias protects compatibility with UI calls that still hit provider-specific sign-in path formats.

### 4.3 Client auth

Location: `src/lib/auth-client.ts`, `src/components/AuthProvider.tsx`, `src/hooks/useUser.ts`

- Client base URL resolves to `${origin}/api/auth` when no public env override exists.
- `useUser` exposes `{ user, session, isAuthenticated, isLoading, refetch }`.

### 4.4 OAuth popup completion

Location: `src/app/auth/popup-complete/page.tsx`

- Popup page posts `lumina:oauth-complete` to opener on same origin and closes window.
- Used by onboarding and sidebar popup social sign-in flows.

---

## 5. API Contracts (Current Behavior)

All domain routes below require authenticated session except sync routes (see notes).

### 5.1 Events API

#### GET `/api/events`

Response: `200` array of mapped event objects:

```json
[
  {
    "id": "uuid",
    "title": "string",
    "date": "YYYY-MM-DD",
    "startTime": "HH:mm",
    "endTime": "HH:mm",
    "description": "string | undefined",
    "location": "string | undefined",
    "isAllDay": false,
    "completed": false,
    "category": "work",
    "linkedTaskId": null
  }
]
```

Notes:

- `completed`, `category`, `linkedTaskId` are currently synthesized defaults, not loaded from DB columns.

#### POST `/api/events`

Request body accepted (minimum required):

```json
{
  "title": "required string",
  "date": "required YYYY-MM-DD",
  "startTime": "optional HH:mm",
  "endTime": "optional HH:mm",
  "description": "optional string",
  "location": "optional string",
  "isAllDay": "optional boolean"
}
```

Behavior:

- Creates or reuses a primary local calendar (`provider=local`, `isPrimary=true`) per user.
- Builds UTC timestamps from date/time.
- Inserts event with `source='manual'`.

Response:

```json
{ "id": "uuid" }
```

#### PATCH `/api/events/[id]`

Patchable fields:

- `title`
- `description`
- `location`
- `isAllDay`
- `date` + `startTime` (rebuild `startTime` timestamp)
- `date` + `endTime` (rebuild `endTime` timestamp)

Ownership check:

- Update where `events.id = :id AND events.userId = :sessionUserId`.

Response:

```json
{ "ok": true }
```

#### DELETE `/api/events/[id]`

Ownership check same as PATCH.

Response:

```json
{ "ok": true }
```

### 5.2 Tasks API

#### GET `/api/tasks`

Response: mapped task array:

```json
[
  {
    "id": "uuid",
    "title": "string",
    "description": "string | undefined",
    "status": "todo | in_progress | done",
    "priority": "low | medium | high",
    "dueDate": "YYYY-MM-DD | null",
    "durationMinutes": 30,
    "order": 0,
    "context": null,
    "linkedEventId": null,
    "createdAt": "ISO",
    "updatedAt": "ISO"
  }
]
```

Important mismatch:

- API emits `in_progress` while client type system and board logic primarily use `doing`.

#### POST `/api/tasks`

Request body accepted:

```json
{
  "title": "required string",
  "description": "optional string",
  "status": "optional todo|in_progress|done",
  "priority": "optional low|medium|high",
  "dueDate": "optional ISO/date string or null",
  "durationMinutes": "optional number"
}
```

Response:

```json
{ "id": "uuid" }
```

#### PATCH `/api/tasks/[id]`

Patchable fields:

- `title`
- `description`
- `status` (`todo|in_progress|done`)
- `priority`
- `durationMinutes` -> mapped to `estimatedMinutes`
- `dueDate` (`null` clears)

Ownership check:

- Update where `tasks.id = :id AND tasks.userId = :sessionUserId`.

#### DELETE `/api/tasks/[id]`

Ownership check same as PATCH.

Response:

```json
{ "ok": true }
```

### 5.3 Focus Sessions API

#### GET `/api/focus-sessions`

Response shape:

```json
[
  {
    "id": "uuid",
    "taskId": "uuid | ''",
    "taskTitle": "",
    "startTime": "ISO",
    "endTime": "ISO",
    "duration": 1500,
    "completed": true
  }
]
```

Notes:

- `taskTitle` is not persisted in DB and is returned as empty string.
- `duration` is returned in seconds but DB stores `durationMinutes`.

#### POST `/api/focus-sessions`

Request body accepted:

```json
{
  "startTime": "required ISO",
  "endTime": "required ISO",
  "duration": "required number (seconds)",
  "taskId": "optional uuid"
}
```

Behavior:

- Validates timestamps and end > start.
- Converts seconds to rounded minutes (minimum 1).

Response:

```json
{ "id": "uuid" }
```

#### DELETE `/api/focus-sessions/[id]`

Ownership check:

- Delete where `focus_sessions.id = :id AND focus_sessions.userId = :sessionUserId`.

Response:

```json
{ "ok": true }
```

### 5.4 Sync API

#### POST `/api/sync/outlook`

Request body accepted:

```json
{
  "timezone": "optional string"
}
```

Behavior:

- Requires authenticated session (`401` if missing).
- Loads the user's Microsoft integration token from `integrations` table (session-bound).
- Returns `404` if integration not connected, `409` if status is not active, `401` if token is expired.
- Calls `fetchOutlookEvents(accessToken)` via Microsoft Graph.
- Returns `{ ok, eventCount, events }` where events are raw Graph API shapes.
- Client (`useOutlookSync`) maps events using `mapOutlookEventToLuminaEvent`.
- Client auto-disconnects on `401`/`404` responses.

Security: client-supplied tokens are never used. Token is always loaded from DB by `session.user.id`.

#### POST `/api/sync/google`

Behavior:

- Requires authenticated session.
- Delegates to `runFullGoogleSync(userId)`.
- Returns sync result including imported calendar/event counts.

---

## 6. Database Schema (Current)

### 6.1 Auth tables

#### `users`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | gen random | PK |
| email | varchar(255) | no | - | unique |
| name | text | yes | null | display name |
| email_verified | boolean | no | false | |
| image | text | yes | null | |
| avatar | text | yes | null | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

Indexes:

- `users_email_idx` on `email`

#### `accounts`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | gen random | PK |
| account_id | text | no | - | provider account id |
| provider_id | text | no | - | provider key |
| user_id | uuid | no | - | FK -> users(id) cascade delete |
| access_token | text | yes | null | |
| refresh_token | text | yes | null | |
| id_token | text | yes | null | |
| access_token_expires_at | timestamptz | yes | null | |
| refresh_token_expires_at | timestamptz | yes | null | |
| scope | text | yes | null | |
| password | text | yes | null | for password auth mode |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

Indexes and uniques:

- `accounts_user_id_idx` on `user_id`
- `accounts_provider_id_idx` on `provider_id`
- unique `accounts_provider_account_unique` on (`provider_id`, `account_id`)

#### `sessions`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | gen random | PK |
| expires_at | timestamptz | no | - | |
| token | text | no | - | unique token |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |
| ip_address | text | yes | null | |
| user_agent | text | yes | null | |
| user_id | uuid | no | - | FK -> users(id) cascade delete |

Indexes and uniques:

- unique `sessions_token_unique` on `token`
- `sessions_user_id_idx` on `user_id`

#### `verifications`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | gen random | PK |
| identifier | text | no | - | |
| value | text | no | - | |
| expires_at | timestamptz | no | - | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

Index:

- `verifications_identifier_idx` on `identifier`

### 6.2 Product/domain tables

#### Enum: `calendar_provider`

- `google`
- `microsoft`
- `local`

#### `calendars`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | gen random | PK |
| user_id | uuid | no | - | FK -> users(id) cascade delete |
| provider | calendar_provider | no | - | google/microsoft/local |
| external_id | varchar(255) | yes | null | external calendar id |
| name | varchar(255) | no | - | |
| color | varchar(32) | no | '#6D59E0' | |
| is_primary | boolean | no | false | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

Indexes:

- `calendars_user_id_idx` on `user_id`
- `calendars_provider_idx` on `provider`

#### Enum: `event_source`

- `manual`
- `google`
- `microsoft`
- `scheduler`

#### `events`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | gen random | PK |
| user_id | uuid | no | - | FK -> users(id) cascade delete |
| calendar_id | uuid | no | - | FK -> calendars(id) cascade delete |
| title | varchar(512) | no | - | |
| description | text | yes | null | |
| start_time | timestamptz | no | - | |
| end_time | timestamptz | no | - | must be > start_time |
| is_all_day | boolean | no | false | |
| location | varchar(512) | yes | null | |
| is_task_generated | boolean | no | false | |
| source | event_source | no | manual | |
| external_id | varchar(255) | yes | null | external provider event id |
| last_synced_at | timestamptz | yes | null | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

Indexes and checks:

- `events_user_start_time_idx` on (`user_id`, `start_time`)
- `events_user_end_time_idx` on (`user_id`, `end_time`)
- `events_calendar_id_idx` on `calendar_id`
- `events_external_id_idx` on `external_id`
- check `events_time_range_check`: `end_time > start_time`

#### Enum: `task_status`

- `todo`
- `in_progress`
- `done`

#### Enum: `task_priority`

- `low`
- `medium`
- `high`

#### `tasks`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | gen random | PK |
| user_id | uuid | no | - | FK -> users(id) cascade delete |
| title | varchar(512) | no | - | |
| description | text | yes | null | |
| status | task_status | no | todo | |
| priority | task_priority | no | medium | |
| estimated_minutes | integer | no | 30 | |
| due_date | timestamptz | yes | null | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

Indexes:

- `tasks_user_id_idx` on `user_id`
- `tasks_status_idx` on `status`

#### `planner_items`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | gen random | PK |
| user_id | uuid | no | - | FK -> users(id) cascade delete |
| task_id | uuid | no | - | FK -> tasks(id) cascade delete |
| start_time | timestamptz | no | - | |
| end_time | timestamptz | no | - | must be > start_time |
| is_auto_scheduled | boolean | no | false | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

Indexes and checks:

- `planner_items_user_start_time_idx` on (`user_id`, `start_time`)
- check `planner_items_time_range_check`: `end_time > start_time`

#### `focus_sessions`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | gen random | PK |
| user_id | uuid | no | - | FK -> users(id) cascade delete |
| task_id | uuid | yes | null | FK -> tasks(id), on delete set null |
| start_time | timestamptz | no | - | |
| end_time | timestamptz | no | - | |
| duration_minutes | integer | no | - | must be > 0 |
| created_at | timestamptz | no | now() | |

Indexes and checks:

- `focus_sessions_user_id_idx` on `user_id`
- check `focus_sessions_duration_check`: `duration_minutes > 0`
- check `focus_sessions_time_range_check`: `end_time > start_time`

#### Enum: `integration_provider`

- `google`
- `microsoft`

#### `integrations`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | no | gen random | PK |
| user_id | uuid | no | - | FK -> users(id) cascade delete |
| provider | integration_provider | no | - | google/microsoft |
| access_token | text | no | - | |
| refresh_token | text | no | - | |
| expires_at | timestamptz | no | - | |
| scope | text | yes | null | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

Indexes and uniques:

- `integrations_user_provider_idx` on (`user_id`, `provider`)
- unique `integrations_user_provider_unique` on (`user_id`, `provider`)

---

## 7. Contract Matrix: User and Calendar Event

This section answers: "what a user should have" and "what a calendar event takes".

### 7.1 User contract (current)

#### DB user row (`users`)

Required:

- `id`
- `email`
- `email_verified`
- `created_at`
- `updated_at`

Optional:

- `name`
- `image`
- `avatar`

#### Runtime session user (from BetterAuth)

Typical fields consumed in app:

- `user.id`
- `user.email`
- `user.name`
- `user.image` (if present)
- plus a `session` object with token/session metadata

#### Recommended user profile extensions (if you want DB-first onboarding)

Current onboarding values are local/persist-store only. If you want them in DB, add profile columns/table for:

- `display_name`
- `role`
- `timezone`
- `work_start_time`
- `work_end_time`
- `focus_preference`
- `focus_session_length`
- `focus_goals` (jsonb/text[])

### 7.2 Calendar event contract (current)

#### Client-side type (`CalendarEvent`)

Current UI model includes many fields:

- `id`, `title`, `description`, `date`, `startTime`, `endTime`, `timezone`
- `location`, `category`, `color`
- optional recurrence/exceptions/meetingLink
- optional `completed`, `source`, `editable`, `outlookId`, `organizer`, `linkedTaskId`

#### API create contract (`POST /api/events`)

Required today:

- `title`
- `date`

Optional today:

- `startTime`, `endTime`, `description`, `location`, `isAllDay`

Ignored today even if sent:

- `timezone`, `category`, `color`, `completed`, `linkedTaskId`, recurrence fields, meeting link fields

#### DB event row (`events`)

Persisted today:

- `user_id`, `calendar_id`, `title`, `description`, `start_time`, `end_time`, `is_all_day`, `location`, `source`, `external_id`, `last_synced_at`, `is_task_generated`

Not persisted as first-class columns today:

- `category`, `color`, `timezone`, `completed`, `linked_task_id`, recurrence rules, meeting link, organizer

---

## 8. Store and Persistence Behavior

### 8.1 Hydration

`src/components/PersistenceBootstrap.tsx`:

- Runs once in app shell.
- Fetches events, tasks, focus history in parallel.
- Calls each store hydrate method even for empty arrays, setting `dbHydrated=true`.
- Dev-only fallback: if fetch fails, hydrate from localStorage.

### 8.2 Persistence adapters

`src/lib/persistence/eventsPersistence.ts`

- fetch/create/update/delete wrappers for `/api/events`

`src/lib/persistence/tasksPersistence.ts`

- fetch/create/update/delete wrappers for `/api/tasks`

`src/lib/persistence/focusPersistence.ts`

- fetch/create/delete wrappers for `/api/focus-sessions`

`src/lib/persistence/plannerPersistence.ts`

- Explicit no-op stub by design until planner DB workflow is enabled.

---

## 9. Critical Gaps and Risks

Severity uses: High, Medium, Low.

1. High - task status enum mismatch across layers.
   - DB/API use `in_progress`.
   - Client task type and helpers use `doing`.
   - Risk: column filtering/reordering logic divergence and inconsistent UI state.

2. High - event contract mismatch (UI richer than persisted model).
   - UI carries `category/color/timezone/linkedTaskId/completed`, but API/DB largely drop or synthesize these.
   - Risk: silent data loss and non-deterministic behavior after reload.

3. ~~High - sync routes are not session-guarded.~~ **RESOLVED (2026-03-18)**
   - `/api/sync/outlook` is now fully session-bound.
   - Token is loaded from `integrations` by `session.user.id`, never from request body.

4. Medium - planner table exists but planner runtime is local-only.
   - DB schema suggests persistence, app behavior does not use it.
   - Risk: schema drift and false assumptions during analytics/reporting.

5. ~~Medium - integrations table not wired into active sync path.~~ **RESOLVED (2026-03-18)**
   - Integration connect flow writes tokens into `integrations` via dedicated OAuth callback endpoints.
   - `/api/sync/outlook` reads tokens from `integrations` by `session.user.id`.
   - Google Calendar sync reads from `integrations` via `getGoogleAccessToken()` in `src/lib/integrations/google/token.ts`.
   - Integration status endpoint (`/api/integrations/status`) exposes connected state to UI without tokens.

6. Medium - no unique DB guarantee for one primary local calendar per user.
   - App logic creates or reuses one, but DB does not enforce uniqueness.

7. Low - source vocabulary mismatch.
   - DB event source enum: `manual/google/microsoft/scheduler`.
   - Client event source type: `lumina/outlook`.

---

## 10. Recommended DB Improvement Plan

### 10.1 P0 (must fix first)

1. Unify task status vocabulary.
   - Choose one canonical set and apply end-to-end.
   - Recommended: use `todo/doing/done` everywhere in UI + API + DB, or keep `in_progress` everywhere and map once at UI boundary.

2. Decide canonical event domain contract.
   - If product needs category/color/linking/completion, add real DB columns and API support.

3. Session-protect sync endpoints.
   - Require auth session and bind provider operations to `session.user.id`.

4. Define integration token ownership lifecycle.
   - Persist OAuth tokens in `integrations` with refresh handling and expiry refresh job.

### 10.2 P1 (strongly recommended)

1. Enforce one primary local calendar per user.
   - Add unique partial index on `(user_id)` where `provider='local' AND is_primary=true`.

2. Strengthen external sync dedupe.
   - Add unique index for provider event identity (for example `(calendar_id, external_id)` where external_id is not null).

3. Add validation checks.
   - `tasks.estimated_minutes > 0`.
   - Optional stricter constraints around all-day event time handling.

4. Decide planner persistence rollout.
   - Either wire `planner_items` with API routes, or postpone schema to avoid dead tables.

### 10.3 P2 (quality)

1. Move onboarding profile fields into DB if cross-device consistency is required.
2. Normalize due-date semantics to `date` (instead of timestamp) if time-of-day is not meaningful.
3. Add audit columns/versioning strategy for conflict resolution if multi-device edits increase.

---

## 11. Suggested Target Contract (User + Event)

This is a practical target if your objective is "make DB better" with minimal product breakage.

### 11.1 Suggested `user_profiles` table

Keep `users` for auth identity and add profile table:

- `user_id` (pk/fk -> users.id)
- `display_name` text
- `role` text
- `timezone` text not null
- `work_start_time` time
- `work_end_time` time
- `focus_preference` enum (`morning|midday|evening|none`)
- `focus_session_length` enum or integer minutes
- `focus_goals` jsonb
- `created_at`, `updated_at`

### 11.2 Suggested event columns to close current gaps

Add to `events` if they are product requirements:

- `timezone` text not null default 'UTC'
- `category` varchar(64)
- `color` varchar(32)
- `completed` boolean not null default false
- `linked_task_id` uuid null references tasks(id) on delete set null
- `organizer` text
- `meeting_url` text
- `recurrence_rule` jsonb
- `recurrence_parent_id` uuid null references events(id)

Then update GET/POST/PATCH route mappings to preserve these fields end-to-end.

---

## 12. Immediate Action Checklist

1. Pick canonical task status enum and migrate one layer to match.
2. Finalize event canonical schema (what must persist vs what can remain derived).
3. Patch `/api/events` and `/api/events/[id]` to persist chosen event fields.
4. Add auth checks to `/api/sync/outlook` and future Google sync route.
5. Add DB uniqueness constraints for local primary calendar and external event identity.
6. Decide planner persistence timeline and either implement routes or defer schema.

---

## 13. Quick Reality Check

Today, the system is functional for core event/task/focus persistence and auth, but it is not yet schema-consistent across all layers.

The highest-value database work is:

- normalize contracts across UI/API/DB,
- remove enum mismatches,
- and persist the fields the UI already treats as first-class.

That will eliminate silent data loss and make analytics/sync improvements much safer.
