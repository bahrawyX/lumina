export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export interface ContributionDay {
  date: string; // YYYY-MM-DD
  score: number;
  level: ContributionLevel;
  completedTasks: number;
  focusSessions: number;
  completedEvents: number;
  completedPlannerItems: number;
  scheduledEvents: number;
}

export interface ContributionWeek {
  index: number;
  days: Array<ContributionDay | null>; // Sunday -> Saturday rows
}

export interface ContributionMonthLabel {
  label: string;
  weekIndex: number;
}

export interface ContributionYear {
  year: number;
  totalScore: number;
  days: ContributionDay[];
  weeks: ContributionWeek[];
  monthLabels: ContributionMonthLabel[];
  bestStreak: number;
  mostActiveMonth: string | null;
}

export interface DailyContributionInputs {
  completedTasks: number;
  focusSessions: number;
  completedEvents: number;
  completedPlannerItems: number;
  /** All calendar events on this day (scheduled meetings count as activity) */
  scheduledEvents: number;
}

export interface WeekdayLabel {
  label: string;
  rowIndex: number;
}
