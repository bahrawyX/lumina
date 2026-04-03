'use client';

import React, { useMemo, memo, useCallback, useState } from 'react';
import { CalendarEvent } from '../types';
import { getDaysInMonth, isSameDay, formatDateISO } from '../utils/dateUtils';
import { DAYS } from '../constants';
import { useCalendarStore } from '../store/useCalendarStore';
import { useCalendarEventsStore } from '../store/useCalendarEventsStore';
import EventItem from './EventItem';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
import {
  CalendarSurface,
  CELL_CLS,
  CELL_HOVER_CLS,
  HEADER_CLS,
  WEEKDAY_LABEL_CLS,
  TODAY_BADGE_CLS,
  DATE_NUMBER_CLS,
  TODAY_RING_CLS,
  GRID_CANVAS_CLS,
} from './ui/CalendarShared';

const MAX_EVENTS_PER_CELL = 1;

/* ... types ... */
interface MonthGridDay {
  date: Date;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  eventsCount: number;
}

interface MonthDayCellProps {
  day: MonthGridDay;
  dayEvents: CalendarEvent[];
  onDayClick: (dateStr: string, hasEvents: boolean) => void;
  onEventClick: (id: string) => void;
  onDrop: (eventId: string, dateStr: string) => void;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function formatPopoverHeader(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d} — All Events`;
}

function fmtTime(t: string): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${mStr ?? '00'} ${period}`;
}

const OverflowPopover = memo<{
  dayEvents: CalendarEvent[];
  dateStr: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventClick: (id: string) => void;
  overflowCount: number;
}>(({ dayEvents, dateStr, open, onOpenChange, onEventClick, overflowCount }) => (
  <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpenChange(true); }}
        className="text-[9px] font-semibold text-primary/70 hover:text-primary pl-2 mt-0.5 text-left cursor-pointer transition-colors duration-100 leading-tight"
      >
        +{overflowCount} more event{overflowCount === 1 ? '' : 's'}
      </button>
    </PopoverTrigger>
    <PopoverContent
      className="w-64 p-0 overflow-hidden"
      align="start"
      sideOffset={6}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2.5 border-b border-border/60">
        <p className="text-[11px] font-semibold text-foreground">
          {formatPopoverHeader(dateStr)}
        </p>
      </div>
      <ScrollArea className="h-[300px]">
        <div className="p-2 space-y-0.5">
          {dayEvents.map((ev) => (
            <button
              key={ev.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenChange(false); onEventClick(ev.id); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/60 transition-colors duration-100 text-left cursor-pointer"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: ev.color ?? 'hsl(var(--primary))' }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate leading-tight">
                  {ev.title}
                </p>
                {ev.startTime && (
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    {fmtTime(ev.startTime)}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
));
OverflowPopover.displayName = 'OverflowPopover';

const MonthDayCell = memo<MonthDayCellProps>(({ day, dayEvents, onDayClick, onEventClick, onDrop }) => {
  const { date, dateStr, isCurrentMonth, isToday, eventsCount } = day;
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (!isCurrentMonth) {
    return (
      <div
        className="h-full flex flex-col p-1 sm:p-1.5 rounded-xl bg-white/20 dark:bg-neutral-panel/20"
        style={{ opacity: 0.4, pointerEvents: 'none' }}
        role="gridcell"
        aria-disabled="true"
      >
        <div className="px-1 mb-1 flex-shrink-0">
          <span className={`text-[10px] font-semibold w-6 h-6 flex items-center justify-center ${DATE_NUMBER_CLS}`}>
            {date.getDate()}
          </span>
        </div>
      </div>
    );
  }

  const visibleEvents = dayEvents.slice(0, MAX_EVENTS_PER_CELL);
  const overflowCount = eventsCount - MAX_EVENTS_PER_CELL;

  return (
    <div
      className={`h-full flex flex-col p-1 sm:p-1.5 ${CELL_CLS} ${CELL_HOVER_CLS} ${isToday ? TODAY_RING_CLS : ''}`}
      onClick={() => onDayClick(dateStr, eventsCount > 0)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const eventId = e.dataTransfer.getData('eventId');
        if (eventId) onDrop(eventId, dateStr);
      }}
      role="gridcell"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onDayClick(dateStr, eventsCount > 0);
        }
      }}
      aria-label={`${dateStr}${eventsCount > 0 ? `, ${eventsCount} event${eventsCount !== 1 ? 's' : ''}` : ''}`}
    >
      <div className="flex items-start justify-between mb-1 px-0.5 flex-shrink-0">
        <span
          className={`text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full transition-colors duration-100 ${
            isToday ? TODAY_BADGE_CLS : `${DATE_NUMBER_CLS} hover:text-primary dark:hover:text-primary`
          }`}
        >
          {date.getDate()}
        </span>
        {eventsCount > 0 && !isToday && (
          <span className="w-1 h-1 rounded-full bg-primary/50 mt-2 mr-0.5 shrink-0" />
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-[3px] overflow-y-auto no-scrollbar">
        {visibleEvents.map((event) => (
          <EventItem
            key={event.id}
            event={event}
            onClick={(id) => onEventClick(id)}
          />
        ))}
        {overflowCount > 0 && (
          <OverflowPopover
            dayEvents={dayEvents}
            dateStr={dateStr}
            open={popoverOpen}
            onOpenChange={setPopoverOpen}
            onEventClick={onEventClick}
            overflowCount={overflowCount}
          />
        )}
      </div>
    </div>
  );
});
MonthDayCell.displayName = 'MonthDayCell';

interface MonthViewProps {
  events: CalendarEvent[];
}

const MonthView: React.FC<MonthViewProps> = ({ events }) => {
  const { currentDate, openModal } = useCalendarStore();
  const { moveEvent } = useCalendarEventsStore();
  const today = new Date();

  const gridDays = useMemo<MonthGridDay[]>(() => {
    const raw = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
    return raw.map((date) => ({
      date,
      dateStr: formatDateISO(date),
      isCurrentMonth: date.getMonth() === currentDate.getMonth(),
      isToday: isSameDay(date, today),
      eventsCount: events.filter((e) => e.date === formatDateISO(date)).length,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate.getFullYear(), currentDate.getMonth(), events]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [events]);

  const handleDayClick = useCallback(
    (dateStr: string, _hasEvents: boolean) => {
      openModal(undefined, dateStr);
    },
    [openModal]
  );

  const handleEventClick = useCallback(
    (id: string) => {
      openModal(id);
    },
    [openModal]
  );

  const handleDrop = useCallback(
    (eventId: string, dateStr: string) => {
      moveEvent(eventId, dateStr);
    },
    [moveEvent]
  );

  return (
    <CalendarSurface role="grid">
      <div className={`grid grid-cols-7 ${HEADER_CLS}`}>
        {DAYS.map((day) => (
          <div
            key={day}
            className={`py-2.5 text-center ${WEEKDAY_LABEL_CLS}`}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="flex-1 min-h-0 h-full overflow-hidden">
        <div
          className={`h-full min-h-[560px] overflow-hidden grid grid-cols-7 grid-rows-6 p-1.5 sm:p-2 gap-1.5 sm:gap-2 ${GRID_CANVAS_CLS}`}
          style={{ gridTemplateRows: 'repeat(6, minmax(0, 1fr))' }}
        >
          {gridDays.map((day, idx) => (
            <MonthDayCell
              key={idx}
              day={day}
              dayEvents={eventsByDate.get(day.dateStr) ?? []}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
              onDrop={handleDrop}
            />
          ))}
        </div>
      </div>
    </CalendarSurface>
  );
};

export default MonthView;
