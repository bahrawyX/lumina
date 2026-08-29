/**
 * Priority and difficulty must not be confusable.
 *
 * They were. `PRIORITY_META.medium` and `DIFFICULTY_META.medium` resolved to
 * the same string —
 *
 *     'border-amber-500/25 bg-amber-500/10 text-amber-600 …'
 *
 * — and `priority.high` and `difficulty.hard` differed only in a border
 * opacity. A card showing two amber chips both reading "Medium" gave a reader
 * nothing to go on. An earlier pass added a signal-bars icon to the difficulty
 * chip, which is a real improvement but a 10px glyph on an otherwise identical
 * pill is not a distinction most people will make at a glance.
 *
 * These check the separation is structural rather than decorative: colour only
 * ever means urgency, and the shapes differ, so the two survive greyscale and
 * small sizes.
 */
import { describe, it, expect } from 'vitest';
import {
  PRIORITY_META,
  DIFFICULTY_META,
  PRIORITY_OPTIONS,
  DIFFICULTY_OPTIONS,
  PRIORITY_SHAPE,
  DIFFICULTY_SHAPE,
} from '@/utils/taskBadges';

/** The hue families the app uses to mean "urgent" and "somewhat urgent". */
const URGENCY_COLOURS = ['destructive', 'amber', 'red', 'orange'];

describe('no two chips can render identically', () => {
  it('shares no className between any priority and any difficulty', () => {
    for (const p of PRIORITY_OPTIONS) {
      for (const d of DIFFICULTY_OPTIONS) {
        expect(
          PRIORITY_META[p].className,
          `priority "${p}" and difficulty "${d}" render the same chip`,
        ).not.toBe(DIFFICULTY_META[d].className);
      }
    }
  });

  it('separates the two that share the word "Medium"', () => {
    // The worst case: same label, and previously the same everything else.
    expect(PRIORITY_META.medium.label).toBe('Medium');
    expect(DIFFICULTY_META.medium.label).toBe('Medium');
    expect(PRIORITY_META.medium.className).not.toBe(DIFFICULTY_META.medium.className);
  });
});

describe('colour means urgency, and only urgency', () => {
  it('tints every priority', () => {
    // Low is deliberately neutral — "no colour" is itself the signal that
    // nothing is urgent — so only high and medium need a hue.
    for (const p of ['high', 'medium'] as const) {
      const uses = URGENCY_COLOURS.some((c) => PRIORITY_META[p].className.includes(c));
      expect(uses, `priority "${p}" lost its colour`).toBe(true);
    }
  });

  it('leaves every difficulty monochrome', () => {
    // This is the property that makes the rule learnable: if a chip is
    // coloured, it is a priority. Borrowing amber or red back for difficulty
    // would undo the whole distinction.
    for (const d of DIFFICULTY_OPTIONS) {
      const borrowed = URGENCY_COLOURS.filter((c) => DIFFICULTY_META[d].className.includes(c));
      expect(borrowed, `difficulty "${d}" borrows ${borrowed.join(', ')} from priority`).toEqual([]);
    }
  });

  it('still ranks the difficulties by weight, since colour cannot', () => {
    expect(DIFFICULTY_META.easy.className).toContain('font-normal');
    expect(DIFFICULTY_META.medium.className).toContain('font-medium');
    expect(DIFFICULTY_META.hard.className).toContain('font-semibold');
  });
});

describe('shape backs up the colour rule', () => {
  it('gives the two different silhouettes', () => {
    // A third independent cue, so the distinction holds for a reader who
    // cannot tell the colours apart at all.
    expect(PRIORITY_SHAPE).not.toBe(DIFFICULTY_SHAPE);
    expect(PRIORITY_SHAPE).toBe('rounded-full');
  });
});
