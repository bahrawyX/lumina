import { ContributionLevel } from '../../../types/performance';

export const contributionLevelClasses: Record<ContributionLevel, string> = {
  0: 'bg-muted/80 border-border/80 dark:bg-neutral-900/80 dark:border-neutral-800/90',
  1: 'bg-primary/20 border-primary/30 dark:bg-primary/15 dark:border-primary/20',
  2: 'bg-primary/35 border-primary/40 dark:bg-primary/30 dark:border-primary/30',
  3: 'bg-primary/55 border-primary/55 dark:border-primary/50',
  4: 'bg-primary border-primary/80 dark:border-primary/70',
};

export const contributionLegendLevels: ContributionLevel[] = [0, 1, 2, 3, 4];
