import { create } from 'zustand';
import type { Goal, GoalTarget, GoalStatus, GoalTimeframe, GoalColor, TargetType } from '../types/goal';
import { computeGoalProgress, computeTargetProgress } from '../types/goal';
import * as goalsPersistence from '@/lib/persistence/goalsPersistence';
import { uid } from '@/lib/uid';

// ── Store interface ──────────────────────────────────────────────────────────

interface GoalsState {
  goals: Goal[];
  dbHydrated: boolean;
  isLoading: boolean;
  selectedGoalId: string | null;

  // Hydration
  hydrateFromDb: (goals: Goal[]) => void;
  hydrateFromDbFailed: () => void;

  // Goal CRUD
  addGoal: (input: {
    title: string;
    description?: string;
    emoji?: string;
    color?: GoalColor;
    timeframe: GoalTimeframe;
    startDate: string;
    endDate: string;
    targets?: Array<{
      title: string;
      type: TargetType;
      targetValue: number;
      unit?: string;
      linkedTaskIds?: string[];
    }>;
  }) => Goal;
  updateGoal: (id: string, patch: Partial<Omit<Goal, 'id' | 'targets' | 'createdAt'>>) => void;
  archiveGoal: (id: string) => void;
  deleteGoal: (id: string) => void;
  setSelectedGoalId: (id: string | null) => void;

  // Target CRUD
  addTarget: (goalId: string, input: {
    title: string;
    type: TargetType;
    targetValue: number;
    unit?: string;
    linkedTaskIds?: string[];
  }) => GoalTarget | null;
  updateTarget: (goalId: string, targetId: string, patch: Partial<GoalTarget>) => void;
  deleteTarget: (goalId: string, targetId: string) => void;
  updateTargetProgress: (goalId: string, targetId: string, value: number) => void;
}

export const useGoalsStore = create<GoalsState>((set, get) => ({
  goals: [],
  dbHydrated: false,
  isLoading: false,
  selectedGoalId: null,

  hydrateFromDb: (goals) => {
    if (get().dbHydrated) return;
    set({ dbHydrated: true, goals });
  },

  hydrateFromDbFailed: () => {
    if (get().dbHydrated) return;
    set({ dbHydrated: true });
  },

  setSelectedGoalId: (id) => set({ selectedGoalId: id }),

  addGoal: (input) => {
    const now = new Date().toISOString();
    const goalId = uid('goal_');

    const targets: GoalTarget[] = (input.targets ?? []).map((t, i) => ({
      id: uid('target_'),
      goalId,
      title: t.title,
      type: t.type,
      currentValue: 0,
      targetValue: t.targetValue,
      unit: t.unit,
      linkedTaskIds: t.linkedTaskIds ?? [],
      order: i,
      createdAt: now,
      updatedAt: now,
    }));

    const goal: Goal = {
      id: goalId,
      title: input.title,
      description: input.description,
      emoji: input.emoji,
      color: input.color,
      status: 'active',
      timeframe: input.timeframe,
      startDate: input.startDate,
      endDate: input.endDate,
      targets,
      createdAt: now,
      updatedAt: now,
    };

    set(s => ({ goals: [...s.goals, goal] }));

    // Fire-and-forget persistence
    goalsPersistence.createOne({
      title: input.title,
      description: input.description,
      emoji: input.emoji,
      color: input.color,
      timeframe: input.timeframe,
      startDate: input.startDate,
      endDate: input.endDate,
      targets: input.targets,
    });

    return goal;
  },

  updateGoal: (id, patch) => {
    set(s => ({
      goals: s.goals.map(g =>
        g.id === id ? { ...g, ...patch, updatedAt: new Date().toISOString() } : g
      ),
    }));
    goalsPersistence.updateOne(id, patch);
  },

  archiveGoal: (id) => {
    get().updateGoal(id, { status: 'archived' });
  },

  deleteGoal: (id) => {
    set(s => ({ goals: s.goals.filter(g => g.id !== id) }));
    goalsPersistence.deleteOne(id, true);
  },

  addTarget: (goalId, input) => {
    const goal = get().goals.find(g => g.id === goalId);
    if (!goal) return null;

    const now = new Date().toISOString();
    const target: GoalTarget = {
      id: uid('target_'),
      goalId,
      title: input.title,
      type: input.type,
      currentValue: 0,
      targetValue: input.targetValue,
      unit: input.unit,
      linkedTaskIds: input.linkedTaskIds ?? [],
      order: goal.targets.length,
      createdAt: now,
      updatedAt: now,
    };

    set(s => ({
      goals: s.goals.map(g =>
        g.id === goalId ? { ...g, targets: [...g.targets, target], updatedAt: now } : g
      ),
    }));

    goalsPersistence.addTarget(goalId, input);
    return target;
  },

  updateTarget: (goalId, targetId, patch) => {
    const now = new Date().toISOString();
    set(s => ({
      goals: s.goals.map(g =>
        g.id === goalId
          ? {
              ...g,
              targets: g.targets.map(t =>
                t.id === targetId ? { ...t, ...patch, updatedAt: now } : t
              ),
              updatedAt: now,
            }
          : g
      ),
    }));
    goalsPersistence.updateTarget(goalId, targetId, patch);
  },

  deleteTarget: (goalId, targetId) => {
    const now = new Date().toISOString();
    set(s => ({
      goals: s.goals.map(g =>
        g.id === goalId
          ? { ...g, targets: g.targets.filter(t => t.id !== targetId), updatedAt: now }
          : g
      ),
    }));
    goalsPersistence.deleteTarget(goalId, targetId);
  },

  updateTargetProgress: (goalId, targetId, value) => {
    get().updateTarget(goalId, targetId, { currentValue: value });
  },
}));

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectActiveGoals = (state: GoalsState) =>
  state.goals
    .filter(g => g.status === 'active')
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

export const selectGoalsByStatus = (status: GoalStatus) => (state: GoalsState) =>
  state.goals.filter(g => g.status === status);

export const selectGoalProgress = (goalId: string) => (state: GoalsState) => {
  const goal = state.goals.find(g => g.id === goalId);
  return goal ? computeGoalProgress(goal) : 0;
};

export const selectActiveGoalCount = (state: GoalsState) =>
  state.goals.filter(g => g.status === 'active').length;
