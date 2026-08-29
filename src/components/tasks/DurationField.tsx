'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon } from '@/components/icons/CheckIcons';
import { CloseIcon } from '@/components/icons/ActionIcons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatMinutes } from '@/utils/dailyPlanUtils';

/**
 * Duration picker: the presets, plus a custom value alongside them.
 *
 * The presets were the only way to answer "how long is this?", so a 25-minute
 * pomodoro or a 20-minute standup had to be rounded to something on the list.
 * Custom sits at the bottom of the same menu rather than replacing the
 * presets, because the presets are right most of the time and a number input
 * is slower for the common case.
 *
 * It also fixes a quieter problem. A task whose duration was not on the list —
 * set through the API, or left over from an older preset set — rendered the
 * trigger EMPTY, because `<SelectValue />` has nothing to show for a value
 * with no matching `<SelectItem>`. The task looked like it had no duration at
 * all. Any off-list value now opens directly in custom mode showing its real
 * number.
 *
 * The 1–1440 bounds match `createTaskSchema` on the server, so the field
 * cannot offer a value the API will reject.
 */

export const MIN_DURATION = 1;
export const MAX_DURATION = 24 * 60;

const CUSTOM = '__custom__';

export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240] as const;

export function clampDuration(value: number): number {
  return Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.round(value)));
}

interface DurationFieldProps {
  value: number;
  onChange: (minutes: number) => void;
  /** Which presets to offer. The compact planner row shows a shorter list. */
  presets?: readonly number[];
  /** The dense variant used in the planner's quick-add row. */
  compact?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
  'aria-label'?: string;
}

export function DurationField({
  value,
  onChange,
  presets = DURATION_PRESETS,
  compact = false,
  triggerClassName,
  contentClassName,
  'aria-label': ariaLabel = 'Duration',
}: DurationFieldProps) {
  // Two separate reasons to show the number input, kept apart on purpose:
  // the reader picked "Custom…", or the value simply is not on the list. The
  // second is not a user choice — it is the only way to render an off-list
  // value at all, since `<SelectValue />` shows nothing for a value with no
  // matching `<SelectItem>`.
  const [customIntent, setCustomIntent] = useState(false);
  const offList = !presets.includes(value);
  const custom = customIntent || offList;

  const [draft, setDraft] = useState(() => String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Escape blurs the input, and blur commits — so without this, Escape saved
   * the very value it was pressed to discard. `setDraft` has not applied yet
   * when the blur handler runs, so it cannot check the draft to tell the two
   * apart; the intent has to be recorded somewhere synchronous.
   */
  const abandoning = useRef(false);

  // Follow the parent when it changes the value out from under us — opening
  // the dialog on a different task, say — rather than holding a stale draft.
  //
  // Adjusted during render rather than in an effect. An effect would render
  // once with the wrong number visible and then again to correct it, and
  // React's own guidance is to do this here.
  // https://react.dev/learn/you-might-not-need-an-effect
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }

  // A DOM side effect, which is what effects are actually for.
  useEffect(() => {
    if (custom) {
      abandoning.current = false;
      inputRef.current?.focus();
    }
  }, [custom]);

  const commit = () => {
    if (abandoning.current) {
      abandoning.current = false;
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < MIN_DURATION) {
      // Empty or nonsense reverts rather than writing a zero-minute task.
      setDraft(String(value));
      return;
    }
    const next = clampDuration(parsed);
    setDraft(String(next));
    onChange(next);
  };

  if (custom) {
    return (
      <div
        className={cn(
          'flex items-center gap-1 rounded-lg border border-input bg-transparent',
          compact ? 'h-6 px-1' : 'h-10 md:h-9 px-2',
        )}
      >
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          min={MIN_DURATION}
          max={MAX_DURATION}
          aria-label={`${ariaLabel} in minutes`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              inputRef.current?.blur();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              abandoning.current = true;
              setDraft(String(value));
              inputRef.current?.blur();
            }
          }}
          className={cn(
            'w-full min-w-0 bg-transparent outline-none tabular-nums',
            // Chrome's spinners overlap the buttons in the compact row.
            '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
            compact ? 'text-[10px]' : 'text-sm',
          )}
        />
        <span className={cn('shrink-0 text-muted-foreground', compact ? 'text-[10px]' : 'text-xs')}>
          min
        </span>
        <button
          type="button"
          aria-label="Apply duration"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <CheckIcon size={compact ? 12 : 14} />
        </button>
        <button
          type="button"
          aria-label="Back to preset durations"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setCustomIntent(false);
            // Snap to the nearest preset so the dropdown has something to show
            // instead of coming up blank — the exact bug this field exists to
            // stop.
            const nearest = presets.reduce((best, p) =>
              Math.abs(p - value) < Math.abs(best - value) ? p : best,
            );
            onChange(nearest);
            setDraft(String(nearest));
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <CloseIcon size={compact ? 12 : 14} />
        </button>
      </div>
    );
  }

  return (
    <Select
      value={String(value)}
      onValueChange={(v) => {
        if (v === CUSTOM) {
          setDraft(String(value));
          setCustomIntent(true);
          return;
        }
        onChange(Number(v));
      }}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(compact ? 'h-6 text-[10px]' : 'h-10 md:h-9 rounded-lg text-sm', triggerClassName)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {presets.map((minutes) => (
          <SelectItem
            key={minutes}
            value={String(minutes)}
            className={compact ? 'text-[11px]' : undefined}
          >
            {formatMinutes(minutes)}
          </SelectItem>
        ))}
        <SelectItem value={CUSTOM} className={compact ? 'text-[11px]' : undefined}>
          Custom…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
