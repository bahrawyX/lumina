'use client';

import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { Typography } from '@tiptap/extension-typography';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { CharacterCount } from '@tiptap/extension-character-count';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { common, createLowlight } from 'lowlight';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import { FloatingToolbar } from './FloatingToolbar';

// Module-level lowlight instance — creating it inside the component would
// re-instantiate every language parser on every render.
const lowlight = createLowlight(common);

export interface DocEditorProps {
  docId: string;
  // Tiptap JSONContent or null for brand-new empty docs. Legacy BlockNote
  // content from the database is filtered out at the boundary (see below)
  // until Phase 6 migrates it to proper Tiptap JSON.
  initialContent?: JSONContent | null;
  // Fired immediately on every change. Word count is included so DocPage's
  // saveContent (which is what runs the 1s debounce + stale-write check)
  // gets the same triple it always did.
  onUpdate?: (content: JSONContent, plainText: string, wordCount: number) => void;
  // Fired immediately on every change for live word-count display in the
  // page header. Kept separate from onUpdate so the count can update without
  // waiting for whatever debounce the consumer applies to onUpdate.
  onWordCountChange?: (words: number) => void;
  className?: string;
}

// BlockNote stored content as an array of block objects; Tiptap stores a
// single root JSONContent { type: 'doc', content: [...] }. If we hand the
// editor an array, Tiptap throws on mount. Detect and discard until Phase 6
// runs the proper migration.
function safeInitialContent(content: JSONContent | null | undefined): JSONContent | undefined {
  if (!content) return undefined;
  if (Array.isArray(content)) return undefined;
  if (typeof content !== 'object') return undefined;
  if (!('type' in content)) return undefined;
  return content;
}

export default function DocEditor({
  docId: _docId,
  initialContent,
  onUpdate,
  onWordCountChange,
  className,
}: DocEditorProps) {
  const { resolvedTheme } = useTheme();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // We bring our own syntax-highlighted code block.
        codeBlock: false,
        // We configure Link separately for autolink + URL validation.
        link: false,
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        showOnlyCurrent: true,
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            const map: Record<number, string> = {
              1: 'Heading 1',
              2: 'Heading 2',
              3: 'Heading 3',
            };
            return map[node.attrs.level as number] ?? 'Heading';
          }
          return "Write something, or type '/' for commands…";
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext',
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        validate: (url: string) => /^https?:\/\//.test(url),
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
    ],
    content: safeInitialContent(initialContent),
    autofocus: 'end',
    // Tiptap v3 + Next.js: SSR is disabled (next/dynamic ssr:false) but the
    // editor still mounts via React effects, so this guard avoids the
    // "Tiptap Editor is rendering on SSR" warning during hot reloads.
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      // Tiptap v3 does NOT fire onUpdate on hydration of initial content
      // (verified empirically), so every emission here is a real user edit.
      const wc = editor.storage.characterCount.words();
      onWordCountChange?.(wc);
      onUpdate?.(editor.getJSON(), editor.getText(), wc);
    },
    editorProps: {
      attributes: {
        class: 'prose-editor-content',
        spellcheck: 'true',
      },
    },
  });

  // Initial word-count emit once the editor finishes mounting.
  useEffect(() => {
    if (editor) {
      onWordCountChange?.(editor.storage.characterCount.words());
    }
    // We only want this on editor instance creation, not on every parent
    // render that might pass a new onWordCountChange identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Block-in animation gate: 300ms after mount, drop the .editor-loaded
  // class onto the wrapper so initial content doesn't all animate at once.
  // Phase 5 will add per-new-block animation via MutationObserver.
  const [editorLoaded, setEditorLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEditorLoaded(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={cn(
        'lumina-editor relative',
        editorLoaded && 'editor-loaded',
        className,
      )}
      data-color-scheme={resolvedTheme}
    >
      {editor && <FloatingToolbar editor={editor} />}

      {editor && (
        <DragHandle editor={editor} className="drag-handle">
          <div className="drag-handle-btn" aria-label="Drag to reorder block">
            <svg
              width="10"
              height="14"
              viewBox="0 0 10 14"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="2" cy="2" r="1.2" />
              <circle cx="8" cy="2" r="1.2" />
              <circle cx="2" cy="7" r="1.2" />
              <circle cx="8" cy="7" r="1.2" />
              <circle cx="2" cy="12" r="1.2" />
              <circle cx="8" cy="12" r="1.2" />
            </svg>
          </div>
        </DragHandle>
      )}

      <EditorContent editor={editor} className="tiptap-content" />
    </div>
  );
}
