'use client';

import React, { memo } from 'react';
import { CalendarEvent } from '../types';
import { EVENT_COLORS } from '../constants';

interface EventItemProps {
  event: CalendarEvent;
  onClick: (id: string) => void;
}

function fmt(t: string): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${m} ${period}`;
}

const OutlookDot: React.FC = () => (
  <svg width={8} height={8} viewBox="0 0 24 24" fill="#0078D4" className="flex-shrink-0 opacity-70">
    <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.32.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V12z"/>
  </svg>
);

const EventItem = memo<EventItemProps>(({ event, onClick }) => {
  const isOutlook = event.source === 'outlook';
  const color = isOutlook ? '#0078D4' : (EVENT_COLORS[event.category] ?? '#6D59E0');
  const timeLabel = event.startTime ? fmt(event.startTime) : null;

  return (
    <button
      draggable={!isOutlook}
      onDragStart={(e) => {
        if (isOutlook) { e.preventDefault(); return; }
        e.dataTransfer.setData('eventId', event.id);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(event.id);
      }}
      className={`w-full text-left flex flex-col px-2 py-1.5 rounded-md transition-all duration-[120ms] ease-out group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        isOutlook
          ? 'cursor-default'
          : 'cursor-pointer hover:-translate-y-[1px] hover:shadow-md active:scale-[0.98]'
      }`}
      style={{
        backgroundColor: `${color}12`,
        borderLeft: `2px solid ${color}`,
      }}
    >
      <span
        className={`truncate text-[11px] font-medium leading-tight group-hover:text-foreground flex items-center gap-1 ${
          isOutlook ? 'text-[#0078D4] dark:text-blue-300' : 'text-foreground'
        }`}
        style={{ opacity: event.completed ? 0.45 : 1 }}
      >
        {isOutlook && <OutlookDot />}
        {event.title}
      </span>
      {timeLabel && (
        <span className={`text-[10px] font-normal leading-tight mt-0.5 tabular-nums ${
          isOutlook ? 'text-blue-400/70 dark:text-blue-300/60' : 'text-muted-foreground'
        }`}>
          {timeLabel}
        </span>
      )}
    </button>
  );
});
EventItem.displayName = 'EventItem';

export default EventItem;
