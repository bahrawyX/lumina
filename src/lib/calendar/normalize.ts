import 'server-only';
import { mapGoogleEvent } from '@/lib/integrations/google/mapper';
import { mapMicrosoftEvent } from '@/lib/integrations/microsoft/mapper';
import type { ApiExternalEvent } from '@/lib/calendar/externalEventTypes';
import type { GoogleRawEventWithColor } from '@/lib/calendar/providers/google';
import type { MicrosoftRawEventWithColor } from '@/lib/calendar/providers/microsoft';

type ExternalProvider = 'google' | 'microsoft';

function normalizeGoogleEvents(rawEvents: GoogleRawEventWithColor[]): ApiExternalEvent[] {
  return rawEvents
    .map(({ event, color }) => {
      const mapped = mapGoogleEvent(event);
      if (!mapped) return null;
      return {
        externalEventId: mapped.externalEventId,
        provider: 'google' as const,
        title: mapped.title,
        description: mapped.description,
        startIso: mapped.startTime.toISOString(),
        endIso: mapped.endTime.toISOString(),
        isAllDay: mapped.isAllDay,
        timezone: mapped.timezone,
        location: mapped.location,
        color,
        organizerEmail: mapped.organizerEmail,
        meetingUrl: mapped.meetingUrl,
      };
    })
    .filter((item): item is ApiExternalEvent => item !== null);
}

function normalizeMicrosoftEvents(rawEvents: MicrosoftRawEventWithColor[]): ApiExternalEvent[] {
  return rawEvents
    .map(({ event, color }) => {
      const mapped = mapMicrosoftEvent(event);
      if (!mapped) return null;
      return {
        externalEventId: mapped.externalEventId,
        provider: 'microsoft' as const,
        title: mapped.title,
        description: mapped.description,
        startIso: mapped.startTime.toISOString(),
        endIso: mapped.endTime.toISOString(),
        isAllDay: mapped.isAllDay,
        timezone: mapped.timezone,
        location: mapped.location,
        color,
        organizerEmail: mapped.organizerEmail,
        meetingUrl: mapped.meetingUrl,
      };
    })
    .filter((item): item is ApiExternalEvent => item !== null);
}

export function normalizeExternalEvents(
  provider: 'google',
  rawEvents: GoogleRawEventWithColor[],
): ApiExternalEvent[];
export function normalizeExternalEvents(
  provider: 'microsoft',
  rawEvents: MicrosoftRawEventWithColor[],
): ApiExternalEvent[];
export function normalizeExternalEvents(
  provider: ExternalProvider,
  rawEvents: GoogleRawEventWithColor[] | MicrosoftRawEventWithColor[],
): ApiExternalEvent[] {
  if (provider === 'google') {
    return normalizeGoogleEvents(rawEvents as GoogleRawEventWithColor[]);
  }
  return normalizeMicrosoftEvents(rawEvents as MicrosoftRawEventWithColor[]);
}
