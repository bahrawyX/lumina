/**
 * Shared types for the external calendar events layer.
 *
 * External events (Google / Microsoft) are fetched from provider APIs and
 * cached ONLY in the browser.  They are NEVER persisted to the Lumina DB.
 */

/** Wire shape returned by GET /api/external-events/* endpoints. */
export interface ApiExternalEvent {
  externalEventId: string;
  provider: 'google' | 'microsoft';
  title: string;
  description: string | null;
  /** ISO 8601 UTC timestamp */
  startIso: string;
  /** ISO 8601 UTC timestamp */
  endIso: string;
  isAllDay: boolean;
  /** IANA timezone of the originating event */
  timezone: string;
  location: string | null;
  /** Hex calendar color */
  color: string;
  organizerEmail: string | null;
  meetingUrl: string | null;
}
