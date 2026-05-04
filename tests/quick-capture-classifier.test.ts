import { describe, it, expect } from 'vitest';
import { classify, parseEventDetails } from '@/components/quick-capture/classifier';

describe('classify()', () => {
  // ── TASK ────────────────────────────────────────────────────────────────
  it('"Fix the login bug" → task', () => {
    expect(classify('Fix the login bug')).toBe('task');
  });
  it('"Buy groceries" → task', () => {
    expect(classify('Buy groceries')).toBe('task');
  });
  it('"Review PR #42" → task', () => {
    expect(classify('Review PR #42')).toBe('task');
  });
  it('"Send invoice to client" → task', () => {
    expect(classify('Send invoice to client')).toBe('task');
  });
  it('"Follow up with Ahmed" → task', () => {
    expect(classify('Follow up with Ahmed')).toBe('task');
  });
  it('empty string → task (default)', () => {
    expect(classify('')).toBe('task');
  });
  it('whitespace-only → task (default)', () => {
    expect(classify('   ')).toBe('task');
  });

  // ── EVENT ───────────────────────────────────────────────────────────────
  it('"Call Ahmed tomorrow 3pm" → event', () => {
    expect(classify('Call Ahmed tomorrow 3pm')).toBe('event');
  });
  it('"Standup with team" → event', () => {
    expect(classify('Standup with team')).toBe('event');
  });
  it('"Lunch at 12:30" → event', () => {
    expect(classify('Lunch at 12:30')).toBe('event');
  });
  it('"Meeting at 3pm" → event', () => {
    expect(classify('Meeting at 3pm')).toBe('event');
  });
  it('"Interview with Sarah monday" → event', () => {
    expect(classify('Interview with Sarah monday')).toBe('event');
  });
  it('"Sync with design team tomorrow morning" → event', () => {
    expect(classify('Sync with design team tomorrow morning')).toBe('event');
  });
  it('"Drinks at 7pm" → event (time pattern only)', () => {
    expect(classify('Drinks at 7pm')).toBe('event');
  });
  it('"Catch up with Liz" → event (multi-word phrase)', () => {
    expect(classify('Catch up with Liz')).toBe('event');
  });
  it('"Review with team Friday" → event (multi-word phrase + day)', () => {
    expect(classify('Review with team Friday')).toBe('event');
  });

  // ── DOC ─────────────────────────────────────────────────────────────────
  it('"Notes on pricing meeting" → doc', () => {
    expect(classify('Notes on pricing meeting')).toBe('doc');
  });
  it('"Draft Q3 proposal" → doc', () => {
    expect(classify('Draft Q3 proposal')).toBe('doc');
  });
  it('"doc: API design" → doc', () => {
    expect(classify('doc: API design')).toBe('doc');
  });
  it('"note: things to remember" → doc', () => {
    expect(classify('note: things to remember')).toBe('doc');
  });
  it('"Write spec for the new auth flow" → doc', () => {
    expect(classify('Write spec for the new auth flow')).toBe('doc');
  });
  it('"Plan for the offsite agenda" → doc', () => {
    expect(classify('Plan for the offsite agenda')).toBe('doc');
  });
  it('contains "document" → doc', () => {
    expect(classify('Update the onboarding document')).toBe('doc');
  });
});

describe('parseEventDetails()', () => {
  it('extracts time from "Call Ahmed tomorrow 3pm"', () => {
    const r = parseEventDetails('Call Ahmed tomorrow 3pm');
    expect(r.title).toBe('Call Ahmed');
    expect(r.suggestedTime).toBe('15:00');
    expect(r.suggestedDate).not.toBeNull();
  });

  it('extracts 24h time from "Lunch at 12:30"', () => {
    const r = parseEventDetails('Lunch at 12:30');
    expect(r.title).toBe('Lunch');
    expect(r.suggestedTime).toBe('12:30');
  });

  it('handles 12am edge case correctly', () => {
    const r = parseEventDetails('Late call 12am');
    expect(r.suggestedTime).toBe('00:00');
  });

  it('handles 12pm edge case correctly', () => {
    const r = parseEventDetails('Lunch 12pm');
    expect(r.suggestedTime).toBe('12:00');
  });

  it('returns null dates for plain titles', () => {
    const r = parseEventDetails('Standup with team');
    expect(r.suggestedDate).toBeNull();
    expect(r.suggestedTime).toBeNull();
    expect(r.title).toBe('Standup with team');
  });

  it('extracts "tomorrow" as a date', () => {
    const r = parseEventDetails('Call Mom tomorrow');
    expect(r.suggestedDate).not.toBeNull();
    expect(r.title).toBe('Call Mom');
  });

  it('extracts a weekday', () => {
    const r = parseEventDetails('Demo on Friday');
    expect(r.suggestedDate).not.toBeNull();
    // Day of week 5 = Friday (0=Sun)
    expect(r.suggestedDate!.getDay()).toBe(5);
    expect(r.title).toBe('Demo');
  });

  it('strips filler words', () => {
    const r = parseEventDetails('Lunch at 1pm');
    expect(r.title).toBe('Lunch');
  });

  it('handles empty input', () => {
    const r = parseEventDetails('');
    expect(r.title).toBe('');
    expect(r.suggestedDate).toBeNull();
    expect(r.suggestedTime).toBeNull();
  });
});
