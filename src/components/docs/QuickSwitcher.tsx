'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDocsStore } from '@/store/useDocsStore';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import { useCalendarEventsStore } from '@/store/useCalendarEventsStore';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface QuickSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchItem {
  id: string;
  title: string;
  type: 'doc' | 'task' | 'event' | 'action';
  icon: string;
  subtitle?: string;
  href?: string;
  action?: () => void;
}

export default function QuickSwitcher({ open, onOpenChange }: QuickSwitcherProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [apiDocResults, setApiDocResults] = useState<{ id: string; title: string; icon: string | null; isPinned?: boolean }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const docs = useDocsStore((s) => s.docs);
  const tasks = useTaskBoardStore((s) => s.tasks);
  const events = useCalendarEventsStore((s) => s.events);
  const createDoc = useDocsStore((s) => s.createDoc);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setApiDocResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced API doc search when query changes
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (!q) {
      setApiDocResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/docs/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setApiDocResults(data.slice(0, 5));
        }
      } catch { /* best-effort */ }
    }, 200);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  // Filter results
  const results = useMemo<SearchItem[]>(() => {
    const q = query.toLowerCase().trim();
    const items: SearchItem[] = [];

    // Docs — use API results when query present, local list when empty
    if (q && apiDocResults.length > 0) {
      for (const doc of apiDocResults) {
        items.push({
          id: `doc-${doc.id}`,
          title: doc.title,
          type: 'doc',
          icon: doc.icon || '📄',
          href: `/docs/${doc.id}`,
        });
      }
    } else {
      const filteredDocs = docs
        .filter((d) => !d.isArchived && (q === '' || d.title.toLowerCase().includes(q)))
        .slice(0, 5);
      for (const doc of filteredDocs) {
        items.push({
          id: `doc-${doc.id}`,
          title: doc.title,
          type: 'doc',
          icon: doc.icon || '📄',
          subtitle: doc.isPinned ? 'Pinned' : undefined,
          href: `/docs/${doc.id}`,
        });
      }
    }

    // Tasks
    const filteredTasks = tasks
      .filter((t) => t.status !== 'done' && (q === '' || t.title.toLowerCase().includes(q)))
      .slice(0, 5);
    for (const task of filteredTasks) {
      items.push({
        id: `task-${task.id}`,
        title: task.title,
        type: 'task',
        icon: task.status === 'doing' ? '🔵' : '⭕',
        subtitle: `${task.priority} priority`,
        href: '/tasks',
      });
    }

    // Events
    const filteredEvents = events
      .filter((e) => q === '' || e.title.toLowerCase().includes(q))
      .slice(0, 5);
    for (const event of filteredEvents) {
      items.push({
        id: `event-${event.id}`,
        title: event.title,
        type: 'event',
        icon: '📅',
        subtitle: event.date,
        href: '/',
      });
    }

    // Actions (always shown at bottom)
    const actions: SearchItem[] = [
      {
        id: 'action-new-doc',
        title: 'New document',
        type: 'action',
        icon: '✦',
        action: async () => {
          const id = await createDoc({});
          if (id) router.push(`/docs/${id}`);
        },
      },
      {
        id: 'action-new-task',
        title: 'New task',
        type: 'action',
        icon: '✦',
        href: '/tasks',
      },
      {
        id: 'action-focus',
        title: 'Start focus session',
        type: 'action',
        icon: '✦',
        href: '/pomodoro',
      },
    ];

    const filteredActions = actions.filter(
      (a) => q === '' || a.title.toLowerCase().includes(q)
    );
    items.push(...filteredActions);

    return items;
  }, [query, docs, tasks, events, apiDocResults, createDoc, router]);

  // Keyboard nav
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault();
        const item = results[activeIndex];
        if (item.action) {
          item.action();
        } else if (item.href) {
          router.push(item.href);
        }
        onOpenChange(false);
      } else if (e.key === 'Escape') {
        onOpenChange(false);
      }
    },
    [results, activeIndex, router, onOpenChange]
  );

  // Group results by type
  const grouped = useMemo(() => {
    const groups: { label: string; items: (SearchItem & { globalIndex: number })[] }[] = [];
    const typeOrder: SearchItem['type'][] = ['doc', 'task', 'event', 'action'];
    const labels: Record<string, string> = { doc: 'DOCS', task: 'TASKS', event: 'EVENTS', action: 'ACTIONS' };

    let globalIdx = 0;
    for (const type of typeOrder) {
      const items = results
        .filter((r) => r.type === type)
        .map((r) => ({ ...r, globalIndex: globalIdx++ }));
      if (items.length > 0) {
        groups.push({ label: labels[type], items });
      }
    }
    // Fix globalIndex to be contiguous
    let idx = 0;
    for (const group of groups) {
      for (const item of group.items) {
        item.globalIndex = idx++;
      }
    }
    return groups;
  }, [results]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
        className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="max-w-lg w-full mx-auto mt-[20vh] bg-popover border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground flex-shrink-0">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Search everything..."
              className="flex-1 text-base bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Results */}
          <div className="max-h-[400px] overflow-y-auto py-2">
            {grouped.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-1.5">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors',
                      item.globalIndex === activeIndex
                        ? 'bg-muted rounded-lg mx-1 w-[calc(100%-8px)]'
                        : 'hover:bg-muted/60'
                    )}
                    onClick={() => {
                      if (item.action) {
                        item.action();
                      } else if (item.href) {
                        router.push(item.href);
                      }
                      onOpenChange(false);
                    }}
                    onMouseEnter={() => setActiveIndex(item.globalIndex)}
                  >
                    <span className="text-sm flex-shrink-0">{item.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                    </div>
                    {item.subtitle && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {item.subtitle}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}

            {results.length === 0 && query.trim() && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No results found
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
