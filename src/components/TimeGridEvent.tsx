'use client';

import React from 'react';
import { EventInstance } from '../types';
import { EVENT_COLORS } from '../constants';
import { formatTime, getEventPosition, timeToMinutes } from '../utils/dateUtils';
import { VideoIcon as Video, ExternalLinkIcon as ExternalLink } from './icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

const OutlookIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 12, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
    <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.32.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V12z"/>
  </svg>
);

const GoogleIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
    <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.591 4.418 1.582l3.491-3.49A11.932 11.932 0 0 0 12 0C7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z" />
    <path fill="#34A853" d="M16.041 18.013A7.072 7.072 0 0 1 12 19.09c-2.973 0-5.535-1.853-6.6-4.487l-4.04 3.066C3.193 21.294 7.265 24 12 24c2.933 0 5.735-1.043 7.834-3.001l-3.793-2.986z" />
    <path fill="#4A90E2" d="M19.834 20.999C22.029 18.952 23.455 15.904 23.455 12c0-.71-.091-1.418-.273-2.09H12v4.545h6.436a5.463 5.463 0 0 1-1.638 2.902l3.036 2.642z" />
    <path fill="#FBBC05" d="M5.4 14.603A7.15 7.15 0 0 1 4.909 12c0-.56.076-1.104.214-1.624L1.24 7.26A11.981 11.981 0 0 0 0 12c0 1.92.444 3.73 1.237 5.335L5.4 14.603z" />
  </svg>
);

interface TimeGridEventProps {
  event: EventInstance;
  onClick: (id: string) => void;
  onDoubleClick?: (id: string) => void;
  width?: string;
  left?: string;
  isGhost?: boolean;
  hasConflict?: boolean;
  isSelected?: boolean;
  isDimmed?: boolean;
  isDraggedOrigin?: boolean;
  renderInitialsMode?: boolean;
  adaptiveTitleCompaction?: boolean;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

function getEventInitials(title: string): string {
  const cleanedWords = title
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);

  if (cleanedWords.length >= 2) {
    return `${cleanedWords[0][0] ?? ''}${cleanedWords[1][0] ?? ''}`.toUpperCase();
  }

  const oneWord = cleanedWords[0] ?? title.replace(/\s+/g, '').replace(/[^A-Za-z0-9]/g, '');
  return oneWord.slice(0, 2).toUpperCase();
}

/**
 * EventContent — pure presentational layer (title, time, badges).
 * Separated so positional changes to EventShell don't re-render text content.
 */
const EventContent = React.memo<{
  event: EventInstance;
  duration: number;
  isShort: boolean;
  isVeryShort: boolean;
  isNarrow: boolean;
  isExternal: boolean;
  provider: 'local' | 'google' | 'microsoft';
  accentColor: string;
  forceInitialsMode: boolean;
  adaptiveTitleCompaction: boolean;
}>(({ event, duration, isShort, isVeryShort, isNarrow, isExternal, provider, accentColor, forceInitialsMode, adaptiveTitleCompaction }) => {
  const useCompactTitle = adaptiveTitleCompaction && (isShort || isNarrow);
  const displayTitle = forceInitialsMode
    ? getEventInitials(event.title)
    : useCompactTitle
    ? event.title.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') + '..'
    : event.title;

  return (
    <>
      <div className="flex items-start justify-between gap-1 overflow-hidden">
        <div className="flex items-center gap-1.5 overflow-hidden">
          {isExternal && !isVeryShort && (
            provider === 'google'
              ? <GoogleIcon size={isShort ? 10 : 12} className="flex-shrink-0" />
              : <OutlookIcon size={isShort ? 10 : 12} className="flex-shrink-0 opacity-80" style={{ color: accentColor }} />
          )}
          {(forceInitialsMode || useCompactTitle) ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <h4
                    className={`font-bold leading-tight overflow-hidden ${
                      isExternal ? '' : 'text-gray-800 dark:text-gray-100'
                    } ${isVeryShort ? 'text-[8px]' : isShort ? 'text-[9px]' : 'text-[11px]'}`}
                    style={{ color: isExternal ? accentColor : undefined }}
                  >
                    {displayTitle}
                  </h4>
                </TooltipTrigger>
                <TooltipContent side="top">{event.title}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <h4
              className={`font-bold leading-tight overflow-hidden ${
                isExternal ? '' : 'text-gray-800 dark:text-gray-100'
              } ${isVeryShort ? 'text-[8px]' : isShort ? 'text-[9px]' : 'text-[11px]'}`}
              style={{ color: isExternal ? accentColor : undefined }}
            >
              {displayTitle}
            </h4>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {event.meetingLink && !isVeryShort && (
            <div className="px-1.5 py-0.5 bg-white/50 dark:bg-black/20 rounded-md">
              <Video size={10} className="text-primary" />
            </div>
          )}
        </div>
      </div>

      {/* Start time — always shown unless the card is too tiny to fit a second line */}
      {!isVeryShort && (
        <div className="flex items-center gap-1.5 opacity-60">
          <span className={`font-bold leading-none ${
            isExternal ? '' : 'text-gray-500 dark:text-gray-400'
          } ${(isShort || forceInitialsMode) ? 'text-[8px]' : 'text-[9px]'}`} style={{
            color: isExternal ? accentColor : undefined,
            opacity: isExternal ? 0.75 : undefined,
          }}>
            {formatTime(event.startTime)}
          </span>
          {isExternal && event.organizer && !isShort && !forceInitialsMode && duration > 45 && (
            <span className="text-[8px] truncate" style={{ color: accentColor, opacity: 0.55 }}>
              {event.organizer}
            </span>
          )}
        </div>
      )}

      {/* Location — only for full-size cards */}
      {!isShort && !forceInitialsMode && event.location && duration > 45 && (
        <span className="text-[9px] text-gray-400 dark:text-gray-500 italic truncate mt-auto leading-none flex items-center gap-1">
          <ExternalLink size={8} /> {event.location}
        </span>
      )}
    </>
  );
}, (prev, next) =>
  prev.event.title === next.event.title &&
  prev.event.startTime === next.event.startTime &&
  prev.event.endTime === next.event.endTime &&
  prev.event.location === next.event.location &&
  prev.event.meetingLink === next.event.meetingLink &&
  prev.event.organizer === next.event.organizer &&
  prev.event.source === next.event.source &&
  prev.event.provider === next.event.provider &&
  prev.event.category === next.event.category &&
  prev.isShort === next.isShort &&
  prev.isNarrow === next.isNarrow &&
  prev.forceInitialsMode === next.forceInitialsMode &&
  prev.adaptiveTitleCompaction === next.adaptiveTitleCompaction
);
EventContent.displayName = 'EventContent';

/**
 * EventShell — handles position, drag, resize, and visual state.
 * Uses CSS transitions instead of framer-motion for all static events.
 * Only the actively-dragged event gets willChange: transform.
 * `contain: layout style paint` isolates each card's rendering cost.
 */
const TimeGridEvent = React.memo<TimeGridEventProps>(({
  event,
  onClick,
  onDoubleClick,
  width = '100%',
  left = '0%',
  isGhost = false,
  isSelected = false,
  isDimmed = false,
  isDraggedOrigin = false,
  renderInitialsMode = false,
  adaptiveTitleCompaction = true,
  onPointerDown,
}) => {
  const pointerDownPos = React.useRef({ x: 0, y: 0 });

  const { top, height } = getEventPosition(event.startTime, event.endTime);
  const provider: 'local' | 'google' | 'microsoft' =
    event.provider === 'google' ? 'google'
    : event.provider === 'microsoft' || event.provider === 'outlook' ? 'microsoft'
    : event.source === 'outlook' || event.source === 'microsoft' ? 'microsoft'
    : event.source === 'google' ? 'google'
    : 'local';
  const isExternal = provider === 'microsoft' || provider === 'google';
  if (process.env.NODE_ENV === 'development') {
    console.log('[EVENT RENDER]', event.id, event.provider || event.source || 'unknown');
  }

  const color = isExternal
    ? (event.color || (provider === 'google' ? '#4285F4' : '#0078D4'))
    : (EVENT_COLORS[event.category] || '#7C5CFC');

  const duration = timeToMinutes(event.endTime) - timeToMinutes(event.startTime);
  const isShort = duration < 30;
  const isVeryShort = duration < 20;

  const widthPct = parseFloat(width);
  const isNarrow = !isNaN(widthPct) && widthPct < 45;

  return (
    <div
      data-hover-card="true"
      onPointerDown={(e) => {
        if (isGhost || isExternal) return;
        if (e.button !== 0) return;
        e.stopPropagation();
        pointerDownPos.current = { x: e.clientX, y: e.clientY };
        if (onPointerDown) onPointerDown(e);
      }}
      onClick={(e) => {
        if (isGhost) return;
        e.stopPropagation();
        const dx = Math.abs(e.clientX - pointerDownPos.current.x);
        const dy = Math.abs(e.clientY - pointerDownPos.current.y);
        if (dx > 5 || dy > 5) return;
        onClick(event.id);
      }}
      onDoubleClick={(e) => {
        if (isGhost || isExternal) return;
        e.stopPropagation();
        if (onDoubleClick) onDoubleClick(event.id);
      }}
      className={`absolute rounded-xl overflow-hidden flex flex-col gap-0.5 ${
        isGhost ? 'border-dashed pointer-events-none'
        : isExternal ? 'cursor-default pointer-events-auto'
        : 'cursor-pointer pointer-events-auto hover:-translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
      }`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${left} + 5px)`,
        width: `calc(${width} - 10px)`,
        backgroundColor: isExternal
          ? `${color}14`
          : `${color}${isSelected ? '1c' : '10'}`,
        borderLeft: isExternal
          ? `3.5px solid ${color}`
          : `3px solid ${color}${isSelected ? 'cc' : '70'}`,
        borderTop: `1px solid ${color}12`,
        borderRight: `1px solid ${color}08`,
        borderBottom: `1px solid ${color}08`,
        padding: '6px 8px',
        zIndex: isSelected ? 20 : 10,
        boxSizing: 'border-box',
        opacity: isDraggedOrigin ? 0.35 : isGhost ? 0.28 : isDimmed ? 0.68 : 1,
        filter: isDraggedOrigin ? 'saturate(0)' : 'saturate(1)',
        boxShadow: isDraggedOrigin || isGhost ? 'none' : isSelected
          ? `0 4px 18px ${color}30, 0 1px 4px ${color}1a`
          : '0 1px 3px rgba(0,0,0,0.06)',
        willChange: isDraggedOrigin ? 'transform' : undefined,
        contain: 'layout style paint',
        transition: isDraggedOrigin ? 'none' : 'opacity 0.15s ease, filter 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease-out',
      }}
    >
      <EventContent
        event={event}
        duration={duration}
        isShort={isShort}
        isVeryShort={isVeryShort}
        isNarrow={isNarrow}
        isExternal={isExternal}
        provider={provider}
        accentColor={color}
        forceInitialsMode={renderInitialsMode}
        adaptiveTitleCompaction={adaptiveTitleCompaction}
      />
    </div>
  );
}, (prev, next) =>
  prev.event.id === next.event.id &&
  prev.event.startTime === next.event.startTime &&
  prev.event.endTime === next.event.endTime &&
  prev.event.title === next.event.title &&
  prev.event.category === next.event.category &&
  prev.isDraggedOrigin === next.isDraggedOrigin &&
  prev.isSelected === next.isSelected &&
  prev.isDimmed === next.isDimmed &&
  prev.isGhost === next.isGhost &&
  prev.renderInitialsMode === next.renderInitialsMode &&
  prev.adaptiveTitleCompaction === next.adaptiveTitleCompaction &&
  prev.width === next.width &&
  prev.left === next.left &&
  prev.hasConflict === next.hasConflict
);

TimeGridEvent.displayName = 'TimeGridEvent';

export default TimeGridEvent;
