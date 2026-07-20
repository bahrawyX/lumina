/**
 * H7 regression: Outlook event times must be parsed as UTC, not server-local.
 * The provider now requests Prefer: outlook.timezone="UTC" (was a hardcoded
 * Africa/Cairo), and the mapper parses the offset-less wall-clock explicitly as
 * UTC — so the instant is correct regardless of the runtime's local timezone.
 * These assertions are timezone-independent by construction.
 */
import { describe, it, expect } from 'vitest';
import { mapMicrosoftEvent, parseGraphUtc } from '@/lib/integrations/microsoft/mapper';

describe('H7 — Outlook times parse as UTC (no ~2h drift)', () => {
  it('parseGraphUtc treats offset-less Graph wall-clock (7 frac digits) as UTC', () => {
    expect(parseGraphUtc('2026-07-18T12:00:00.0000000').toISOString()).toBe('2026-07-18T12:00:00.000Z');
    expect(parseGraphUtc('2026-07-18T09:30:00.0000000').toISOString()).toBe('2026-07-18T09:30:00.000Z');
    expect(parseGraphUtc('2026-07-18T00:00:00').toISOString()).toBe('2026-07-18T00:00:00.000Z');
  });

  it('respects an explicit zone when present', () => {
    expect(parseGraphUtc('2026-07-18T12:00:00Z').toISOString()).toBe('2026-07-18T12:00:00.000Z');
    expect(parseGraphUtc('2026-07-18T14:00:00+02:00').toISOString()).toBe('2026-07-18T12:00:00.000Z');
  });

  it('maps a timed event to the correct UTC instant', () => {
    const mapped = mapMicrosoftEvent({
      id: 'e1',
      subject: 'Standup',
      isAllDay: false,
      isCancelled: false,
      start: { dateTime: '2026-07-18T12:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2026-07-18T12:30:00.0000000', timeZone: 'UTC' },
      lastModifiedDateTime: '2026-07-18T00:00:00Z',
      changeKey: 'abc',
    });
    expect(mapped).not.toBeNull();
    expect(mapped!.startTime.toISOString()).toBe('2026-07-18T12:00:00.000Z');
    expect(mapped!.endTime.toISOString()).toBe('2026-07-18T12:30:00.000Z');
  });
});
