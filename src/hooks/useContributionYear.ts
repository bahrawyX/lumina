'use client';

import { useMemo } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { useCalendarEventsStore } from '../store/useCalendarEventsStore';
import { useTaskBoardStore } from '../store/useTaskBoardStore';
import { useFocusStore } from '../store/useFocusStore';
import { useDailyPlanStore } from '../store/useDailyPlanStore';
import { buildContributionCalendar } from '../utils/performance/buildContributionCalendar';
import { DailyContributionInputs } from '../types/performance';

interface ContributionYearResult {
  contributionYear: ReturnType<typeof buildContributionCalendar>;
  availableYears: number[];
}

function toDateKey(input: string): string | null {
  try {
    const parsed = parseISO(input);
    if (!isValid(parsed)) return null;
    return format(parsed, 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

function increment(
  map: Map<string, DailyContributionInputs>,
  dateKey: string,
  field: keyof DailyContributionInputs,
  amount = 1
): void {
  const existing = map.get(dateKey) ?? {
    completedTasks: 0,
    focusSessions: 0,
    completedEvents: 0,
    completedPlannerItems: 0,
  };

  map.set(dateKey, {
    ...existing,
    [field]: existing[field] + amount,
  });
}

export function useContributionYear(selectedYear: number): ContributionYearResult {
  const tasks = useTaskBoardStore((state) => state.tasks);
  const events = useCalendarEventsStore((state) => state.events);
  const focusHistory = useFocusStore((state) => state.sessionHistory);
  const plansByDate = useDailyPlanStore((state) => state.plansByDate);

  const { dayInputMap, availableYears } = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const years = new Set<number>([nowYear]);
    const map = new Map<string, DailyContributionInputs>();

    const doneTaskIds = new Set<string>();
    tasks.forEach((task) => {
      if (task.status !== 'done') return;
      doneTaskIds.add(task.id);

      const dateKey = toDateKey(task.updatedAt);
      if (!dateKey) return;
      years.add(Number(dateKey.slice(0, 4)));
      increment(map, dateKey, 'completedTasks', 1);
    });

    events.forEach((event) => {
      if (!event.completed) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) return;
      years.add(Number(event.date.slice(0, 4)));
      increment(map, event.date, 'completedEvents', 1);
    });

    focusHistory.forEach((session) => {
      if (!session.completed) return;
      const dateKey = toDateKey(session.startTime);
      if (!dateKey) return;
      years.add(Number(dateKey.slice(0, 4)));
      increment(map, dateKey, 'focusSessions', 1);
    });

    Object.entries(plansByDate).forEach(([planDate, items]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) return;
      const completedPlannerItems = items.filter((item) => doneTaskIds.has(item.taskId)).length;
      if (completedPlannerItems === 0) return;
      years.add(Number(planDate.slice(0, 4)));
      increment(map, planDate, 'completedPlannerItems', completedPlannerItems);
    });

    return {
      dayInputMap: map,
      availableYears: Array.from(years).sort((a, b) => b - a),
    };
  }, [tasks, events, focusHistory, plansByDate]);

  const contributionYear = useMemo(
    () => buildContributionCalendar(selectedYear, dayInputMap),
    [selectedYear, dayInputMap]
  );

  return { contributionYear, availableYears };
}
