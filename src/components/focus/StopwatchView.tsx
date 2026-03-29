'use client';

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ────────────────────────────────────────────────────────────────────

interface Lap {
  id: number;
  time: number;   // cumulative elapsed at lap moment (ms)
  delta: number;  // time since previous lap (ms)
}

interface StopwatchState {
  isRunning: boolean;
  elapsed: number;       // milliseconds
  laps: Lap[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_LAPS = 20;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert milliseconds to { hours, minutes, seconds, centiseconds } parts. */
function timeParts(ms: number) {
  const total = Math.max(0, ms);
  const cs = Math.floor((total % 1000) / 10);
  const totalSecs = Math.floor(total / 1000);
  const s = totalSecs % 60;
  const m = Math.floor(totalSecs / 60) % 60;
  const h = Math.floor(totalSecs / 3600);
  return { h, m, s, cs };
}

/** Format milliseconds as HH:MM:SS.cs string. */
function formatTime(ms: number): string {
  const { h, m, s, cs } = timeParts(ms);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Split formatted time into main portion and centiseconds. */
function splitDisplay(ms: number): { main: string; cs: string } {
  const formatted = formatTime(ms);
  // "HH:MM:SS.cs" — split at the dot
  const dotIdx = formatted.lastIndexOf('.');
  return {
    main: formatted.slice(0, dotIdx),
    cs: formatted.slice(dotIdx), // includes the dot
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StopwatchView() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [state, setState] = useState<StopwatchState>({
    isRunning: false,
    elapsed: 0,
    laps: [],
  });

  // Refs for RAF-based timing
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);      // performance.now() when started
  const accumulatedRef = useRef<number>(0);   // elapsed before current run segment
  const lapCounterRef = useRef<number>(0);

  // ── Animation loop ─────────────────────────────────────────────────────────

  const tick = useCallback(() => {
    const now = performance.now();
    const elapsed = accumulatedRef.current + (now - startTsRef.current);
    setState((prev) => ({ ...prev, elapsed }));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    startTsRef.current = performance.now();
    setState((prev) => ({ ...prev, isRunning: true }));
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const handlePause = useCallback(() => {
    stopLoop();
    // Freeze the accumulated time
    const now = performance.now();
    accumulatedRef.current += now - startTsRef.current;
    setState((prev) => ({
      ...prev,
      isRunning: false,
      elapsed: accumulatedRef.current,
    }));
  }, [stopLoop]);

  const handleReset = useCallback(() => {
    stopLoop();
    accumulatedRef.current = 0;
    startTsRef.current = 0;
    lapCounterRef.current = 0;
    setState({ isRunning: false, elapsed: 0, laps: [] });
  }, [stopLoop]);

  const handleLap = useCallback(() => {
    setState((prev) => {
      if (!prev.isRunning) return prev;

      const lastLapTime = prev.laps.length > 0 ? prev.laps[0].time : 0;
      const delta = prev.elapsed - lastLapTime;
      lapCounterRef.current += 1;

      const newLap: Lap = {
        id: lapCounterRef.current,
        time: prev.elapsed,
        delta,
      };

      const laps = [newLap, ...prev.laps].slice(0, MAX_LAPS);
      return { ...prev, laps };
    });
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────

  const { isRunning, elapsed, laps } = state;
  const display = splitDisplay(elapsed);

  // Find fastest / slowest lap deltas (only meaningful with 2+ laps)
  let fastestId: number | null = null;
  let slowestId: number | null = null;

  if (laps.length >= 2) {
    let minDelta = Infinity;
    let maxDelta = -Infinity;
    for (const lap of laps) {
      if (lap.delta < minDelta) {
        minDelta = lap.delta;
        fastestId = lap.id;
      }
      if (lap.delta > maxDelta) {
        maxDelta = lap.delta;
        slowestId = lap.id;
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-md mx-auto select-none">
      {/* Time display */}
      <div className="flex items-baseline justify-center font-mono" aria-label="Stopwatch time">
        <span className="text-6xl font-bold text-foreground tracking-tight">
          {display.main}
        </span>
        <span className="text-3xl font-bold text-muted-foreground tracking-tight">
          {display.cs}
        </span>
      </div>

      {/* Lap list */}
      {laps.length > 0 && (
        <div className="w-full max-h-[340px] overflow-y-auto rounded-xl space-y-1.5 pr-1">
          <AnimatePresence initial={false}>
            {laps.map((lap) => {
              const isFastest = lap.id === fastestId;
              const isSlowest = lap.id === slowestId;

              let colorClass = 'text-foreground';
              if (isFastest) colorClass = 'text-green-500';
              if (isSlowest) colorClass = 'text-destructive';

              return (
                <motion.div
                  key={lap.id}
                  layout
                  initial={{ opacity: 0, y: -12, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="bg-muted/50 rounded-xl p-3 flex items-center justify-between text-sm font-mono"
                >
                  <span className="text-muted-foreground">
                    Lap {lap.id}
                  </span>
                  <span className={colorClass}>
                    +{formatTime(lap.delta)}
                  </span>
                  <span className="text-muted-foreground">
                    {formatTime(lap.time)}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Button row */}
      <div className="flex items-center justify-center gap-3 w-full">
        {/* Lap button */}
        <button
          onClick={handleLap}
          disabled={!isRunning}
          className="px-5 py-2.5 rounded-xl border border-border text-foreground text-sm font-medium
                     transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Lap
        </button>

        {/* Start / Pause button */}
        <button
          onClick={isRunning ? handlePause : handleStart}
          className="px-7 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium
                     transition-colors hover:bg-primary/90 min-w-[100px]"
        >
          {isRunning ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'}
        </button>

        {/* Reset button */}
        <button
          onClick={handleReset}
          disabled={elapsed === 0}
          className="px-5 py-2.5 rounded-xl text-foreground text-sm font-medium
                     transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
