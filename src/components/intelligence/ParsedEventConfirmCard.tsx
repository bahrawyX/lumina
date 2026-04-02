'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CalendarIcon, CloseIcon } from '@/components/icons';

export interface ParsedEventData {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  location: string | null;
  description: string | null;
  recurrence: {
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    interval: number;
    weekDays: string[];
    endMode: 'never' | 'on_date' | 'after_count';
    endDate: string | null;
    endCount: number | null;
  } | null;
  confidence: number;
  ambiguities: string[];
}

interface ParsedEventConfirmCardProps {
  parsed: ParsedEventData;
  onConfirm: () => Promise<void>;
  onEdit: () => void;
  onDismiss: () => void;
  isLoading: boolean;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function describeRecurrence(rec: NonNullable<ParsedEventData['recurrence']>): string {
  const freqMap: Record<string, string> = {
    DAILY: 'day',
    WEEKLY: 'week',
    MONTHLY: 'month',
    YEARLY: 'year',
  };
  const unit = freqMap[rec.frequency] ?? 'week';
  const prefix = rec.interval > 1 ? `Every ${rec.interval} ${unit}s` : `Every ${unit}`;

  if (rec.frequency === 'WEEKLY' && rec.weekDays.length > 0) {
    const dayMap: Record<string, string> = {
      MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun',
    };
    // Check if weekdays (MO-FR)
    const isWeekdays =
      rec.weekDays.length === 5 &&
      ['MO', 'TU', 'WE', 'TH', 'FR'].every((d) => rec.weekDays.includes(d));
    if (isWeekdays) return 'Every weekday';
    return `${prefix} on ${rec.weekDays.map((d) => dayMap[d] ?? d).join(', ')}`;
  }

  return prefix;
}

export const ParsedEventConfirmCard: React.FC<ParsedEventConfirmCardProps> = ({
  parsed,
  onConfirm,
  onEdit,
  onDismiss,
  isLoading,
}) => {
  const isLowConfidence = parsed.confidence < 0.7;
  const borderClass = isLowConfidence
    ? 'border-l-2 border-l-amber-400'
    : 'border-l-2 border-l-emerald-500/60';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`relative bg-card border border-border/60 rounded-xl p-4 ${borderClass}`}
    >
      {/* Dismiss button */}
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-3 right-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      >
        <CloseIcon size={14} strokeWidth={1.5} />
      </button>

      {/* Event details */}
      <div className="flex items-start gap-3 pr-6">
        <CalendarIcon size={16} strokeWidth={1.5} className="text-primary mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{parsed.title}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {parsed.recurrence
              ? describeRecurrence(parsed.recurrence)
              : formatDate(parsed.date)}
            {' · '}
            {parsed.isAllDay
              ? 'All day'
              : `${parsed.startTime} \u2013 ${parsed.endTime}`}
          </p>
          {parsed.recurrence && (
            <p className="text-xs text-muted-foreground">
              Starting {formatDate(parsed.date)}
            </p>
          )}
          {parsed.location && (
            <p className="text-xs text-muted-foreground mt-0.5">{parsed.location}</p>
          )}
        </div>
      </div>

      {/* Ambiguity warnings */}
      {parsed.ambiguities.length > 0 && (
        <div className="mt-2 text-xs text-amber-500 dark:text-amber-400 bg-amber-500/10 rounded-md px-2 py-1">
          {parsed.ambiguities.map((a, i) => (
            <p key={i}>{a}</p>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          disabled={isLoading}
          className="bg-muted text-muted-foreground text-xs px-3 py-1.5 rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading}
          className="bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {isLoading ? (
            <>
              <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              Adding...
            </>
          ) : (
            'Add to Calendar'
          )}
        </button>
      </div>
    </motion.div>
  );
};

export default ParsedEventConfirmCard;
