import type { CalendarEvent } from '../../types';

const GRAPH_EVENTS_URL = 'https://graph.microsoft.com/v1.0/me/events';

export interface OutlookEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
}

export async function fetchOutlookEvents(token: string): Promise<OutlookEvent[]> {
  const response = await fetch(
    `${GRAPH_EVENTS_URL}?$select=id,subject,start,end,location,organizer&$top=200&$orderby=start/dateTime`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Microsoft Graph API error (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.value as OutlookEvent[];
}

function parseGraphDateTime(dt: string): { date: string; time: string } {
  const d = new Date(dt);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}

export function mapOutlookEventToLuminaEvent(
  outlookEvent: OutlookEvent,
  timezone: string,
): CalendarEvent {
  const start = parseGraphDateTime(outlookEvent.start.dateTime);
  const end = parseGraphDateTime(outlookEvent.end.dateTime);

  return {
    id: `outlook_${outlookEvent.id}`,
    title: outlookEvent.subject || '(No Subject)',
    description: '',
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    timezone,
    location: outlookEvent.location?.displayName || undefined,
    category: 'Work',
    color: '#0078D4',
    source: 'outlook',
    editable: false,
    outlookId: outlookEvent.id,
    organizer: outlookEvent.organizer?.emailAddress?.name || undefined,
  };
}
