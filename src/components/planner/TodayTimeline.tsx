'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { format } from 'date-fns';
import type { CalendarEvent, EventInstance } from '../../types';
import type { PlannedTaskItem } from '../../store/useDailyPlanStore';
import type { Task } from '../../types/task';
import { TIMELINE_START_HOUR, TIMELINE_END_HOUR } from '../../utils/dailyPlanUtils';
import { DayCalendarTimeline } from '../calendar/DayCalendarTimeline';

// -- Main TodayTimeline --------------------------------------------------------

interface TodayTimelineProps {
  /** Day the timeline is rendering (YYYY-MM-DD). Defaults to today for callers
   *  that haven't been migrated to date navigation yet. */
  viewDate?: string;
  todayEvents: CalendarEvent[];
  planItems: PlannedTaskItem[];
  taskMap: Map<string, Task>;
  revealPlanItemDelays?: Map<string, number>;
  onRemovePlanItem: (planItemId: string) => void;
  onMarkTaskDone?: (taskId: string) => void;
  onUpdatePlanItemTime: (planItemId: string, startTime: string, endTime: string) => void;
  /** Forwarded to DayCalendarTimeline so DailyPlanView can measure scroll position on drop. */
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  gridBodyRef?: React.RefObject<HTMLDivElement>;
}

export const TodayTimeline: React.FC<TodayTimelineProps> = React.memo(({
  viewDate, todayEvents, planItems, taskMap, revealPlanItemDelays, onRemovePlanItem, onMarkTaskDone, onUpdatePlanItemTime,
  scrollContainerRef,
  gridBodyRef,
}) => {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: 'timeline-drop',
    data: { type: 'timeline' },
  });

  const dateStr = viewDate ?? format(new Date(), 'yyyy-MM-dd');

  const calendarEvents = React.useMemo(
    () => todayEvents.map((ev): EventInstance => ({ ...ev, instanceDate: dateStr })),
    [todayEvents, dateStr]
  );

  return (
    <DayCalendarTimeline
      dateStr={dateStr}
      startHour={TIMELINE_START_HOUR}
      endHour={TIMELINE_END_HOUR}
      calendarEvents={calendarEvents}
      planItems={planItems}
      taskMap={taskMap}
      revealPlanItemDelays={revealPlanItemDelays}
      onRemovePlanItem={onRemovePlanItem}
      onMarkTaskDone={onMarkTaskDone}
      onUpdatePlanItemTime={onUpdatePlanItemTime}
      dropRef={setDropRef}
      isDropOver={isOver}
      scrollContainerRef={scrollContainerRef}
      gridBodyRef={gridBodyRef}
    />
  );
});

TodayTimeline.displayName = 'TodayTimeline';
