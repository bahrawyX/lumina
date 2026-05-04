'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import type { Goal } from '@/types/goal';

interface Props {
  goal: Goal;
  /** Called after suggestions are accepted/skipped so the parent can hide. */
  onDismiss: (reason: 'added' | 'skipped' | 'failed') => void;
}

/**
 * AI task-suggestion card. Mounted on the Goals page once for any active
 * goal that has zero linked tasks AND was created in this session (so we
 * don't pop a card for legacy goals on every refresh).
 *
 * Lifecycle:
 *  1. mount        → POST /api/goals/[id]/suggest-tasks (no body) — gets titles
 *  2. user clicks  → POST again with { create: true } to insert them as tasks
 *  3. dismiss      → onDismiss('added' | 'skipped' | 'failed')
 */
export function GoalSuggestionCard({ goal, onDismiss }: Props) {
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Suggestions can be edited inline before "Add all" — capture original
  // titles so the user can revert.
  const [editing, setEditing] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/goals/${goal.id}/suggest-tasks`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          setError(body?.message ?? 'Daily AI suggestion limit reached.');
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError("Couldn't generate suggestions. You can add tasks manually.");
          setLoading(false);
          return;
        }
        const body = (await res.json()) as { suggestions?: string[] };
        const list = Array.isArray(body.suggestions) ? body.suggestions : [];
        if (list.length === 0) {
          setError('No suggestions came back this time.');
        }
        setSuggestions(list);
        setLoading(false);
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') console.error('[GoalSuggestionCard]', err);
        setError("Couldn't reach the suggestion service.");
        setLoading(false);
      }
    })();
  }, [goal.id]);

  const handleAddAll = async () => {
    if (!suggestions || suggestions.length === 0) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}/suggest-tasks`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // Send the (possibly edited) titles back so the server inserts what
        // the user actually accepted, not what Gemini originally produced.
        body: JSON.stringify({ create: true, titles: suggestions }),
      });
      if (!res.ok) {
        toast.error('Failed to add suggested tasks');
        onDismiss('failed');
        return;
      }
      const body = (await res.json()) as { tasks?: Array<{ id: string; title: string }> };
      const count = body.tasks?.length ?? suggestions.length;
      toast.success(`Added ${count} task${count === 1 ? '' : 's'} to "${goal.title}"`);
      onDismiss('added');
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.error('[GoalSuggestionCard]', err);
      toast.error('Failed to add suggested tasks');
      onDismiss('failed');
    } finally {
      setCreating(false);
    }
  };

  const handleEditTitle = (i: number, value: string) => {
    if (!suggestions) return;
    const next = [...suggestions];
    next[i] = value.slice(0, 200);
    setSuggestions(next);
  };

  const handleRemove = (i: number) => {
    if (!suggestions) return;
    setSuggestions(suggestions.filter((_, idx) => idx !== i));
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4 mb-4"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-semibold text-primary tracking-wide flex items-center gap-1.5">
            <span>✨</span>
            <span>Suggested tasks for &quot;{goal.title}&quot;</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Gemini drafted these from your goal — accept all, customize, or skip.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss('skipped')}
          aria-label="Skip suggestions"
          className="text-muted-foreground/60 hover:text-foreground transition-colors text-base leading-none -mt-0.5"
        >
          ×
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-7 rounded-md bg-muted/40 animate-pulse" />
          ))}
          <p className="text-[11px] text-muted-foreground italic">Thinking about your goal…</p>
        </div>
      ) : error ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => onDismiss('skipped')}
            className="text-[11px] font-medium text-foreground hover:text-primary transition-colors"
          >
            Dismiss
          </button>
        </div>
      ) : (
        <>
          <ul className="space-y-1.5 mb-3">
            <AnimatePresence initial={false}>
              {suggestions?.map((title, i) => (
                <motion.li
                  key={i}
                  layout
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  className="flex items-center gap-2 group"
                >
                  <span className="text-muted-foreground/60 text-xs select-none">☐</span>
                  {editing ? (
                    <input
                      value={title}
                      onChange={(e) => handleEditTitle(i, e.target.value)}
                      className="flex-1 bg-transparent text-xs text-foreground outline-none border-b border-border/40 focus:border-primary/60 transition-colors"
                    />
                  ) : (
                    <span className="flex-1 text-xs text-foreground">{title}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    aria-label="Remove suggestion"
                    className="text-muted-foreground/40 hover:text-destructive transition-colors text-xs opacity-0 group-hover:opacity-100"
                  >
                    ×
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddAll}
              disabled={creating || (suggestions?.length ?? 0) === 0}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Adding…' : `Add all ${suggestions?.length ?? 0} task${suggestions?.length === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border/60 text-foreground hover:bg-muted/40 transition-colors"
            >
              {editing ? 'Done editing' : 'Customize'}
            </button>
            <button
              type="button"
              onClick={() => onDismiss('skipped')}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              Skip
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
