/**
 * Quick Capture classifier — pure regex-based intent detection.
 *
 * Runs on every keystroke in the Quick Capture modal to auto-select the
 * type pill (Task / Doc / Event). The user can always override the auto-
 * selection by clicking a pill manually.
 *
 * No imports from React, Zustand, or any side-effecting module — this stays
 * a pure function so it can be tested in isolation and called freely without
 * worrying about render thrash.
 */

export type CaptureType = 'task' | 'doc' | 'event';

// First-word event triggers. Use word-boundary regexes so "callback" /
// "meets" / "meeting" / "interviewing" all classify as event without
// also catching unrelated words. Multi-word triggers (e.g. "review with",
// "catch up") match the full phrase at the start of the string.
const EVENT_FIRST_WORD: RegExp[] = [
  /^meet(ing|ings|s)?\b/i,
  /^call(s|ing)?\b/i,
  /^standup(s)?\b/i,
  /^lunch(es)?\b/i,
  /^dinner(s)?\b/i,
  /^breakfast\b/i,
  /^interview(s|ing)?\b/i,
  /^sync(s|ing|ed)?\b/i,
];

const EVENT_PHRASE_PREFIXES: RegExp[] = [
  /^review with\b/i,
  /^catch up\b/i,
];

// Time-of-day or date references that strongly indicate a calendar event.
const TIME_PATTERNS: RegExp[] = [
  /\b\d{1,2}\s*(am|pm)\b/i,                                          // "3pm", "12 am"
  /\b\d{1,2}:\d{2}\s*(am|pm)?\b/i,                                   // "3:00", "15:30", "12:30 pm"
  /\bat\s+\d{1,2}(:\d{2})?\b/i,                                      // "at 3", "at 12:30"
  /@\s*\d{1,2}\b/,                                                   // "@3", "@15"
  /\b(tomorrow|today|tonight|tmrw)\b/i,
  /\bnext\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bthis\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening)\b/i,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(at|morning|afternoon|evening|night)\b/i,
  /\b(in\s+the\s+)?(morning|afternoon|evening)\b/i,
  /\b(noon|midnight)\b/i,
];

// Doc-creation triggers. The "doc:" / "note:" / "notes:" prefixes are
// exact tokens; the rest are first-word triggers similar to event prefixes.
const DOC_EXACT_PREFIXES: RegExp[] = [
  /^doc\s*:/i,
  /^note\s*:/i,
  /^notes\s*:/i,
  /^notes on\b/i,
];

const DOC_FIRST_WORD: RegExp[] = [
  /^write\b/i,
  /^draft\b/i,
  /^plan for\b/i,
  /^spec for\b/i,
];

const DOC_CONTAINS = /\b(document|notes)\b/i;

export function classify(input: string): CaptureType {
  const trimmed = input.trim();
  if (!trimmed) return 'task';

  // ── EVENT ────────────────────────────────────────────────────────────────
  // Strong prefix matches win first — "Lunch at 12:30" is an event whether
  // or not the time pattern catches the rest.
  if (EVENT_FIRST_WORD.some((re) => re.test(trimmed))) return 'event';
  if (EVENT_PHRASE_PREFIXES.some((re) => re.test(trimmed))) return 'event';

  // Time / date patterns — "Drinks at 7pm" should event even without a
  // matching first-word trigger.
  if (TIME_PATTERNS.some((re) => re.test(trimmed))) return 'event';

  // ── DOC ──────────────────────────────────────────────────────────────────
  if (DOC_EXACT_PREFIXES.some((re) => re.test(trimmed))) return 'doc';
  if (DOC_FIRST_WORD.some((re) => re.test(trimmed))) return 'doc';
  if (DOC_CONTAINS.test(trimmed)) return 'doc';

  // Long input without a date hint is probably a doc title, not a task.
  if (trimmed.length > 60) return 'doc';

  // ── TASK (default) ───────────────────────────────────────────────────────
  return 'task';
}

// ─── parseEventDetails ────────────────────────────────────────────────────

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function nextWeekday(target: number): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (target - today.getDay() + 7) % 7 || 7; // 0 → next week, never today
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d;
}

/**
 * Best-effort extraction of a date + time from a natural-language event
 * string. Returns the cleaned title (with date/time tokens stripped) plus
 * suggested values to pre-fill the date/time pickers in the modal.
 *
 * Kept intentionally simple — no NLP library, just regex. The user can
 * always edit the picked date/time before submitting.
 */
export function parseEventDetails(input: string): {
  title: string;
  suggestedDate: Date | null;
  suggestedTime: string | null;
} {
  let title = input.trim();
  let suggestedTime: string | null = null;
  let suggestedDate: Date | null = null;

  if (!title) return { title: '', suggestedDate: null, suggestedTime: null };

  // ── Time extraction ─────────────────────────────────────────────────────
  // 12-hour with am/pm is unambiguous; try it first.
  const ampmMatch = title.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const meridiem = ampmMatch[3].toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    suggestedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    title = title.replace(ampmMatch[0], '').trim();
  } else {
    const time24 = title.match(/\b(\d{1,2}):(\d{2})\b/);
    if (time24) {
      suggestedTime = `${time24[1].padStart(2, '0')}:${time24[2]}`;
      title = title.replace(time24[0], '').trim();
    }
  }

  // ── Date extraction ─────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (/\btomorrow\b/i.test(title) || /\btmrw\b/i.test(title)) {
    suggestedDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    title = title.replace(/\b(tomorrow|tmrw)\b/i, '').trim();
  } else if (/\b(today|tonight)\b/i.test(title)) {
    suggestedDate = today;
    title = title.replace(/\b(today|tonight)\b/i, '').trim();
  } else {
    const weekdayMatch = title.match(/\b(next|this)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (weekdayMatch) {
      const targetDay = WEEKDAY_INDEX[weekdayMatch[2].toLowerCase()];
      if (targetDay !== undefined) {
        suggestedDate = nextWeekday(targetDay);
        title = title.replace(weekdayMatch[0], '').trim();
      }
    }
  }

  // ── Strip filler tokens ─────────────────────────────────────────────────
  title = title
    .replace(/\b(at|on|in the)\b/gi, '')
    .replace(/\b(morning|afternoon|evening|night|noon|midnight)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { title, suggestedDate, suggestedTime };
}
