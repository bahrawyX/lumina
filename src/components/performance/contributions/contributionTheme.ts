import { ContributionLevel } from '../../../types/performance';

export const contributionLevelClasses: Record<ContributionLevel, string> = {
  0: 'bg-neutral-900/80 border-neutral-800/90',
  1: 'bg-primary/15 border-primary/20',
  2: 'bg-primary/30 border-primary/30',
  3: 'bg-primary/55 border-primary/50',
  4: 'bg-primary border-primary/70',
};

export const contributionLegendLevels: ContributionLevel[] = [0, 1, 2, 3, 4];
