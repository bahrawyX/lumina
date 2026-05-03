'use client';

import React, { useEffect, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { cn } from '@/lib/utils';

interface TaskUpdatedDetail {
  taskId: string;
  title?: string;
  status?: 'todo' | 'doing' | 'done' | 'archived';
}

interface TaskBlockToggleDetail {
  taskId: string;
  checked: boolean;
  status: 'todo' | 'done';
}

interface OpenTaskDetail {
  taskId: string;
}

export function TaskBlockNodeView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  // Set true ONLY when the user explicitly clicks the × button. The cleanup
  // useEffect uses this to decide whether to fire the archive PATCH — without
  // the guard, navigating away from a doc would mass-archive every task.
  const isBeingDeletedRef = useRef(false);

  const checked = node.attrs.checked as boolean;
  const taskId = node.attrs.taskId as string;
  const taskTitle = (node.attrs.taskTitle as string) || 'Untitled task';

  // taskId, kept in a ref so the unmount cleanup reads the CURRENT value.
  // Tiptap's React NodeView renderer can re-use the same component instance
  // when ProseMirror swaps the underlying node (e.g. after setContent), and
  // the empty-deps cleanup would otherwise close over the first-mount taskId
  // and archive the wrong task on explicit delete.
  const taskIdRef = useRef(taskId);
  taskIdRef.current = taskId;

  const handleToggle = () => {
    const newChecked = !checked;
    updateAttributes({ checked: newChecked });
    window.dispatchEvent(
      new CustomEvent<TaskBlockToggleDetail>('lumina:taskblock-toggle', {
        detail: {
          taskId,
          checked: newChecked,
          // 'doing' is a deliberate task-board state, never auto-applied here.
          status: newChecked ? 'done' : 'todo',
        },
      }),
    );
  };

  const handleOpen = () => {
    window.dispatchEvent(
      new CustomEvent<OpenTaskDetail>('lumina:open-task', {
        detail: { taskId },
      }),
    );
  };

  const handleDelete = () => {
    // Set BEFORE deleteNode — deleteNode synchronously triggers NodeView
    // teardown, and the cleanup effect reads this ref.
    isBeingDeletedRef.current = true;
    deleteNode();
  };

  // Listen for task-board → editor sync.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TaskUpdatedDetail>).detail;
      if (!detail || detail.taskId !== node.attrs.taskId) return;

      const updates: Record<string, unknown> = {};

      if (detail.title !== undefined && detail.title !== node.attrs.taskTitle) {
        updates.taskTitle = detail.title;
      }

      if (detail.status !== undefined) {
        const shouldBeChecked =
          detail.status === 'done' || detail.status === 'archived';
        if (shouldBeChecked !== node.attrs.checked) {
          updates.checked = shouldBeChecked;
        }
      }

      if (Object.keys(updates).length > 0) {
        updateAttributes(updates);
      }
    };

    window.addEventListener('lumina:task-updated', handler);
    return () => window.removeEventListener('lumina:task-updated', handler);
    // taskTitle/checked are read inside the handler but are NOT triggers for
    // re-registering the listener — re-registering on every checkbox click
    // would just churn for no behavior change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.attrs.taskId, updateAttributes]);

  // Archive on explicit delete only. Cleanup runs on every NodeView unmount
  // (navigation, content reset, HMR), so the ref guard is what keeps this
  // surgical. Reads taskIdRef.current to avoid a stale-closure archive when
  // Tiptap re-uses this component across ProseMirror node swaps.
  // Note: API currently accepts only 'todo'|'doing'|'done', so a status of
  // 'archived' is silently ignored server-side. Best-effort housekeeping —
  // future API work can teach the server about archived tasks.
  useEffect(() => {
    return () => {
      if (!isBeingDeletedRef.current) return;
      const tid = taskIdRef.current;
      if (!tid) return;
      fetch(`/api/tasks/${tid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      }).catch(() => {
        /* silently ignore — task may already be deleted */
      });
    };
  }, []);

  return (
    <NodeViewWrapper className="task-block-wrapper" data-drag-handle="">
      <div
        className={cn(
          'group flex items-start gap-3 rounded-lg border px-3 py-2.5',
          'bg-card border-border/60 transition-all duration-150',
          'hover:border-border',
          selected && 'ring-2 ring-primary/30 border-primary/40',
        )}
      >
        <button
          type="button"
          contentEditable={false}
          onClick={handleToggle}
          aria-label={checked ? 'Mark task incomplete' : 'Mark task complete'}
          aria-pressed={checked}
          className={cn(
            'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center',
            'rounded border-2 transition-all duration-150',
            checked
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border hover:border-primary/70',
          )}
        >
          {checked && (
            <svg
              width="10"
              height="8"
              viewBox="0 0 10 8"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M1 4L3.5 6.5L9 1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        <span
          contentEditable={false}
          className={cn(
            'flex-1 select-none text-sm leading-6',
            checked && 'text-muted-foreground line-through',
          )}
        >
          {taskTitle}
        </span>

        <div
          contentEditable={false}
          className="flex items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        >
          <button
            type="button"
            onClick={handleOpen}
            className="text-xs text-muted-foreground transition-colors hover:text-primary"
            aria-label="Open task detail"
          >
            Open ↗
          </button>

          <button
            type="button"
            onClick={handleDelete}
            aria-label="Remove task from document"
            className={cn(
              'flex items-center justify-center rounded p-0.5',
              'text-muted-foreground transition-colors',
              'hover:text-destructive hover:bg-destructive/10',
            )}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 2l8 8M10 2l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
