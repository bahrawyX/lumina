'use client';

// P1-15: katex's stylesheet used to be imported in the ROOT layout, putting
// 23.8 KB of CSS into the single stylesheet every route loads — including the
// marketing page and the 404 — when only the Tiptap math node needs it.
import 'katex/dist/katex.min.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useEditor,
  useEditorState,
  EditorContent,
  ReactNodeViewRenderer,
} from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import { motion, AnimatePresence } from 'framer-motion';
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
import { toast } from 'sonner';
import { useTheme } from '@/components/theme-provider';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import { cn } from '@/lib/utils';
import { FloatingToolbar } from './FloatingToolbar';
import { TaskBlockExtension } from './extensions/TaskBlockExtension';
import { ColumnExtension } from './extensions/ColumnExtension';
import { ColumnsExtension } from './extensions/ColumnsExtension';
import { SlashCommandExtension } from './extensions/SlashCommandExtension';
import { CodeBlockNodeView } from './extensions/CodeBlockNodeView';
import { KeyboardShortcutsExtension } from './extensions/KeyboardShortcutsExtension';
import { FocusBlockExtension } from './extensions/FocusBlockExtension';
import { ToggleExtension } from './extensions/ToggleExtension';
import { BookmarkExtension } from './extensions/BookmarkExtension';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Mathematics } from '@tiptap/extension-mathematics';
import ColumnRatioPicker, { type ColumnRatio } from './ColumnRatioPicker';
import AIPromptInput from './AIPromptInput';
import DocLinkPicker, { type DocSearchResult } from './DocLinkPicker';

// Module-level lowlight instance — creating it inside the component would
// re-instantiate every language parser on every render.
const lowlight = createLowlight(common);

/**
 * Trailing slice of the document sent as AI context. Mirrors
 * MAX_CONTEXT_CHARS in /api/docs/ai-stream, which truncates server-side
 * regardless - this is the polite half of the same limit.
 */
const AI_CONTEXT_CHARS = 8_000;

const AI_PLACEHOLDER = '✨ Generating…';

export interface DocEditorProps {
  docId: string;
  // Tiptap JSONContent (`{ type: 'doc', content: [...] }`) or null for
  // brand-new empty docs. Anything that doesn't match the expected shape is
  // discarded by safeInitialContent below before Tiptap sees it.
  initialContent?: JSONContent | null;
  // Fired immediately on every change. Word count is included so DocPage's
  // saveContent (which is what runs the 1s debounce + stale-write check)
  // gets the same triple it always did.
  onUpdate?: (content: JSONContent, plainText: string, wordCount: number) => void;
  // Fired (debounced ~500ms) for live word-count display in the page header.
  // Kept separate from onUpdate so the count can update without waiting for
  // the consumer's save debounce, while still avoiding a re-render per char.
  onWordCountChange?: (words: number) => void;
  // When true, dim non-focused top-level blocks. Persisted by DocPage in
  // localStorage; this component just reflects the prop.
  focusMode?: boolean;
  className?: string;
}

// Tiptap expects a single root JSONContent `{ type: 'doc', content: [...] }`.
// Reject anything else (null, arrays, primitives, objects without a `type`)
// so an unexpected DB shape can't crash the editor on mount.
function safeInitialContent(content: JSONContent | null | undefined): JSONContent | undefined {
  if (!content) return undefined;
  if (Array.isArray(content)) return undefined;
  if (typeof content !== 'object') return undefined;
  if (!('type' in content)) return undefined;
  return content;
}

export default function DocEditor({
  docId,
  initialContent,
  onUpdate,
  onWordCountChange,
  focusMode = false,
  className,
}: DocEditorProps) {
  const { resolvedTheme } = useTheme();

  // Slash-command-driven UI state.
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [aiPromptCoords, setAiPromptCoords] = useState<
    { top: number; left: number } | null
  >(null);
  // Doc position captured at /ai trigger time so a focus shift before the
  // user submits the prompt doesn't move the insert point.
  const aiInsertPosRef = useRef<number | null>(null);
  const [docLinkCoords, setDocLinkCoords] = useState<
    { top: number; left: number } | null
  >(null);
  const docLinkPosRef = useRef<number | null>(null);

  // Word-count emission is debounced ~500ms so DocPage doesn't re-render on
  // every keystroke just to show "12 words" → "13 words". Tiptap's onUpdate
  // still fires per keystroke (we need that for save), but the React state
  // tied to wordCount only flips a few times per second.
  const wordCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      }).extend({
        // Phase 5: render code blocks via a React NodeView so we can show a
        // language selector and copy button alongside the syntax-highlighted
        // <pre>. The base extension's parse/serialize behavior is preserved.
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockNodeView);
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        // Accept http(s) for external links AND root-relative '/' for the
        // /page slash command's intra-doc links. Both are safe — relative
        // paths can't escape origin, and we already block javascript: by
        // requiring the URL to start with either http or '/'.
        validate: (url: string) => /^(https?:\/\/|\/)/.test(url),
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
      // Custom block-level nodes — must be registered BEFORE SlashCommand so
      // the slash menu's commands can reference them. ColumnExtension MUST
      // come before ColumnsExtension because the latter's content spec
      // ('column+') is resolved at registration time.
      ColumnExtension,
      ColumnsExtension,
      TaskBlockExtension,
      ToggleExtension,
      BookmarkExtension,
      Table.configure({
        resizable: true,
        handleWidth: 5,
        cellMinWidth: 100,
        lastColumnResizable: false,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Mathematics,
      KeyboardShortcutsExtension,
      FocusBlockExtension,
      SlashCommandExtension.configure({
        docId,
        onOpenColumnPicker: () => setShowColumnPicker(true),
        onOpenAIPrompt: ({ coords, docPos }) => {
          aiInsertPosRef.current = docPos;
          setAiPromptCoords(coords);
        },
        onOpenDocLinkPicker: ({ coords, docPos }) => {
          docLinkPosRef.current = docPos;
          setDocLinkCoords(coords);
        },
      }),
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
      // onUpdate fires immediately — the store's saveContent handles the 1s
      // debounce + stale-write check. wordCount visual update is debounced
      // separately to avoid a parent re-render per keystroke.
      onUpdate?.(editor.getJSON(), editor.getText(), wc);
      if (wordCountTimerRef.current) clearTimeout(wordCountTimerRef.current);
      wordCountTimerRef.current = setTimeout(() => {
        onWordCountChange?.(wc);
      }, 500);
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
    // Dev-only window exposure so the e2e suite (tests/e2e/editor.spec.ts)
    // can read editor.getJSON() to assert custom-node attrs survive round-
    // trip. NODE_ENV-gated so production never leaks the editor instance.
    if (editor && process.env.NODE_ENV !== 'production') {
      (window as unknown as { __luminaEditor?: unknown }).__luminaEditor = editor;
    }
    // We only want this on editor instance creation, not on every parent
    // render that might pass a new onWordCountChange identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Bridge editor → task board. Each TaskBlockNodeView dispatches this event
  // when its checkbox is clicked; we forward the new status to the task store.
  // The store's updateTask() then dispatches lumina:task-updated, which the
  // NodeView listens for to keep the visual state in sync. The loop is
  // bounded — updateAttributes inside the NodeView is a pure ProseMirror
  // transaction with no side effects, so nothing re-fires this event.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (
        event as CustomEvent<{ taskId: string; status: 'todo' | 'done' }>
      ).detail;
      if (!detail?.taskId) return;
      useTaskBoardStore.getState().updateTask(detail.taskId, {
        status: detail.status,
      });
    };
    window.addEventListener('lumina:taskblock-toggle', handler);
    return () =>
      window.removeEventListener('lumina:taskblock-toggle', handler);
  }, []);

  // Block-in animation gate: 300ms after mount, drop the .editor-loaded
  // class onto the wrapper so initial content doesn't all animate at once.
  const [editorLoaded, setEditorLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEditorLoaded(true), 300);
    return () => clearTimeout(t);
  }, []);

  // Cmd+S → force-save bridge. KeyboardShortcutsExtension dispatches the
  // event; this listener flushes pending content to onUpdate immediately so
  // the user gets visual save feedback right away.
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const wc = editor.storage.characterCount.words();
      onUpdate?.(editor.getJSON(), editor.getText(), wc);
    };
    window.addEventListener('lumina:force-save', handler);
    return () => window.removeEventListener('lumina:force-save', handler);
  }, [editor, onUpdate]);

  // Block-in animation trigger. After editor-loaded flips, watch for new
  // top-level children appended to the ProseMirror root and run a Web
  // Animations entrance on them. We use element.animate() rather than
  // setting a `data-new-block` attribute because mutating the DOM inside
  // the observer triggers ProseMirror's view to redraw the node, which
  // re-fires the observer in an infinite loop. The Web Animations API
  // doesn't mutate observable DOM state, so it's safe.
  useEffect(() => {
    if (!editor || !editorLoaded) return;
    const root = editor.view.dom;
    if (!root) return;
    // Track elements we've already animated so a Tiptap re-render that
    // briefly removes-and-re-adds the same DOM node doesn't replay the
    // entrance every keystroke.
    const animated = new WeakSet<Element>();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (
            node instanceof Element &&
            node.parentNode === root &&
            !animated.has(node)
          ) {
            animated.add(node);
            try {
              node.animate(
                [
                  { opacity: 0, transform: 'translateY(6px)' },
                  { opacity: 1, transform: 'translateY(0)' },
                ],
                { duration: 150, easing: 'ease-out' },
              );
            } catch {
              /* Web Animations may be unavailable in odd contexts — ignore */
            }
          }
        });
      });
    });
    observer.observe(root, { childList: true });
    return () => observer.disconnect();
  }, [editor, editorLoaded]);

  // Focus-mode active-block tracker is implemented as a ProseMirror plugin
  // in FocusBlockExtension — see that file for the rationale (DOM mutations
  // outside PM's view layer get clobbered by redraws; Decorations don't).

  // Cleanup the wordCount debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (wordCountTimerRef.current) clearTimeout(wordCountTimerRef.current);
    };
  }, []);

  // Empty-state hint visibility. Subscribed via useEditorState so it
  // re-renders on any doc change. We don't use editor.isEmpty here because
  // it stays true when the doc has empty structural blocks (e.g. a code
  // block with no content) — the hint should disappear the moment ANY
  // block has been inserted or any text typed.
  const isPristine = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return true;
      const doc = editor.state.doc;
      return (
        doc.childCount === 1 &&
        doc.firstChild?.type.name === 'paragraph' &&
        doc.firstChild.content.size === 0
      );
    },
  });

  // ── /columns selection handler ──
  const handleColumnsSelect = useCallback(
    (ratio: ColumnRatio) => {
      editor?.chain().focus().insertColumns(ratio.widths).run();
    },
    [editor],
  );

  // ── /ai stream handler ──
  // Inserts a placeholder paragraph at the captured position, then replaces
  // its text content with each streamed chunk via tr.insertText. tr-based
  // updates are one transaction per chunk, which Tiptap can handle fluidly
  // at typical Gemini streaming rates.
  const handleAISubmit = useCallback(
    async (prompt: string) => {
      const coords = aiPromptCoords;
      setAiPromptCoords(null);
      if (!editor || coords == null) return;

      const insertPos =
        aiInsertPosRef.current ?? editor.state.selection.from;
      aiInsertPosRef.current = null;

      // Insert placeholder. We move the selection to insertPos first so
      // insertContent uses it as the anchor, then capture the resulting
      // cursor position as the END of the placeholder text. Computing
      // textStart from the post-insert cursor avoids the off-by-one that
      // happens when ProseMirror merges the inserted paragraph into an
      // existing empty paragraph (which leaves the open token uncounted).
      editor
        .chain()
        .setTextSelection(insertPos)
        .insertContent({
          type: 'paragraph',
          content: [{ type: 'text', text: AI_PLACEHOLDER }],
        })
        .run();

      const textEnd = editor.state.selection.from;
      const textStart = textEnd - AI_PLACEHOLDER.length;
      let prevLen = AI_PLACEHOLDER.length;

      // Best-effort delete of the placeholder text content (not the paragraph
      // wrapper, since it may have been merged into an existing block).
      // We catch the throw if positions have shifted (user kept editing) —
      // in that case there's no clean rollback and we just leave the
      // partial content.
      const removePlaceholder = () => {
        try {
          editor
            .chain()
            .deleteRange({ from: textStart, to: textStart + prevLen })
            .run();
        } catch {
          /* position shifted — accept the orphan content */
        }
      };

      let res: Response;
      try {
        res = await fetch('/api/docs/ai-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            prompt,
            // The whole document used to be sent on every assist. A long doc
            // is hundreds of thousands of input tokens per keystroke-assist,
            // billed to our Gemini key. The server truncates too - this just
            // avoids pushing the bytes over the wire in the first place.
            context: editor.getText().slice(-AI_CONTEXT_CHARS),
          }),
        });
      } catch {
        removePlaceholder();
        toast.error('AI assist unavailable');
        return;
      }

      if (res.status === 429) {
        removePlaceholder();
        // The server distinguishes the per-minute cap from the daily one; show
        // whichever it actually sent rather than always blaming the minute.
        let message = 'AI assist limit reached. Try again in a minute.';
        try {
          const payload = (await res.json()) as { message?: string };
          if (payload?.message) message = payload.message;
        } catch {
          /* keep the default */
        }
        toast.error(message);
        return;
      }
      if (res.status === 413) {
        removePlaceholder();
        toast.error('That request was too large.');
        return;
      }
      if (!res.ok || !res.body) {
        removePlaceholder();
        toast.error('AI assist unavailable');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let firstChunk = true;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          if (firstChunk) {
            // Replace the placeholder text wholesale on the first real chunk
            // so the shimmer goes away cleanly.
            accumulated = chunk;
            firstChunk = false;
          } else {
            accumulated += chunk;
          }
          try {
            // tr.insertText replaces a range with new text in one step. Cheap
            // enough for ~per-word streaming; expensive only if the model
            // returns a single huge chunk, which is fine.
            const tr = editor.state.tr.insertText(
              accumulated,
              textStart,
              textStart + prevLen,
            );
            editor.view.dispatch(tr);
            prevLen = accumulated.length;
          } catch {
            // Position invalidated mid-stream — bail without throwing further.
            break;
          }
        }
      } catch {
        if (!accumulated.trim()) removePlaceholder();
        toast.error('AI assist unavailable');
        return;
      }

      if (!accumulated.trim()) {
        removePlaceholder();
        toast.error('AI assist unavailable');
        return;
      }

      // Server awards a one-time `ai_docs` coin for the first AI use today.
      // Lazy-import the coins store so we don't pull it into the editor's
      // initial chunk.
      void import('@/store/useCoinsStore').then(({ useCoinsStore }) =>
        useCoinsStore.getState().invalidateBalance(),
      );
    },
    [editor, aiPromptCoords],
  );

  const cancelAIPrompt = useCallback(() => {
    setAiPromptCoords(null);
    aiInsertPosRef.current = null;
    editor?.commands.focus();
  }, [editor]);

  // ── /page selection handler ──
  // Inserts a Tiptap text node with a Link mark pointing to the chosen doc.
  // Using insertContentAt so the link lands at the captured position even if
  // the user clicked elsewhere while the picker was open.
  const handleDocLinkSelect = useCallback(
    (doc: DocSearchResult) => {
      const pos = docLinkPosRef.current;
      docLinkPosRef.current = null;
      setDocLinkCoords(null);
      if (!editor || pos === null) return;
      editor
        .chain()
        .focus()
        .insertContentAt(pos, {
          type: 'text',
          text: doc.title,
          marks: [
            {
              type: 'link',
              attrs: {
                href: `/docs/${doc.id}`,
                target: '_self',
                rel: null,
              },
            },
          ],
        })
        .run();
    },
    [editor],
  );

  const cancelDocLinkPicker = useCallback(() => {
    setDocLinkCoords(null);
    docLinkPosRef.current = null;
    editor?.commands.focus();
  }, [editor]);

  return (
    <div
      className={cn(
        'lumina-editor relative',
        editorLoaded && 'editor-loaded',
        focusMode && 'focus-mode-active',
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

      {/* Empty-state hint — appears below a brand-new doc as a quiet pointer
          to the slash menu. The 0.5s delay prevents it from flashing on
          mount before the editor's own placeholder has settled. */}
      <AnimatePresence>
        {isPristine && editorLoaded && (
          <motion.p
            key="empty-hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.3, delay: 0.5 } }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="pointer-events-none mt-2 select-none text-center text-xs text-muted-foreground/40"
          >
            Start writing, or type{' '}
            <kbd className="rounded border border-border/40 px-1 py-0.5 font-mono text-[10px]">
              /
            </kbd>{' '}
            for commands
          </motion.p>
        )}
      </AnimatePresence>

      {showColumnPicker &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-background/40 backdrop-blur-sm"
              onClick={() => {
                setShowColumnPicker(false);
                editor?.commands.focus();
              }}
            />
            <div className="relative z-10">
              <ColumnRatioPicker
                onSelect={handleColumnsSelect}
                onClose={() => {
                  setShowColumnPicker(false);
                  editor?.commands.focus();
                }}
              />
            </div>
          </div>,
          document.body,
        )}

      {aiPromptCoords &&
        typeof document !== 'undefined' &&
        createPortal(
          <AIPromptInput
            position={aiPromptCoords}
            onSubmit={handleAISubmit}
            onCancel={cancelAIPrompt}
          />,
          document.body,
        )}

      {docLinkCoords &&
        typeof document !== 'undefined' &&
        createPortal(
          <DocLinkPicker
            position={docLinkCoords}
            onSelect={handleDocLinkSelect}
            onCancel={cancelDocLinkPicker}
          />,
          document.body,
        )}
    </div>
  );
}
