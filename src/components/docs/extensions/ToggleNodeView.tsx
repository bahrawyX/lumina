'use client';

import React from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { cn } from '@/lib/utils';

export function ToggleNodeView({ node, updateAttributes }: NodeViewProps) {
  const isOpen = node.attrs.isOpen as boolean;

  const toggle = () => {
    updateAttributes({ isOpen: !isOpen });
  };

  return (
    <NodeViewWrapper className="toggle-wrapper my-0.5">
      <div className="rounded-md border border-transparent transition-colors hover:border-border/40">
        <button
          type="button"
          contentEditable={false}
          onClick={toggle}
          aria-expanded={isOpen}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
            className={cn(
              'flex-shrink-0 text-muted-foreground transition-transform duration-150',
              isOpen ? 'rotate-90' : 'rotate-0',
            )}
          >
            <polyline points="4 2 10 7 4 12" />
          </svg>
          <span className="text-sm font-medium text-foreground">
            {isOpen ? 'Click to collapse' : 'Click to expand'}
          </span>
        </button>

        {/* When closed, hide the content visually but KEEP it in the DOM
            so ProseMirror's content sync stays consistent. NodeViewContent
            must always render to satisfy the schema (content: 'block+'). */}
        <div
          className={cn(
            'transition-all duration-150',
            isOpen ? 'block pl-5 pr-2 pb-1.5' : 'hidden',
          )}
        >
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
