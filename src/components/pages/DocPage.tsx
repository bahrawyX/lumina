'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useDocsStore } from '@/store/useDocsStore';
import * as docsPersistence from '@/lib/persistence/docsPersistence';

const DocEditor = dynamic(() => import('@/components/docs/DocEditor'), { ssr: false });
import DocBreadcrumb from '@/components/docs/DocBreadcrumb';
import DocSaveIndicator from '@/components/docs/DocSaveIndicator';
import DocRightSidebar from '@/components/docs/DocRightSidebar';
import { CompactEmojiPicker } from '@/components/ui/CompactEmojiPicker';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { JSONContent } from '@tiptap/core';

const COVER_GRADIENTS = [
  'linear-gradient(135deg, hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.1))',
  'linear-gradient(135deg, hsl(var(--muted)), hsl(var(--background)))',
  'linear-gradient(135deg, #667eea33, #764ba233)',
  'linear-gradient(135deg, #f093fb33, #f5576c33)',
  'linear-gradient(135deg, #4facfe33, #00f2fe33)',
  'linear-gradient(135deg, #43e97b33, #38f9d733)',
];

export default function DocPage() {
  const params = useParams();
  const router = useRouter();
  const docId = params?.id as string;

  const openDocContent = useDocsStore((s) => s.openDocContent);
  const setOpenDocContent = useDocsStore((s) => s.setOpenDocContent);
  const saveContent = useDocsStore((s) => s.saveContent);
  const updateDoc = useDocsStore((s) => s.updateDoc);
  const docs = useDocsStore((s) => s.docs);

  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // Tracks whether the current blur was triggered by an Escape-revert. The
  // blur fires synchronously from e.currentTarget.blur(), before React has
  // flushed the setTitle(previous-value) update, so handleTitleBlur would
  // otherwise see the stale (user-typed) value and persist it.
  const skipNextBlurRef = useRef(false);

  // Fetch full doc on mount
  useEffect(() => {
    if (!docId) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      const doc = await docsPersistence.fetchOne(docId);
      if (cancelled) return;
      if (!doc) {
        router.push('/docs');
        return;
      }
      setOpenDocContent(doc);
      setTitle(doc.title);
      setIsLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [docId, setOpenDocContent, router]);

  // Save title on blur. Empty input reverts to the previous value so the user
  // never ends up staring at an empty title that wasn't persisted.
  const handleTitleBlur = useCallback(() => {
    if (skipNextBlurRef.current) {
      skipNextBlurRef.current = false;
      if (openDocContent) setTitle(openDocContent.title);
      return;
    }
    if (!openDocContent) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(openDocContent.title);
      return;
    }
    if (trimmed !== openDocContent.title) {
      updateDoc(docId, { title: trimmed });
    }
  }, [title, openDocContent, docId, updateDoc]);

  // Title Enter -> focus editor; Escape reverts to the last-saved value and
  // drops focus.
  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const editorEl = editorRef.current?.querySelector('[contenteditable]');
      if (editorEl instanceof HTMLElement) editorEl.focus();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      // Mark BEFORE blur so handleTitleBlur knows to skip persisting the
      // stale typed-but-not-yet-reverted value.
      skipNextBlurRef.current = true;
      if (openDocContent) setTitle(openDocContent.title);
      e.currentTarget.blur();
    }
  }, [openDocContent]);

  // Editor content change. The Tiptap JSON document is a single object;
  // saveContent's signature still expects an array (BlockNote shape). We
  // wrap in a single-element array so the persistence layer's jsonb column
  // round-trips intact, and the Phase 6 migration script will rewrite this.
  const handleEditorUpdate = useCallback(
    (content: JSONContent, plainText: string, words: number) => {
      saveContent(docId, [content as Record<string, unknown>], plainText, words);
    },
    [docId, saveContent]
  );

  // Icon select
  const handleIconSelect = useCallback(
    (emoji: string) => {
      updateDoc(docId, { icon: emoji });
      setIconPickerOpen(false);
    },
    [docId, updateDoc]
  );

  // Cover gradient
  const doc = docs.find((d) => d.id === docId);
  const coverGradient = openDocContent?.coverGradient;
  const icon = doc?.icon ?? openDocContent?.icon;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
    <div className="flex flex-col flex-1 overflow-y-auto">
      {/* Cover */}
      {coverGradient != null && (
        <div
          className="hidden md:block h-[200px] relative group flex-shrink-0"
          style={{ background: COVER_GRADIENTS[coverGradient] ?? COVER_GRADIENTS[0] }}
        >
          <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="text-xs bg-background/80 backdrop-blur px-2 py-1 rounded-md border border-border/60 text-muted-foreground hover:text-foreground"
              onClick={() => setShowCoverPicker(!showCoverPicker)}
            >
              Change cover
            </button>
            <button
              className="text-xs bg-background/80 backdrop-blur px-2 py-1 rounded-md border border-border/60 text-muted-foreground hover:text-foreground"
              onClick={() => updateDoc(docId, { coverGradient: null })}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Cover picker */}
      {showCoverPicker && (
        <div className="px-4 md:px-16 py-3 flex gap-2 border-b border-border/40">
          {COVER_GRADIENTS.map((grad, i) => (
            <button
              key={i}
              className={cn(
                'w-12 h-8 rounded-lg border-2 transition-all',
                coverGradient === i ? 'border-primary' : 'border-border/40 hover:border-border'
              )}
              style={{ background: grad }}
              onClick={() => {
                updateDoc(docId, { coverGradient: i });
                setShowCoverPicker(false);
              }}
            />
          ))}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 px-4 md:px-8 py-6 md:py-10 max-w-3xl mx-auto w-full">
        {/* Back to docs — small editorial link, mono-styled */}
        <button
          type="button"
          onClick={() => router.push('/docs')}
          className="mb-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 hover:text-foreground transition-colors"
          aria-label="Back to Docs"
        >
          <svg
            width={10}
            height={10}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Docs
        </button>

        {/* Breadcrumb + mobile menu */}
        <div className="flex items-center justify-between">
          <DocBreadcrumb docId={docId} />
          {/* Mobile: show info button */}
          <button
            type="button"
            className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={() => setShowRightSidebar(!showRightSidebar)}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>

        {/* Icon + controls row */}
        <div className="flex items-center gap-2 mb-2">
          <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
            <PopoverTrigger asChild>
              {icon ? (
                <button
                  className="text-3xl hover:bg-muted/60 rounded-lg p-1 transition-colors"
                >
                  {icon}
                </button>
              ) : (
                <button
                  className="text-xs text-muted-foreground hover:bg-muted/60 px-1.5 py-0.5 rounded transition-colors"
                >
                  Add icon
                </button>
              )}
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="bottom"
              sideOffset={4}
              className="p-0 w-auto border-none shadow-lg"
            >
              <CompactEmojiPicker onSelect={handleIconSelect} />
            </PopoverContent>
          </Popover>

          <div className="flex gap-1 text-xs text-muted-foreground">
            {icon && (
              <button
                className="hover:bg-muted/60 px-1.5 py-0.5 rounded transition-colors"
                onClick={() => updateDoc(docId, { icon: null })}
              >
                Remove icon
              </button>
            )}
            {coverGradient == null && (
              <button
                className="hover:bg-muted/60 px-1.5 py-0.5 rounded transition-colors"
                onClick={() => updateDoc(docId, { coverGradient: 0 })}
              >
                Add cover
              </button>
            )}
          </div>
        </div>

        {/* Title */}
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          placeholder="Untitled"
          className="w-full text-3xl font-bold text-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground/40 mb-2"
        />

        {/* Last edited + save indicator */}
        <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground/60">
          {openDocContent?.updatedAt && (
            <span>
              Edited {formatDistanceToNow(new Date(openDocContent.updatedAt), { addSuffix: true })}
            </span>
          )}
          {openDocContent?.updatedAt && (
            <span className="text-muted-foreground/30">·</span>
          )}
          <DocSaveIndicator />
          <span className="text-muted-foreground/30">·</span>
          <span className="font-mono text-muted-foreground/60">
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </span>
        </div>

        {/* Editor — sits right under the title meta, no divider */}
        <div ref={editorRef} suppressHydrationWarning className="bg-transparent">
          <DocEditor
            key={docId}
            docId={docId}
            initialContent={openDocContent?.content as JSONContent | null}
            onUpdate={handleEditorUpdate}
            onWordCountChange={setWordCount}
            className="min-h-[300px] bg-transparent"
          />
        </div>
      </div>
    </div>

    {/* Right sidebar */}
    {showRightSidebar && (
      <DocRightSidebar docId={docId} onClose={() => setShowRightSidebar(false)} />
    )}
    </div>
  );
}
