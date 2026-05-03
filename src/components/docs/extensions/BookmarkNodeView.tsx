'use client';

import React from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { cn } from '@/lib/utils';

export function BookmarkNodeView({ node, selected }: NodeViewProps) {
  const url = (node.attrs.url as string) || '';
  const title = (node.attrs.title as string) || '';
  const displayTitle = title || url || 'Untitled bookmark';

  return (
    <NodeViewWrapper className="bookmark-wrapper my-2">
      <a
        href={url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        contentEditable={false}
        className={cn(
          'group flex items-center gap-3 rounded-lg border px-4 py-3 no-underline',
          'bg-card border-border/60 transition-all duration-150',
          'hover:border-border hover:bg-card/80',
          selected && 'ring-2 ring-primary/30 border-primary/40',
        )}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="flex-shrink-0 text-muted-foreground"
        >
          <path d="M7 9a3 3 0 004.5.4l2-2a3 3 0 00-4.2-4.2l-1.1 1.1" />
          <path d="M9 7a3 3 0 00-4.5-.4l-2 2a3 3 0 004.2 4.2l1.1-1.1" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {displayTitle}
          </p>
          {url && (
            <p className="truncate text-xs text-muted-foreground">{url}</p>
          )}
        </div>
        <span className="flex-shrink-0 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          Open ↗
        </span>
      </a>
    </NodeViewWrapper>
  );
}
