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
  todayEvents: CalendarEvent[];
  planItems: PlannedTaskItem[];
  taskMap: Map<string, Task>;
  onRemovePlanItem: (planItemId: string) => void;
  onUpdatePlanItemTime: (planItemId: string, startTime: string, endTime: string) => void;
  /** Forwarded to DayCalendarTimeline so DailyPlanView can measure scroll position on drop. */
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

export const TodayTimeline: React.FC<TodayTimelineProps> = React.memo(({
  todayEvents, planItems, taskMap, onRemovePlanItem, onUpdatePlanItemTime,
  scrollContainerRef,
}) => {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: 'timeline-drop',
    data: { type: 'timeline' },
  });

  const dateStr = format(new Date(), 'yyyy-MM-dd');

  const calendarEvents = React.useMemo(
    () => todayEvents.map((ev): EventInstance => ({ ...ev, instanceDate: ev.date })),
    [todayEvents]
  );

  return (
    <DayCalendarTimeline
      dateStr={dateStr}
      startHour={TIMELINE_START_HOUR}
      endHour={TIMELINE_END_HOUR}
      calendarEvents={calendarEvents}
      planItems={planItems}
      taskMap={taskMap}
      onRemovePlanItem={onRemovePlanItem}
      onUpdatePlanItemTime={onUpdatePlanItemTime}
      dropRef={setDropRef}
      isDropOver={isOver}
      scrollContainerRef={scrollContainerRef}
    />
  );
});

TodayTimeline.displayName = 'TodayTimeline';
