'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface DocSearchResult {
  id: string;
  title: string;
  icon: string | null;
}

interface DocLinkPickerProps {
  position: { top: number; left: number };
  onSelect: (doc: DocSearchResult) => void;
  onCancel: () => void;
}

// Floating doc-search panel for the /page slash command. Hits the existing
// /api/docs/search endpoint (PostgreSQL FTS, prefix match, ts_rank ordering)
// with a 300ms debounce so we don't fire on every keystroke. Up to 5 results
// shown — matching the editor's other inline-popover affordances.
export default function DocLinkPicker({
  position,
  onSelect,
  onCancel,
}: DocLinkPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search — also aborts any in-flight request when the query
  // changes, so a slow response can't overwrite a newer one.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/docs/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal, credentials: 'include' },
        );
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = (await res.json()) as Array<{
          id: string;
          title: string;
          icon: string | null;
        }>;
        if (!controller.signal.aborted) {
          setResults(
            data.slice(0, 5).map((d) => ({
              id: d.id,
              title: d.title || 'Untitled',
              icon: d.icon,
            })),
          );
          setSelectedIndex(0);
        }
      } catch (err) {
        // AbortError fires on unmount or new query — ignore both
        if ((err as Error).name !== 'AbortError') {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex((i) => (i + 1) % results.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex((i) => (i - 1 + results.length) % results.length);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const picked = results[selectedIndex];
      if (picked) onSelect(picked);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'fixed z-[60] w-[320px] font-sans',
        'rounded-lg border border-border/60 bg-popover',
        'shadow-lg shadow-black/10',
      )}
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-muted-foreground"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search documents…"
          aria-label="Search documents"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      <div className="max-h-72 overflow-y-auto py-1">
        {loading && results.length === 0 && (
          <p className="px-3 py-3 text-center text-xs text-muted-foreground">
            Searching…
          </p>
        )}
        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <p className="px-3 py-3 text-center text-xs italic text-muted-foreground">
            No documents found
          </p>
        )}
        {!loading && query.trim().length < 2 && (
          <p className="px-3 py-3 text-center text-xs text-muted-foreground/60">
            Type to search
          </p>
        )}
        {results.map((doc, i) => (
          <button
            key={doc.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(doc)}
            onMouseEnter={() => setSelectedIndex(i)}
            className={cn(
              'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm',
              'transition-colors duration-75',
              i === selectedIndex
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground hover:bg-muted',
            )}
          >
            <span
              className={cn(
                'flex h-6 w-6 flex-shrink-0 items-center justify-center text-base',
                doc.icon ? '' : 'text-muted-foreground',
              )}
              aria-hidden="true"
            >
              {doc.icon ?? '📄'}
            </span>
            <span className="truncate">{doc.title}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
