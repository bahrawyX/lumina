import 'server-only';

// ── Microsoft Graph API shapes ─────────────────────────────────────────────

export interface MicrosoftCalendar {
  id: string;
  name: string;
  color?: string;
  isDefaultCalendar?: boolean;
  canEdit?: boolean;
}

export interface MicrosoftEventDateTime {
  dateTime: string;
  timeZone: string;
}

export interface MicrosoftEvent {
  id: string;
  subject: string;
  isAllDay: boolean;
  isCancelled: boolean;
  start: MicrosoftEventDateTime;
  end: MicrosoftEventDateTime;
  lastModifiedDateTime: string;
  changeKey: string;
  location?: { displayName?: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
  onlineMeetingUrl?: string;
  bodyPreview?: string;
}

// ── Mapped output shapes ───────────────────────────────────────────────────

export interface MappedMicrosoftCalendar {
  externalId: string;
  name: string;
  color: string;
  isPrimary: boolean;
  isReadOnly: boolean;
}

export interface MappedMicrosoftEvent {
  title: string;
  description: string | null;
  location: string | null;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  timezone: string;
  externalEventId: string;
  externalEtag: string | null;   // changeKey
  sourceUpdatedAt: Date | null;  // lastModifiedDateTime
  meetingUrl: string | null;
  organizerEmail: string | null;
}

// Microsoft Graph calendar color enum → hex
const MS_COLOR_MAP: Record<string, string> = {
  auto:        '#6D59E0',
  lightBlue:   '#0078D4',
  lightGreen:  '#36B37E',
  lightOrange: '#F4A429',
  lightGray:   '#8A8886',
  lightYellow: '#FFCA28',
  lightTeal:   '#00B8A9',
  lightPink:   '#E3008C',
  lightBrown:  '#A4262C',
  lightRed:    '#D13438',
  maxColor:    '#6D59E0',
};

export function mapMicrosoftCalendar(
  cal: MicrosoftCalendar,
): MappedMicrosoftCalendar {
  return {
    externalId: cal.id,
    name: cal.name || 'Outlook Calendar',
    color: MS_COLOR_MAP[cal.color ?? 'auto'] ?? '#0078D4',
    isPrimary: cal.isDefaultCalendar === true,
    isReadOnly: cal.canEdit === false,
  };
}

export function mapMicrosoftEvent(
  event: MicrosoftEvent,
): MappedMicrosoftEvent | null {
  if (event.isCancelled) return null;
  if (!event.id) return null;

  const timezone = event.start.timeZone ?? event.end.timeZone ?? 'UTC';

  let startTime: Date;
  let endTime: Date;

  if (event.isAllDay) {
    // Graph all-day events return local midnight as dateTime, e.g. "2025-03-18T00:00:00.0000000"
    startTime = new Date(event.start.dateTime.slice(0, 10) + 'T00:00:00Z');
    endTime   = new Date(event.end.dateTime.slice(0, 10) + 'T00:00:00Z');
    if (endTime <= startTime) {
      endTime = new Date(startTime.getTime() + 86_400_000);
    }
  } else {
    startTime = new Date(event.start.dateTime);
    if (isNaN(startTime.getTime())) return null;

    endTime = new Date(event.end.dateTime);
    if (isNaN(endTime.getTime())) {
      endTime = new Date(startTime.getTime() + 3_600_000);
    }
    if (endTime <= startTime) {
      endTime = new Date(startTime.getTime() + 60_000);
    }
  }

  return {
    title: (event.subject || '(No Subject)').slice(0, 512),
    description: event.bodyPreview?.slice(0, 4096) ?? null,
    location: event.location?.displayName?.slice(0, 512) ?? null,
    startTime,
    endTime,
    isAllDay: event.isAllDay,
    timezone,
    externalEventId: event.id,
    externalEtag: event.changeKey ?? null,
    sourceUpdatedAt: event.lastModifiedDateTime
      ? new Date(event.lastModifiedDateTime)
      : null,
    meetingUrl: event.onlineMeetingUrl ?? null,
    organizerEmail: event.organizer?.emailAddress?.address ?? null,
  };
}
