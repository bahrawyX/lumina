'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDocsStore } from '@/store/useDocsStore';
import * as docsPersistence from '@/lib/persistence/docsPersistence';
import DocEditor from '@/components/docs/DocEditor';
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
import type { Block } from '@blocknote/core';

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
  const editorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

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

  // Save title on blur
  const handleTitleBlur = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed && openDocContent && trimmed !== openDocContent.title) {
      updateDoc(docId, { title: trimmed });
    }
  }, [title, openDocContent, docId, updateDoc]);

  // Title Enter -> focus editor
  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const editorEl = editorRef.current?.querySelector('[contenteditable]');
      if (editorEl instanceof HTMLElement) editorEl.focus();
    }
  }, []);

  // Editor content change
  const handleEditorChange = useCallback(
    (blocks: Block[], plainText: string, wordCount: number) => {
      saveContent(docId, blocks as any, plainText, wordCount);
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
      <div className="flex-1 px-4 md:px-16 py-6 max-w-3xl mx-auto w-full">
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
          className="w-full text-3xl font-bold text-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground/40 mb-1"
        />

        {/* Last edited + save indicator */}
        <div className="flex items-center gap-3 mb-6">
          {openDocContent?.updatedAt && (
            <span className="text-xs text-muted-foreground">
              Last edited{' '}
              {new Date(openDocContent.updatedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
          <DocSaveIndicator />
        </div>

        {/* Divider */}
        <div className="border-t border-border/40 mb-6" />

        {/* Editor */}
        <div ref={editorRef}>
          <DocEditor
            key={docId}
            initialContent={openDocContent?.content as Block[] | null}
            onChange={handleEditorChange}
            className="min-h-[300px]"
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
