/**
 * Single-flight runner with bounded coalescing.
 *
 * Wraps an async `task` so that:
 *  - While a run is in flight, additional calls do NOT start a second run and are
 *    NOT dropped. They set a single "pending" slot (overwritten, never
 *    accumulated) so at most ONE re-run is queued regardless of how many calls
 *    arrive mid-flight.
 *  - When the in-flight run settles, if a call arrived during it, the runner
 *    launches exactly one more run — clearing the pending slot BEFORE launching,
 *    so a perpetually-failing task can never retrigger itself. Only a genuinely
 *    new call (which re-sets the slot) causes a further run.
 *  - `onBusyChange(true)` fires on the idle→busy edge and `onBusyChange(false)`
 *    only when the whole coalesced chain has drained — so a UI "syncing" flag
 *    stays steady across a queued re-run instead of flickering off/on.
 *
 * The task owns its own error handling; the runner never rejects and swallows
 * task rejections so one failure can't wedge the runner.
 */
export interface SingleFlightHooks {
  onBusyChange?: (busy: boolean) => void;
}

export function createSingleFlight<A extends unknown[]>(
  task: (...args: A) => unknown | Promise<unknown>,
  hooks: SingleFlightHooks = {},
): (...args: A) => void {
  let running = false;
  let pending: A | null = null;

  const launch = (args: A): void => {
    running = true;

    let settled: Promise<unknown>;
    try {
      settled = Promise.resolve(task(...args));
    } catch (err) {
      settled = Promise.reject(err);
    }

    settled
      .catch(() => {
        /* task owns its errors; never let the runner reject */
      })
      .finally(() => {
        // Cap = 1 queued re-run. Clear the slot BEFORE re-launching so a
        // failing task can't self-retrigger — only a NEW call arriving during
        // this run (which sets `pending` again) produces one more launch.
        const next = pending;
        pending = null;
        if (next) {
          launch(next);
        } else {
          running = false;
          hooks.onBusyChange?.(false);
        }
      });
  };

  return (...args: A): void => {
    if (running) {
      pending = args; // overwrite — never accumulate
      return;
    }
    hooks.onBusyChange?.(true);
    launch(args);
  };
}
