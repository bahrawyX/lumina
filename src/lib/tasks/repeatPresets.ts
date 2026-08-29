/**
 * The repeat options a person actually picks, mapped to RRULE.
 *
 * Deliberately a short list rather than an RRULE builder. Almost every
 * repeating task is one of these five, and exposing FREQ/INTERVAL/BYDAY as
 * form controls asks the user to learn a calendaring standard to say "every
 * Tuesday". The stored value is a real RRULE either way, so a fuller editor can
 * be added later without migrating anything.
 *
 * Client-safe: no `server-only`, because the dialog needs it.
 */

export type RepeatPreset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export interface RepeatOption {
  value: RepeatPreset;
  label: string;
}

/** `BYDAY` codes, indexed by `Date.getDay()` (0 = Sunday). */
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

export const REPEAT_OPTIONS: RepeatOption[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
];

/**
 * Build the RRULE for a preset.
 *
 * `weekly` pins the weekday from the due date rather than emitting a bare
 * `FREQ=WEEKLY`. Without `BYDAY` the rule's day comes from whatever `dtstart`
 * happens to be at expansion time, so the same task can drift to a different
 * weekday depending on when it is next evaluated — the exact ambiguity that
 * makes "every week" feel unreliable.
 */
export function rruleForPreset(preset: RepeatPreset, dueDate: Date | null): string | null {
  switch (preset) {
    case 'none':
      return null;
    case 'daily':
      return 'FREQ=DAILY';
    case 'weekdays':
      return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'weekly': {
      const day = DAY_CODES[(dueDate ?? new Date()).getDay()];
      return `FREQ=WEEKLY;BYDAY=${day}`;
    }
    case 'monthly':
      return 'FREQ=MONTHLY';
    case 'yearly':
      return 'FREQ=YEARLY';
  }
}

/**
 * Recognise a stored RRULE as one of the presets.
 *
 * Returns `null` for anything that does not round-trip — a rule written by a
 * future editor, or imported from elsewhere. Callers should treat `null` as
 * "custom" and leave the rule alone rather than overwriting it with a preset,
 * which would silently rewrite the user's schedule.
 */
export function presetForRrule(rrule: string | null | undefined): RepeatPreset | null {
  if (!rrule) return 'none';
  const normalized = rrule.trim().toUpperCase().replace(/^RRULE:/, '');

  if (normalized === 'FREQ=DAILY') return 'daily';
  if (normalized === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') return 'weekdays';
  if (normalized === 'FREQ=MONTHLY') return 'monthly';
  if (normalized === 'FREQ=YEARLY') return 'yearly';
  if (/^FREQ=WEEKLY;BYDAY=(SU|MO|TU|WE|TH|FR|SA)$/.test(normalized)) return 'weekly';

  return null;
}

/** Short label for a task card badge, e.g. "Weekly". */
export function repeatBadgeLabel(rrule: string | null | undefined): string | null {
  const preset = presetForRrule(rrule);
  if (preset === 'none') return null;
  switch (preset) {
    case 'daily':
      return 'Daily';
    case 'weekdays':
      return 'Weekdays';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    default:
      // A rule we did not write. "Repeats" is honest without pretending to
      // summarise something we have not parsed.
      return 'Repeats';
  }
}
