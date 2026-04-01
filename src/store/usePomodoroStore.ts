'use client';

import { create } from 'zustand';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PomodoroPhase = 'work' | 'short_break' | 'long_break';

export interface PomodoroState {
  // Timer state
  phase: PomodoroPhase;
  isRunning: boolean;
  isPaused: boolean;
  sessionCount: number; // completed work sessions in current cycle

  // Wall-clock anchors (persist across unmount)
  /** ISO string when the current phase started ticking */
  phaseStartedAt: string | null;
  /** Seconds already elapsed before pausing (accumulated across pauses) */
  elapsedBeforePause: number;
  /** ISO string when the work session started (for onSessionComplete callback) */
  workSessionStartedAt: string | null;

  // Settings (local to pomodoro, synced from settings store on init)
  workMins: number;
  shortBreakMins: number;
  longBreakMins: number;
  sessionsPerCycle: number;

  // Completion celebration
  showCelebration: boolean;

  // Actions
  start: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  reset: () => void;
  tick: () => { completed: boolean; phase: PomodoroPhase };
  setWorkMins: (mins: number) => void;
  setShortBreakMins: (mins: number) => void;
  setLongBreakMins: (mins: number) => void;
  setSessionsPerCycle: (n: number) => void;
  dismissCelebration: () => void;

  // Derived helpers
  getElapsedSecs: () => number;
  getPhaseDurationSecs: () => number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'lumina_pomodoro_state';

function phaseDuration(phase: PomodoroPhase, workMins: number, shortBreakMins: number, longBreakMins: number): number {
  if (phase === 'work') return workMins * 60;
  if (phase === 'short_break') return shortBreakMins * 60;
  return longBreakMins * 60;
}

/** Persist essential state to localStorage so it survives page reloads. */
function persist(state: Partial<PomodoroState>) {
  try {
    const data = {
      phase: state.phase,
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      sessionCount: state.sessionCount,
      phaseStartedAt: state.phaseStartedAt,
      elapsedBeforePause: state.elapsedBeforePause,
      workSessionStartedAt: state.workSessionStartedAt,
      workMins: state.workMins,
      shortBreakMins: state.shortBreakMins,
      longBreakMins: state.longBreakMins,
      sessionsPerCycle: state.sessionsPerCycle,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* noop */ }
}

function loadPersisted(): Partial<PomodoroState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const usePomodoroStore = create<PomodoroState>((set, get) => {
  // Try to restore from localStorage
  const saved = typeof window !== 'undefined' ? loadPersisted() : null;

  return {
    // Restored or default values
    phase: (saved?.phase as PomodoroPhase) ?? 'work',
    isRunning: saved?.isRunning ?? false,
    isPaused: saved?.isPaused ?? false,
    sessionCount: saved?.sessionCount ?? 0,
    phaseStartedAt: saved?.phaseStartedAt ?? null,
    elapsedBeforePause: saved?.elapsedBeforePause ?? 0,
    workSessionStartedAt: saved?.workSessionStartedAt ?? null,
    workMins: saved?.workMins ?? 25,
    shortBreakMins: saved?.shortBreakMins ?? 5,
    longBreakMins: saved?.longBreakMins ?? 20,
    sessionsPerCycle: saved?.sessionsPerCycle ?? 4,
    showCelebration: false,

    getElapsedSecs: () => {
      const s = get();
      if (!s.isRunning || s.isPaused || !s.phaseStartedAt) {
        return s.elapsedBeforePause;
      }
      const wallElapsed = (Date.now() - new Date(s.phaseStartedAt).getTime()) / 1000;
      return s.elapsedBeforePause + wallElapsed;
    },

    getPhaseDurationSecs: () => {
      const s = get();
      return phaseDuration(s.phase, s.workMins, s.shortBreakMins, s.longBreakMins);
    },

    start: () => {
      const s = get();
      const now = new Date().toISOString();
      set({
        isRunning: true,
        isPaused: false,
        phaseStartedAt: now,
        elapsedBeforePause: 0,
        workSessionStartedAt: s.phase === 'work' ? now : s.workSessionStartedAt,
      });
      persist(get());
    },

    pause: () => {
      const s = get();
      if (!s.isRunning || s.isPaused) return;
      // Capture elapsed time before pausing
      const elapsed = s.getElapsedSecs();
      set({
        isPaused: true,
        phaseStartedAt: null,
        elapsedBeforePause: elapsed,
      });
      persist(get());
    },

    resume: () => {
      const s = get();
      if (!s.isRunning || !s.isPaused) return;
      set({
        isPaused: false,
        phaseStartedAt: new Date().toISOString(),
      });
      persist(get());
    },

    skip: () => {
      const s = get();
      // Advance phase without completing work session
      let nextPhase: PomodoroPhase = 'work';
      let nextSessionCount = s.sessionCount;

      if (s.phase === 'work') {
        nextSessionCount = s.sessionCount + 1;
        if (nextSessionCount >= s.sessionsPerCycle) {
          nextPhase = 'long_break';
          nextSessionCount = 0;
        } else {
          nextPhase = 'short_break';
        }
      } else {
        nextPhase = 'work';
      }

      set({
        phase: nextPhase,
        isRunning: false,
        isPaused: false,
        sessionCount: nextSessionCount,
        phaseStartedAt: null,
        elapsedBeforePause: 0,
        workSessionStartedAt: null,
      });
      persist(get());
    },

    reset: () => {
      set({
        phase: 'work',
        isRunning: false,
        isPaused: false,
        sessionCount: 0,
        phaseStartedAt: null,
        elapsedBeforePause: 0,
        workSessionStartedAt: null,
        showCelebration: false,
      });
      persist(get());
    },

    /**
     * Called every second by the active ticker (PomodoroView or FloatingWidget).
     * Returns whether the phase just completed.
     */
    tick: () => {
      const s = get();
      if (!s.isRunning || s.isPaused) return { completed: false, phase: s.phase };

      const elapsed = s.getElapsedSecs();
      const duration = s.getPhaseDurationSecs();

      if (elapsed >= duration) {
        // Phase completed — advance
        const completedPhase = s.phase;
        let nextPhase: PomodoroPhase = 'work';
        let nextSessionCount = s.sessionCount;

        if (s.phase === 'work') {
          nextSessionCount = s.sessionCount + 1;
          if (nextSessionCount >= s.sessionsPerCycle) {
            nextPhase = 'long_break';
            nextSessionCount = 0;
          } else {
            nextPhase = 'short_break';
          }
        } else {
          nextPhase = 'work';
        }

        set({
          phase: nextPhase,
          isRunning: false,
          isPaused: false,
          sessionCount: nextSessionCount,
          phaseStartedAt: null,
          elapsedBeforePause: 0,
          workSessionStartedAt: null,
          showCelebration: completedPhase === 'work',
        });
        persist(get());

        return { completed: true, phase: completedPhase };
      }

      return { completed: false, phase: s.phase };
    },

    setWorkMins: (mins: number) => {
      set({ workMins: Math.max(1, Math.min(240, mins)) });
      persist(get());
    },

    setShortBreakMins: (mins: number) => {
      set({ shortBreakMins: Math.max(1, Math.min(30, mins)) });
      persist(get());
    },

    setLongBreakMins: (mins: number) => {
      set({ longBreakMins: Math.max(1, Math.min(60, mins)) });
      persist(get());
    },

    setSessionsPerCycle: (n: number) => {
      set({ sessionsPerCycle: n });
      persist(get());
    },

    dismissCelebration: () => {
      set({ showCelebration: false });
    },
  };
});
