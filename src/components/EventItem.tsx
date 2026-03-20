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

const MicrosoftProviderIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={10} height={10} viewBox="0 0 24 24" fill={color} className="flex-shrink-0 opacity-80">
    <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.32.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V12z"/>
  </svg>
);

const GoogleProviderIcon: React.FC = () => (
  <svg width={10} height={10} viewBox="0 0 24 24" className="flex-shrink-0">
    <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.591 4.418 1.582l3.491-3.49A11.932 11.932 0 0 0 12 0C7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z" />
    <path fill="#34A853" d="M16.041 18.013A7.072 7.072 0 0 1 12 19.09c-2.973 0-5.535-1.853-6.6-4.487l-4.04 3.066C3.193 21.294 7.265 24 12 24c2.933 0 5.735-1.043 7.834-3.001l-3.793-2.986z" />
    <path fill="#4A90E2" d="M19.834 20.999C22.029 18.952 23.455 15.904 23.455 12c0-.71-.091-1.418-.273-2.09H12v4.545h6.436a5.463 5.463 0 0 1-1.638 2.902l3.036 2.642z" />
    <path fill="#FBBC05" d="M5.4 14.603A7.15 7.15 0 0 1 4.909 12c0-.56.076-1.104.214-1.624L1.24 7.26A11.981 11.981 0 0 0 0 12c0 1.92.444 3.73 1.237 5.335L5.4 14.603z" />
  </svg>
);

const EventItem = memo<EventItemProps>(({ event, onClick }) => {
  const provider = event.provider
    || (event.source === 'outlook' || event.source === 'microsoft'
      ? 'microsoft'
      : event.source === 'google'
        ? 'google'
        : 'local');
  const isExternal = provider === 'microsoft' || provider === 'google';
  if (process.env.NODE_ENV === 'development') {
    console.log('[EVENT RENDER]', event.id, event.provider || event.source || 'unknown');
  }

  const color = isExternal
    ? (event.color || (provider === 'google' ? '#4285F4' : '#0078D4'))
    : (EVENT_COLORS[event.category] ?? '#6D59E0');
  const timeLabel = event.startTime ? fmt(event.startTime) : null;

  return (
    <button
      draggable={!isExternal}
      onDragStart={(e) => {
        if (isExternal) { e.preventDefault(); return; }
        e.dataTransfer.setData('eventId', event.id);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(event.id);
      }}
      className={`w-full text-left flex flex-col px-2 py-1.5 rounded-md transition-all duration-[120ms] ease-out group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        isExternal
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
          isExternal ? '' : 'text-foreground'
        }`}
        style={{
          opacity: event.completed ? 0.45 : 1,
          color: isExternal ? color : undefined,
        }}
      >
        {isExternal && (provider === 'google'
          ? <GoogleProviderIcon />
          : <MicrosoftProviderIcon color={color} />)}
        {event.title}
      </span>
      {timeLabel && (
        <span className={`text-[10px] font-normal leading-tight mt-0.5 tabular-nums ${
          isExternal ? '' : 'text-muted-foreground'
        }`} style={{
          color: isExternal ? color : undefined,
          opacity: isExternal ? 0.72 : undefined,
        }}>
          {timeLabel}
        </span>
      )}
    </button>
  );
});
EventItem.displayName = 'EventItem';

export default EventItem;
