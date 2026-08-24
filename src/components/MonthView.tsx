'use client';

import React, { useMemo, memo, useCallback, useState, useRef, useEffect } from 'react';
import { CalendarEvent, EventInstance } from '../types';
import { getDaysInMonth, isSameDay, formatDateISO } from '../utils/dateUtils';
import { DAYS } from '../constants';
import { useCalendarStore } from '../store/useCalendarStore';
import { useCalendarEventsStore } from '../store/useCalendarEventsStore';
import EventItem from './EventItem';
import { EventProviderBadge } from './EventProviderBadge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
import { useIsLaptopWidth } from '../hooks/useIsLaptopWidth';
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

// Both bands cap at one event per cell with a "+N more" overflow chip;
// the only difference is the pill style — compact single-line for laptop,
// full title+time pill for wide screens.
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
  isLaptop: boolean;
  /** 1-based column, for `aria-colindex`. */
  colIndex: number;
  /**
   * P2-16: every in-month cell was `tabIndex={0}`, so tabbing through a month
   * cost up to 42 stops before reaching anything else. Exactly one cell is
   * tabbable now; the arrow keys move between them.
   */
  isActive: boolean;
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
        className="inline-flex items-center gap-1 self-start px-1.5 py-[2px] rounded-md text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors duration-100 leading-none tabular-nums"
      >
        +{overflowCount} more
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
          {dayEvents.map((ev) => {
            const evProvider: 'google' | 'microsoft' | 'apple' | 'local' =
              ev.provider === 'google' || ev.provider === 'microsoft' || ev.provider === 'apple'
                ? ev.provider
                : ev.source === 'outlook' || ev.source === 'microsoft'
                  ? 'microsoft'
                  : ev.source === 'google'
                    ? 'google'
                    : ev.source === 'apple'
                      ? 'apple'
                      : 'local';
            return (
              <button
                key={ev.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenChange(false); onEventClick(ev.id); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/60 transition-colors duration-100 text-left cursor-pointer group"
              >
                <EventProviderBadge
                  provider={evProvider}
                  category={ev.category}
                  color={ev.color}
                  size={22}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate leading-tight">
                    {ev.title}
                  </p>
                  {ev.startTime && (
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 tabular-nums">
                      {fmtTime(ev.startTime)}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
));
OverflowPopover.displayName = 'OverflowPopover';

const MonthDayCell = memo<MonthDayCellProps>(({ day, dayEvents, onDayClick, onEventClick, onDrop, isLaptop, colIndex, isActive }) => {
  const { date, dateStr, isCurrentMonth, isToday, eventsCount } = day;
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (!isCurrentMonth) {
    return (
      <div
        className="h-full flex flex-col p-1 sm:p-1.5 rounded-xl bg-muted/30 border border-border/30"
        style={{ opacity: 0.45, pointerEvents: 'none' }}
        role="gridcell"
        aria-colindex={colIndex}
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
      aria-colindex={colIndex}
      // The grid's roving tab stop. `data-date` is how the container's key
      // handler finds which cell a keypress came from, and how it focuses the
      // one the user moved to.
      data-date={dateStr}
      tabIndex={isActive ? 0 : -1}
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
            compact={isLaptop}
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
  const currentDate = useCalendarStore(s => s.currentDate);
  const openModal   = useCalendarStore(s => s.openModal);
  const setCurrentDate = useCalendarStore(s => s.setCurrentDate);
  const moveEvent   = useCalendarEventsStore(s => s.moveEvent);
  const isLaptop    = useIsLaptopWidth();
  const today = new Date();

  // Virtual instances from recurrence expansion keep the master's `.date`
  // (the series DTSTART) and expose their real per-occurrence date on
  // `.instanceDate`. Bucket by `instanceDate` so each occurrence lands in its
  // own cell; otherwise every expanded instance stacks on the master date
  // and produces phantom "+N more" duplicates.
  const bucketKey = (e: CalendarEvent): string =>
    (e as Partial<EventInstance>).instanceDate ?? e.date;

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = bucketKey(e);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const aTime = a.startTime || '99:99';
        const bTime = b.startTime || '99:99';
        return aTime.localeCompare(bTime);
      });
    }
    return map;
  }, [events]);

  const gridDays = useMemo<MonthGridDay[]>(() => {
    const raw = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
    return raw.map((date) => {
      const dateStr = formatDateISO(date);
      return {
        date,
        dateStr,
        isCurrentMonth: date.getMonth() === currentDate.getMonth(),
        isToday: isSameDay(date, today),
        eventsCount: eventsByDate.get(dateStr)?.length ?? 0,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate.getFullYear(), currentDate.getMonth(), eventsByDate]);

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

  /** The 42 cells chunked into the six weeks the ARIA rows describe. */
  const weekRows = useMemo(() => {
    const rows: MonthGridDay[][] = [];
    for (let i = 0; i < gridDays.length; i += 7) rows.push(gridDays.slice(i, i + 7));
    return rows;
  }, [gridDays]);

  // ── P2-16: roving tabindex + arrow-key navigation ────────────────────────
  //
  // The grid had 42 tab stops and an `onKeyDown` that handled only Enter and
  // Space, so a keyboard user paid up to 42 presses to cross a month and had no
  // way to move by week at all. Exactly one cell is tabbable now, and the arrow
  // keys move between them — the standard ARIA grid pattern.

  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Set only by a keyboard move, so mounting the view never steals focus from
  // wherever the user actually is.
  const pendingFocus = useRef<string | null>(null);

  /** The single tabbable cell: the last one focused, else today, else the 1st. */
  const activeDate = useMemo(() => {
    const isInMonth = (d: string | null) =>
      d !== null && gridDays.some((g) => g.dateStr === d && g.isCurrentMonth);
    if (isInMonth(focusedDate)) return focusedDate as string;
    const todayCell = gridDays.find((g) => g.isToday && g.isCurrentMonth);
    if (todayCell) return todayCell.dateStr;
    return gridDays.find((g) => g.isCurrentMonth)?.dateStr ?? '';
  }, [focusedDate, gridDays]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${target}"]`)?.focus();
  });

  const focusDate = useCallback(
    (next: Date) => {
      pendingFocus.current = formatDateISO(next);
      setFocusedDate(formatDateISO(next));
      // Stepping off the edge of the month moves the month, so the cell the
      // user lands on is always a real, in-month, focusable one — rather than
      // an out-of-month cell that is `pointer-events: none` and inert.
      if (
        next.getMonth() !== currentDate.getMonth() ||
        next.getFullYear() !== currentDate.getFullYear()
      ) {
        setCurrentDate(next);
      }
    },
    [currentDate, setCurrentDate],
  );

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const from = (e.target as HTMLElement).closest?.('[data-date]')?.getAttribute('data-date');
      if (!from) return;

      const [y, m, d] = from.split('-').map(Number);
      const base = new Date(y, m - 1, d);
      const shift = (days: number) => {
        const n = new Date(base);
        n.setDate(n.getDate() + days);
        return n;
      };

      let next: Date | null = null;
      switch (e.key) {
        case 'ArrowRight': next = shift(1); break;
        case 'ArrowLeft': next = shift(-1); break;
        case 'ArrowDown': next = shift(7); break;
        case 'ArrowUp': next = shift(-7); break;
        case 'Home': next = shift(-base.getDay()); break;
        case 'End': next = shift(6 - base.getDay()); break;
        // Clamped to 28 so paging from the 31st does not overflow into the
        // month after next — `new Date(2026, 1, 31)` is 3 March.
        case 'PageUp': next = new Date(y, m - 2, Math.min(d, 28)); break;
        case 'PageDown': next = new Date(y, m, Math.min(d, 28)); break;
        default: return;
      }

      e.preventDefault();
      focusDate(next);
    },
    [focusDate],
  );

  return (
    // On wide desktops the surface is content-sized; centre it in the
    // available vertical space so there's no raw empty gap at the bottom.
    <div className={isLaptop ? 'h-full' : 'h-full flex flex-col justify-center'}>
    <CalendarSurface
      role="grid"
      aria-label={`${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
      aria-rowcount={7}
      aria-colcount={7}
      className={isLaptop ? '' : '!flex-none !h-auto'}
    >
      {/* Wrap in a horizontally-scrollable container with a min-width so
          all 7 columns stay readable below ~1100px (laptop with sidebar +
          mobile). The header row sits inside the same scroller so the
          weekday labels stay aligned with their columns when scrolled. */}
      <div className="calendar-scroll-container flex-1 min-h-0 flex flex-col overflow-x-auto">
        <div className="min-w-[700px] flex-1 flex flex-col min-h-0">
          {/* P2-16: the weekday labels were plain divs inside a `role="grid"`.
              ARIA grid is grid > row > gridcell/columnheader; without the row
              layer and the header roles a screen reader cannot announce which
              column a day is in, which is the primary way a non-sighted user
              reads a month view. */}
          <div className={`grid grid-cols-7 ${HEADER_CLS}`} role="row" aria-rowindex={1}>
            {DAYS.map((day, colIdx) => (
              <div
                key={day}
                role="columnheader"
                aria-colindex={colIdx + 1}
                className={`py-1.5 text-center ${WEEKDAY_LABEL_CLS}`}
              >
                {day}
              </div>
            ))}
          </div>

      <div className="flex-1 min-h-0 h-full overflow-x-auto">
        <div
          ref={gridRef}
          onKeyDown={handleGridKeyDown}
          className={`h-full grid grid-cols-7 grid-rows-6 p-1 gap-0.5 ${GRID_CANVAS_CLS}`}
          // Laptop band fills available height (rows ~95–110px naturally).
          // Wide screens use a fixed 110px track so the cell sizes to fit just
          // one full event card + the "+N more" overflow chip — anything taller
          // is wasted vertical space on a 1-event cap.
          style={{ gridTemplateRows: isLaptop ? 'repeat(6, minmax(0, 1fr))' : 'repeat(6, 110px)' }}
        >
          {/* One `role="row"` per week. `display: contents` keeps the CSS grid
              layout exactly as it was — the row element generates no box, so
              its seven children remain direct grid items — while giving the
              accessibility tree the row layer ARIA requires. */}
          {weekRows.map((week, weekIdx) => (
            <div
              key={weekIdx}
              role="row"
              aria-rowindex={weekIdx + 2}
              style={{ display: 'contents' }}
            >
              {week.map((day, colIdx) => (
                <MonthDayCell
                  key={day.dateStr}
                  day={day}
                  dayEvents={eventsByDate.get(day.dateStr) ?? []}
                  onDayClick={handleDayClick}
                  onEventClick={handleEventClick}
                  onDrop={handleDrop}
                  isLaptop={isLaptop}
                  colIndex={colIdx + 1}
                  isActive={day.dateStr === activeDate}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
        </div>
      </div>
    </CalendarSurface>
    </div>
  );
};

export default MonthView;
