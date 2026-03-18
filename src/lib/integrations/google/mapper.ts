import 'server-only';

// ── Google API shapes (subset we actually use) ────────────────────────────────

export interface GoogleCalendarListEntry {
  id: string;
  summary?: string;
  description?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  accessRole?: 'freeBusyReader' | 'reader' | 'writer' | 'owner';
  selected?: boolean;
}

export interface GoogleCalendarListResponse {
  kind: string;
  nextSyncToken?: string;
  nextPageToken?: string;
  items: GoogleCalendarListEntry[];
}

export interface GoogleEventDateTime {
  dateTime?: string; // ISO 8601 — timed events
  date?: string;     // YYYY-MM-DD — all-day events
  timeZone?: string;
}

export interface GoogleEvent {
  id: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  etag?: string;
  updated?: string; // ISO — last modification time
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
  organizer?: { email?: string; displayName?: string };
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
  colorId?: string;
  recurringEventId?: string;
  originalStartTime?: GoogleEventDateTime;
}

export interface GoogleEventsListResponse {
  kind: string;
  nextSyncToken?: string;
  nextPageToken?: string;
  items: GoogleEvent[];
}

// ── Mapped shapes ─────────────────────────────────────────────────────────────

export interface MappedGoogleCalendar {
  externalId: string;
  name: string;
  color: string;
  isPrimary: boolean;
  isReadOnly: boolean;
}

export interface MappedGoogleEvent {
  title: string;
  description: string | null;
  location: string | null;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  timezone: string;
  externalEventId: string;
  externalEtag: string | null;
  sourceUpdatedAt: Date | null;
  meetingUrl: string | null;
  organizerEmail: string | null;
}

// ── Calendar mapper ───────────────────────────────────────────────────────────

export function mapGoogleCalendar(entry: GoogleCalendarListEntry): MappedGoogleCalendar {
  return {
    externalId: entry.id,
    name: entry.summary?.trim() || 'Google Calendar',
    color: entry.backgroundColor ?? '#6D59E0',
    isPrimary: entry.primary === true,
    isReadOnly: entry.accessRole === 'reader' || entry.accessRole === 'freeBusyReader',
  };
}

// ── Event mapper ──────────────────────────────────────────────────────────────

/** Returns null for cancelled / malformed events (caller should skip). */
export function mapGoogleEvent(
  event: GoogleEvent,
): MappedGoogleEvent | null {
  if (event.status === 'cancelled') return null;
  if (!event.id) return null;

  const isAllDay = Boolean(event.start.date && !event.start.dateTime);
  const timezone = event.start.timeZone ?? event.end.timeZone ?? 'UTC';

  let startTime: Date;
  let endTime: Date;

  if (isAllDay) {
    // All-day: start.date = "YYYY-MM-DD", end.date = next day (exclusive)
    startTime = new Date(`${event.start.date}T00:00:00Z`);
    // Keep Google's exclusive end date as-is — it satisfies endTime > startTime
    endTime = new Date(`${event.end.date ?? event.start.date}T00:00:00Z`);

    // If end == start (malformed), add 1 day
    if (endTime <= startTime) {
      endTime = new Date(startTime.getTime() + 86_400_000);
    }
  } else {
    if (!event.start.dateTime) return null;
    startTime = new Date(event.start.dateTime);
    if (isNaN(startTime.getTime())) return null;

    if (event.end.dateTime) {
      endTime = new Date(event.end.dateTime);
    } else {
      // Fallback: start + 1 hour
      endTime = new Date(startTime.getTime() + 3_600_000);
    }

    if (isNaN(endTime.getTime())) {
      endTime = new Date(startTime.getTime() + 3_600_000);
    }

    // Enforce endTime > startTime
    if (endTime <= startTime) {
      endTime = new Date(startTime.getTime() + 60_000);
    }
  }

  // Extract meeting URL (Google Meet or first video entry)
  let meetingUrl: string | null = null;
  const entryPoints = event.conferenceData?.entryPoints ?? [];
  const videoEntry = entryPoints.find((ep) => ep.entryPointType === 'video');
  if (videoEntry?.uri) meetingUrl = videoEntry.uri;

  const sourceUpdatedAt = event.updated ? new Date(event.updated) : null;

  return {
    title: (event.summary ?? '(No title)').slice(0, 512),
    description: event.description?.slice(0, 4096) ?? null,
    location: event.location?.slice(0, 512) ?? null,
    startTime,
    endTime,
    isAllDay,
    timezone,
    externalEventId: event.id,
    externalEtag: event.etag ?? null,
    sourceUpdatedAt,
    meetingUrl,
    organizerEmail: event.organizer?.email ?? null,
  };
}
