'use client';

import React, { useState, useRef, useCallback } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FloatingToolbarProps {
  editor: Editor;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  label: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive = false, label, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-100',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-border flex-shrink-0" aria-hidden="true" />;
}

export function FloatingToolbar({ editor }: FloatingToolbarProps) {
  const [linkMode, setLinkMode] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  const enterLinkMode = useCallback(() => {
    const existingHref = editor.getAttributes('link').href as string | undefined;
    setLinkValue(existingHref ?? '');
    setLinkMode(true);
    setTimeout(() => linkInputRef.current?.focus(), 0);
  }, [editor]);

  const submitLink = useCallback(() => {
    const trimmed = linkValue.trim();
    if (trimmed) {
      editor
        .chain()
        .focus()
        .setLink({ href: trimmed, target: '_blank', rel: 'noopener noreferrer' })
        .run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setLinkMode(false);
  }, [editor, linkValue]);

  const cancelLink = useCallback(() => {
    setLinkMode(false);
    editor.commands.focus();
  }, [editor]);

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: ed, from, to }) => {
        if (from === to) return false;
        if (ed.isActive('image')) return false;
        if (ed.isActive('codeBlock')) return false;
        return true;
      }}
      options={{
        placement: 'top',
        offset: 8,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 6 }}
        transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'flex items-center gap-0.5 rounded-xl border border-border/60 bg-popover',
          'px-1.5 py-1 shadow-lg shadow-black/10',
          'dark:shadow-black/30',
        )}
      >
        {linkMode ? (
          <div className="flex items-center gap-1.5 px-1">
            <input
              ref={linkInputRef}
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitLink();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelLink();
                }
              }}
              placeholder="https://..."
              type="url"
              className={cn(
                'h-6 w-48 bg-transparent text-xs outline-none',
                'placeholder:text-muted-foreground/50',
              )}
            />
            <button
              type="button"
              onClick={submitLink}
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {linkValue ? 'Set' : 'Remove'}
            </button>
            <button
              type="button"
              onClick={cancelLink}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              isActive={editor.isActive('bold')}
              label="Bold (⌘B)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 4h8a4 4 0 010 8H6zM6 12h9a4 4 0 010 8H6z" />
              </svg>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              isActive={editor.isActive('italic')}
              label="Italic (⌘I)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="19" y1="4" x2="10" y2="4" />
                <line x1="14" y1="20" x2="5" y2="20" />
                <line x1="15" y1="4" x2="9" y2="20" />
              </svg>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              isActive={editor.isActive('underline')}
              label="Underline (⌘U)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 3v7a6 6 0 0012 0V3" />
                <line x1="4" y1="21" x2="20" y2="21" />
              </svg>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleStrike().run()}
              isActive={editor.isActive('strike')}
              label="Strikethrough"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="12" x2="20" y2="12" />
                <path d="M17.5 5.5C15.5 3 9 3.5 7 7c-2 3.5 1 6 4 7" />
                <path d="M7 19c2 2.5 9.5 3 12.5-.5 1.5-2 1.5-4.5-1-6.5" />
              </svg>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleCode().run()}
              isActive={editor.isActive('code')}
              label="Inline code"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              isActive={editor.isActive('highlight')}
              label="Highlight"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </ToolbarButton>

            <Divider />

            <ToolbarButton
              onClick={enterLinkMode}
              isActive={editor.isActive('link')}
              label="Link (⌘K)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
              </svg>
            </ToolbarButton>

            <Divider />

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              isActive={editor.isActive('heading', { level: 1 })}
              label="Heading 1"
            >
              <span className="text-[11px] font-semibold font-mono leading-none">H1</span>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              isActive={editor.isActive('heading', { level: 2 })}
              label="Heading 2"
            >
              <span className="text-[11px] font-semibold font-mono leading-none">H2</span>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              isActive={editor.isActive('heading', { level: 3 })}
              label="Heading 3"
            >
              <span className="text-[11px] font-semibold font-mono leading-none">H3</span>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => editor.chain().focus().setParagraph().run()}
              isActive={editor.isActive('paragraph') && !editor.isActive('heading')}
              label="Paragraph"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M13 4v16M17 4H9.5a4.5 4.5 0 000 9H13" />
              </svg>
            </ToolbarButton>
          </>
        )}
      </motion.div>
    </BubbleMenu>
  );
}

export default FloatingToolbar;
