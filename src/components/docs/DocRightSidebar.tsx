'use client';

import React, { useMemo } from 'react';
import { useDocsStore } from '@/store/useDocsStore';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import { useCalendarEventsStore } from '@/store/useCalendarEventsStore';
import { useFocusStore } from '@/store/useFocusStore';
import { formatDistanceToNow } from 'date-fns';

interface DocRightSidebarProps {
  docId: string;
  onClose: () => void;
}

export default function DocRightSidebar({ docId, onClose }: DocRightSidebarProps) {
  const openDocContent = useDocsStore((s) => s.openDocContent);
  const docs = useDocsStore((s) => s.docs);
  const tasks = useTaskBoardStore((s) => s.tasks);
  const events = useCalendarEventsStore((s) => s.events);
  const sessionHistory = useFocusStore((s) => s.sessionHistory);

  const doc = docs.find((d) => d.id === docId);
  if (!doc) return null;

  // Linked task
  const linkedTask = doc.linkedTaskId
    ? tasks.find((t) => t.id === doc.linkedTaskId)
    : null;

  // Linked event
  const linkedEvent = doc.linkedEventId
    ? events.find((e) => e.id === doc.linkedEventId)
    : null;

  // Focus time on linked task
  const focusTime = useMemo(() => {
    if (!doc.linkedTaskId) return 0;
    return sessionHistory
      .filter((s) => s.taskId === doc.linkedTaskId)
      .reduce((sum, s) => sum + (s.duration ?? 0), 0);
  }, [doc.linkedTaskId, sessionHistory]);

  const focusHours = Math.floor(focusTime / 3600);
  const focusMinutes = Math.floor((focusTime % 3600) / 60);

  return (
    <aside className="w-[280px] flex-shrink-0 border-l border-border/40 overflow-y-auto hidden md:block">
      <div className="p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Doc info
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Metadata */}
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="text-sm text-foreground">
              {new Date(doc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last edited</p>
            <p className="text-sm text-foreground">
              {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Word count</p>
            <p className="text-sm text-foreground">
              {doc.wordCount} words · ~{Math.max(1, Math.ceil(doc.wordCount / 200))} min read
            </p>
          </div>
        </div>

        <div className="border-t border-border/40" />

        {/* Linked task */}
        {linkedTask && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Linked task</p>
            <div className="bg-muted rounded-lg px-3 py-2">
              <p className="text-sm font-medium text-foreground truncate">
                {linkedTask.status === 'done' ? '✓' : '○'} {linkedTask.title}
              </p>
              <p className="text-xs text-muted-foreground capitalize">{linkedTask.priority} priority</p>
            </div>
          </div>
        )}

        {/* Linked event */}
        {linkedEvent && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Linked event</p>
            <div className="bg-muted rounded-lg px-3 py-2">
              <p className="text-sm font-medium text-foreground truncate">
                📅 {linkedEvent.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {linkedEvent.date} · {linkedEvent.startTime}–{linkedEvent.endTime}
              </p>
            </div>
          </div>
        )}

        {/* Focus time */}
        {focusTime > 0 && (
          <>
            <div className="border-t border-border/40" />
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Focus time</p>
              <p className="text-sm text-foreground">
                {focusHours > 0 ? `${focusHours}h ` : ''}{focusMinutes}m focused on linked task
              </p>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
