/**
 * Shared badge metadata for task priority and difficulty.
 * Used by TaskCard (kanban), TaskListView (list view) and TaskPoolCard (planner).
 *
 * ## Why the two look nothing alike
 *
 * They used to share a colour language, and it made them genuinely
 * indistinguishable. Priority `medium` and difficulty `medium` resolved to
 * byte-identical classes —
 *
 *     'border-amber-500/25 bg-amber-500/10 text-amber-600 …'
 *
 * — and priority `high` and difficulty `hard` were the same destructive red
 * apart from a border opacity. So a card showing two amber chips reading
 * "Medium" and "Medium" gave a reader nothing to tell which was which. An
 * earlier pass added a signal-bars icon to the difficulty chip, which helps
 * once you already know the convention, but a 10px glyph is not enough to
 * separate two otherwise identical pills.
 *
 * The rule now is that the two dimensions never share a channel:
 *
 *   - **Colour means urgency.** Only priority is tinted, so any coloured chip
 *     on a card is a priority. Red/amber/neutral read the way they already do
 *     everywhere else in the app.
 *   - **Bars mean effort.** Difficulty is monochrome and carries its level in
 *     1/2/3 filled bars, with the text weight stepping up alongside them.
 *   - **Shape backs both up.** Priority is a full pill (`rounded-full`),
 *     difficulty a rounded rectangle (`rounded-md`).
 *
 * Three independent cues, so the distinction survives greyscale, small sizes
 * and colour-vision differences — none of which the icon alone did.
 */
import type { TaskPriority, TaskDifficulty } from '../types/task';

export const PRIORITY_META: Record<TaskPriority, { label: string; className: string; itemClassName: string }> = {
  high: {
    label: 'High',
    className: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15',
    itemClassName: 'text-destructive focus:text-destructive focus:bg-destructive/15',
  },
  medium: {
    label: 'Medium',
    className: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15',
    itemClassName: 'text-amber-600 dark:text-amber-400 focus:text-amber-700 dark:focus:text-amber-300 focus:bg-amber-500/15',
  },
  low: {
    label: 'Low',
    className: 'border-border bg-muted/60 text-muted-foreground hover:bg-muted',
    itemClassName: 'text-muted-foreground focus:text-foreground focus:bg-muted',
  },
};

/**
 * Priority is a pill; difficulty is a rounded rectangle. Kept here rather than
 * inlined at each of the six render sites so the two cannot drift apart.
 */
export const PRIORITY_SHAPE = 'rounded-full';
export const DIFFICULTY_SHAPE = 'rounded-md';

/**
 * Monochrome by design — see the note above. The level is carried by the bars
 * and by the text weight, which steps from normal to semibold, so `hard`
 * still reads as heavier than `easy` without borrowing priority's red.
 */
export const DIFFICULTY_META: Record<TaskDifficulty, { label: string; short: string; className: string; itemClassName: string }> = {
  easy: {
    label: 'Easy',
    short: 'E',
    className: 'border-border/60 bg-muted/40 text-muted-foreground font-normal',
    itemClassName: 'text-muted-foreground focus:text-foreground focus:bg-muted',
  },
  medium: {
    label: 'Medium',
    short: 'M',
    className: 'border-border bg-muted/60 text-foreground/80 font-medium',
    itemClassName: 'text-foreground/80 focus:text-foreground focus:bg-muted',
  },
  hard: {
    label: 'Hard',
    short: 'H',
    className: 'border-foreground/25 bg-foreground/[0.07] text-foreground font-semibold',
    itemClassName: 'text-foreground focus:text-foreground focus:bg-muted',
  },
};

export const PRIORITY_OPTIONS: TaskPriority[] = ['high', 'medium', 'low'];
export const DIFFICULTY_OPTIONS: TaskDifficulty[] = ['easy', 'medium', 'hard'];
export const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
export const DIFFICULTY_ORDER: Record<TaskDifficulty, number> = { hard: 0, medium: 1, easy: 2 };
export const STATUS_ORDER: Record<string, number> = { todo: 0, doing: 1, done: 2 };
