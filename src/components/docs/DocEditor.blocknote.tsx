// @ts-nocheck
// BACKUP — original BlockNote-based editor. Kept as a reference during the
// Tiptap migration (Prompts 2-4 reimplement this surface). Deleted in Prompt 6.
'use client';

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {
  useCreateBlockNote,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  createReactBlockSpec,
  type DefaultReactSuggestionItem,
  type SuggestionMenuProps,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from '@blocknote/core';
// xl-multi-column loaded lazily to reduce initial chunk size
import { useTheme } from '@/components/theme-provider';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import '@blocknote/shadcn/style.css';
import type { Block, BlockNoteEditor } from '@blocknote/core';
// Shiki-backed syntax highlighting for `/code` blocks. Ships with a
// language picker (text, javascript, typescript, python, rust, go, etc.)
// and dual light/dark themes that switch based on the editor's theme prop.
import { codeBlockOptions } from '@blocknote/code-block';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import ColumnRatioPicker, { type ColumnRatio } from './ColumnRatioPicker';
import AIPromptInput from './AIPromptInput';

/** Loose shape of BlockNote document blocks at runtime */
interface BlockLike {
  id: string;
  type?: string;
  props?: Record<string, unknown>;
  children?: BlockLike[];
  content?: unknown;
}

// ── Inline SVG icons (project avoids lucide-react) ─────────────────────────
const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const TaskIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);
const CalloutIcon = () => (
  <svg {...iconProps}>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
  </svg>
);
const DividerIcon = () => (
  <svg {...iconProps}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const ColumnsIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="3" width="7" height="18" rx="1" />
    <rect x="14" y="3" width="7" height="18" rx="1" />
  </svg>
);
const AIIcon = () => (
  <svg {...iconProps}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M8 10h8" />
    <path d="M8 14h5" />
  </svg>
);

// ── Custom TaskBlock — Notion-styled ────────────────────────────────────────
// Full-width row with rounded hover background, custom-painted checkbox that
// adopts the primary color on check, and strikethrough text when complete.
const TaskBlockFactory = createReactBlockSpec(
  {
    type: 'taskBlock' as const,
    propSchema: {
      checked: { default: false as const },
      taskId: { default: '' as const },
    },
    content: 'inline' as const,
  },
  {
    render: ({ block, contentRef }) => {
      const { checked, taskId } = block.props;

      const toggle = () => {
        window.dispatchEvent(
          new CustomEvent('lumina:taskblock-toggle', {
            detail: { blockId: block.id, taskId, checked: !checked },
          }),
        );
      };

      return (
        <div
          data-checked={checked || undefined}
          className={cn(
            'group/taskblock flex items-center gap-2.5 px-2 py-1 -mx-2 rounded-md w-full',
            'transition-colors',
            checked
              ? 'bg-primary/5 hover:bg-primary/[0.07]'
              : 'hover:bg-muted/40',
          )}
        >
          <button
            type="button"
            onClick={toggle}
            aria-checked={checked}
            role="checkbox"
            contentEditable={false}
            tabIndex={-1}
            className={cn(
              'shrink-0 w-[18px] h-[18px] rounded-[5px] flex items-center justify-center',
              'transition-colors duration-150 cursor-pointer',
              'border',
              checked
                ? 'bg-primary border-primary text-primary-foreground'
                : 'bg-transparent border-muted-foreground/40 hover:border-primary/60',
            )}
          >
            {checked && (
              <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
          <div
            ref={contentRef}
            className={cn(
              'text-sm leading-[1.55] outline-none flex-1 min-w-0 transition-colors',
              checked ? 'line-through text-muted-foreground/70' : 'text-foreground',
            )}
          />
        </div>
      );
    },
  },
);
const TaskBlock = TaskBlockFactory();

// ── Custom CalloutBlock — colored panel with emoji ─────────────────────────
// Notion-style callout: rounded panel with a soft tinted background, an
// emoji on the left, and inline-editable content on the right.
const CalloutBlockFactory = createReactBlockSpec(
  {
    type: 'callout' as const,
    propSchema: {
      emoji: { default: '💡' as const },
      tone:  { default: 'info' as 'info' | 'success' | 'warning' | 'danger' },
    },
    content: 'inline' as const,
  },
  {
    render: ({ block, contentRef }) => {
      const { emoji, tone } = block.props as { emoji: string; tone: 'info' | 'success' | 'warning' | 'danger' };
      const toneClass =
        tone === 'success' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200' :
        tone === 'warning' ? 'bg-amber-500/10 border-amber-500/25 text-amber-200'   :
        tone === 'danger'  ? 'bg-rose-500/10 border-rose-500/25 text-rose-200'      :
                              'bg-primary/10 border-primary/25 text-foreground';
      return (
        <div className={cn('flex items-start gap-3 px-3 py-2.5 rounded-lg border w-full', toneClass)}>
          <span className="text-base leading-none mt-0.5 select-none" contentEditable={false}>{emoji}</span>
          <div ref={contentRef} className="flex-1 text-sm leading-relaxed outline-none min-w-0" />
        </div>
      );
    },
  },
);
const CalloutBlock = CalloutBlockFactory();

// ── Schema: base (sync) + multi-column (lazy) ─────────────────────────────
const baseSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    taskBlock: TaskBlock,
    callout: CalloutBlock,
  },
  inlineContentSpecs: defaultInlineContentSpecs,
  styleSpecs: defaultStyleSpecs,
});

// Lazy-load xl-multi-column and cache the enhanced schema + drop cursor
let _multiColCache: {
  schema: typeof baseSchema;
  dropCursor: unknown;
} | null = null;

const loadMultiColumn = () =>
  import('@blocknote/xl-multi-column').then((mod) => {
    if (!_multiColCache) {
      _multiColCache = {
        schema: mod.withMultiColumn(baseSchema) as typeof baseSchema,
        dropCursor: mod.multiColumnDropCursor,
      };
    }
    return _multiColCache;
  });

// Pre-warm: start loading immediately (browser idle)
const multiColReady = loadMultiColumn();

type LuminaEditor = typeof baseSchema.BlockNoteEditor;

// ── Editor props ────────────────────────────────────────────────────────────
interface DocEditorProps {
  docId: string;
  initialContent?: Block[] | null;
  onChange?: (blocks: Block[], plainText: string, wordCount: number) => void;
  className?: string;
}

// ── Plain text extraction ───────────────────────────────────────────────────
function extractPlainText(blocks: Block[]): string {
  const parts: string[] = [];
  function walkContent(content: Block['content']) {
    if (!content) return;
    if (typeof content === 'string') { parts.push(content); return; }
    if (Array.isArray(content)) {
      for (const item of content) {
        if ('text' in item && typeof item.text === 'string') parts.push(item.text);
      }
    }
  }
  function walkBlocks(blks: Block[]) {
    for (const block of blks) {
      walkContent(block.content);
      if (block.children?.length) walkBlocks(block.children);
    }
  }
  walkBlocks(blocks);
  return parts.join(' ');
}

// ── Custom slash menu items ─────────────────────────────────────────────────
function getLuminaSlashMenuItems(
  editor: BlockNoteEditor<any, any, any>,
  callbacks: {
    openColumnPicker: () => void;
    createTask: (docId: string) => Promise<string | null>;
    openAIPrompt: () => void;
    docId: string;
  },
): DefaultReactSuggestionItem[] {
  const defaults = getDefaultReactSlashMenuItems(editor);

  const aiItem: DefaultReactSuggestionItem = {
    title: 'Ask AI',
    subtext: 'Generate with AI',
    onItemClick: () => {
      callbacks.openAIPrompt();
    },
    aliases: ['ai', 'ask', 'generate', 'assist', 'gemini'],
    group: 'Lumina',
    icon: <AIIcon />,
  };

  const taskItem: DefaultReactSuggestionItem = {
    title: 'Task',
    subtext: 'Add a task linked to your board',
    onItemClick: async () => {
      // 1. Create real task in DB
      const taskId = await callbacks.createTask(callbacks.docId);

      // 2. Insert taskBlock with taskId stored in props
      const cursor = editor.getTextCursorPosition();
      editor.insertBlocks(
        [
          {
            type: 'taskBlock' as any,
            props: { checked: false, taskId: taskId ?? '' } as any,
          } as any,
        ],
        cursor.block,
        'after',
      );

      // 3. Focus the new block
      setTimeout(() => editor.focus(), 50);
    },
    aliases: ['task', 'todo', 'checkbox'],
    group: 'Lumina',
    icon: <TaskIcon />,
  };

  const columnsItem: DefaultReactSuggestionItem = {
    title: 'Columns',
    subtext: 'Split content into columns',
    onItemClick: () => {
      callbacks.openColumnPicker();
    },
    aliases: ['col', 'columns', 'layout', 'split', '2col', '3col'],
    group: 'Layout',
    icon: <ColumnsIcon />,
  };

  const calloutItem: DefaultReactSuggestionItem = {
    title: 'Callout',
    subtext: 'Highlight important info',
    onItemClick: () => {
      const cursor = editor.getTextCursorPosition();
      editor.updateBlock(cursor.block, { type: 'callout' as any, props: { emoji: '💡', tone: 'info' } as any });
      setTimeout(() => editor.focus(), 30);
    },
    aliases: ['callout', 'info', 'note', 'tip'],
    group: 'Lumina',
    icon: <CalloutIcon />,
  };

  // Real divider block — renders as a true full-width <hr>, not a string of
  // box-drawing characters. Falls back to ThematicBreak/HorizontalRule under
  // the hood via BlockNote's `divider` block spec.
  const dividerItem: DefaultReactSuggestionItem = {
    title: 'Divider',
    subtext: 'Full-width horizontal line',
    onItemClick: () => {
      const cursor = editor.getTextCursorPosition();
      try {
        editor.updateBlock(cursor.block, { type: 'divider' as any });
      } catch {
        // Older BlockNote versions don't expose `divider` — fall through to
        // pageBreak which also renders a full-width separator.
        editor.updateBlock(cursor.block, { type: 'pageBreak' as any });
      }
    },
    aliases: ['divider', 'hr', 'line', 'separator', '---'],
    group: 'Layout',
    icon: <DividerIcon />,
  };

  // ── Notion-parity additions ──────────────────────────────────────────────
  // BlockNote's defaults already include H1/H2/H3, paragraph, bullet/numbered
  // lists, check list, quote, table, image, file, audio, video, codeBlock.
  // We add quick-launchers for the ones a user is likely to type.

  const codeItem: DefaultReactSuggestionItem = {
    title: 'Code',
    subtext: 'Code block with syntax',
    onItemClick: () => {
      const cursor = editor.getTextCursorPosition();
      editor.updateBlock(cursor.block, { type: 'codeBlock' as any });
    },
    aliases: ['code', 'snippet', '```'],
    group: 'Basic',
    icon: <span className="font-mono text-[12px]">{`</>`}</span>,
  };

  const quoteItem: DefaultReactSuggestionItem = {
    title: 'Quote',
    subtext: 'Block quote',
    onItemClick: () => {
      const cursor = editor.getTextCursorPosition();
      editor.updateBlock(cursor.block, { type: 'quote' as any });
    },
    aliases: ['quote', 'blockquote', '>'],
    group: 'Basic',
    icon: <span className="text-base">❝</span>,
  };

  const toggleItem: DefaultReactSuggestionItem = {
    title: 'Toggle list',
    subtext: 'Collapsible section',
    onItemClick: () => {
      const cursor = editor.getTextCursorPosition();
      try {
        editor.updateBlock(cursor.block, { type: 'toggleListItem' as any });
      } catch {
        editor.updateBlock(cursor.block, { type: 'bulletListItem' as any });
      }
    },
    aliases: ['toggle', 'collapse', 'expand'],
    group: 'Basic',
    icon: <span className="text-xs">▸</span>,
  };

  return [...defaults, aiItem, taskItem, calloutItem, codeItem, quoteItem, toggleItem, columnsItem, dividerItem];
}

// ── Custom slash menu component ─────────────────────────────────────────────
function LuminaSuggestionMenu({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
}: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; startIndex: number; items: DefaultReactSuggestionItem[] }>();
    items.forEach((item, idx) => {
      const name = item.group ?? 'Other';
      if (!map.has(name)) map.set(name, { name, startIndex: idx, items: [] });
      map.get(name)!.items.push(item);
    });
    return Array.from(map.values());
  }, [items]);

  return (
    <div
      className={cn(
        'z-50 w-64 max-h-72 overflow-y-auto overflow-x-hidden',
        'bg-popover border border-border/60 rounded-xl',
        'shadow-lg p-1',
        '[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]',
      )}
    >
      {loadingState === 'loading-initial' || loadingState === 'loading' ? (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">No matches</div>
      ) : (
        grouped.map((group) => (
          <div key={group.name} className="mb-0.5 last:mb-0">
            <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.name}
            </div>
            {group.items.map((item, localIdx) => {
              const globalIdx = group.startIndex + localIdx;
              const isSelected = globalIdx === selectedIndex;
              return (
                <button
                  key={`${group.name}-${item.title}`}
                  type="button"
                  onClick={() => onItemClick?.(item)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left',
                    'min-h-[34px] cursor-pointer transition-colors border-none bg-transparent',
                    isSelected ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted/60',
                  )}
                >
                  <div
                    className={cn(
                      'w-7 h-7 min-w-[28px] rounded-md shrink-0',
                      'bg-muted border border-border/40',
                      'flex items-center justify-center',
                      'text-foreground',
                    )}
                  >
                    {typeof item.icon === 'string'
                      ? <span className="text-xs font-bold">{item.icon}</span>
                      : item.icon
                        ? <span className="w-4 h-4 flex items-center justify-center text-foreground">{item.icon}</span>
                        : <span className="text-xs font-bold text-muted-foreground">{item.title.slice(0, 2).toUpperCase()}</span>
                    }
                  </div>
                  <span className="text-sm font-medium truncate flex-1 min-w-0 text-foreground">{item.title}</span>
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DocEditor — outer wrapper that delays mounting until the multi-column
// extension has loaded. This is required because `useCreateBlockNote` snapshots
// the schema on first mount; if we mounted with `baseSchema` while multiCol
// was still pending, the resulting editor would never know about `columnList`
// and `/columns` would silently no-op.
// ═════════════════════════════════════════════════════════════════════════════
export default function DocEditor(props: DocEditorProps) {
  const [multiCol, setMultiCol] = useState(_multiColCache);
  useEffect(() => {
    if (!multiCol) {
      multiColReady.then(setMultiCol);
    }
  }, [multiCol]);

  if (!multiCol) {
    return (
      <div className={cn('lumina-editor w-full relative px-2 lg:px-4 py-6', props.className)}>
        <div className="h-4 w-2/3 rounded bg-muted/30 animate-pulse mb-3" />
        <div className="h-3 w-1/2 rounded bg-muted/20 animate-pulse" />
      </div>
    );
  }

  return <DocEditorInner {...props} multiCol={multiCol} />;
}

interface DocEditorInnerProps extends DocEditorProps {
  multiCol: { schema: typeof baseSchema; dropCursor: unknown };
}

function DocEditorInner({ docId, initialContent, onChange, className, multiCol }: DocEditorInnerProps) {
  const { resolvedTheme } = useTheme();

  // Column picker state
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [columnPickerPos, setColumnPickerPos] = useState<{ top: number; left: number } | null>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  // ── AI prompt state ─────────────────────────────────────────────────────
  // anchorBlockId: captured at the moment the slash command fires so that if
  // the user keeps typing elsewhere before submit, we still anchor the
  // response where they asked.
  const [aiPrompt, setAIPrompt] = useState<{
    position: { top: number; left: number };
    anchorBlockId: string;
  } | null>(null);

  // Track previous blocks for deletion detection
  const previousBlocksRef = useRef<BlockLike[]>([]);

  const editor = useCreateBlockNote({
    schema: multiCol.schema as any,
    dropCursor: multiCol.dropCursor as any,
    // Enable Shiki syntax highlighting + language picker for code blocks.
    codeBlock: codeBlockOptions as any,
    initialContent: (initialContent && initialContent.length > 0)
      ? initialContent as any
      : undefined,
  });

  // Store initial blocks for deletion tracking
  useEffect(() => {
    previousBlocksRef.current = editor.document as any[];
  }, [editor]);

  // ── Drag-state tracking — sets data-dragging on wrapper so CSS can ghost
  //    the source block and highlight the drop indicator during DnD.
  useEffect(() => {
    const el = editorWrapperRef.current;
    if (!el) return;
    const onDragStart = () => el.setAttribute('data-dragging', 'true');
    const onDragEnd   = () => el.removeAttribute('data-dragging');
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('dragend',   onDragEnd);
    return () => {
      el.removeEventListener('dragstart', onDragStart);
      el.removeEventListener('dragend',   onDragEnd);
    };
  }, []);

  // ── Inline task creation ────────────────────────────────────────────────
  const createTask = useCallback(async (forDocId: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New task', status: 'todo', linkedDocId: forDocId }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.id ?? null;
    } catch {
      return null;
    }
  }, []);

  // ── TaskBlock checkbox toggle handler ──────────────────────────────────
  useEffect(() => {
    const handler = async (e: Event) => {
      const { blockId, taskId, checked } = (e as CustomEvent).detail;
      if (!taskId) return;

      // Update block checked state
      try {
        const blocks = editor.document as BlockLike[];
        const findBlock = (blks: BlockLike[]): BlockLike | null => {
          for (const b of blks) {
            if (b.id === blockId) return b;
            if (b.children?.length) {
              const found = findBlock(b.children);
              if (found) return found;
            }
          }
          return null;
        };
        const block = findBlock(blocks);
        if (block) {
          editor.updateBlock(block, { props: { ...block.props, checked } } as any);
        }
      } catch { /* best-effort */ }

      // Sync to task board
      try {
        await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: checked ? 'done' : 'todo' }),
        });
        useTaskBoardStore.getState().updateTask(taskId, { status: checked ? 'done' : 'todo' });
      } catch { /* best-effort */ }
    };

    window.addEventListener('lumina:taskblock-toggle', handler);
    return () => window.removeEventListener('lumina:taskblock-toggle', handler);
  }, [editor]);

  // ── Two-way sync: task board → doc ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { taskId, status } = (e as CustomEvent).detail;
      const blocks = editor.document as BlockLike[];

      const findTaskBlock = (blks: BlockLike[]): BlockLike | null => {
        for (const b of blks) {
          if (b.type === 'taskBlock' && b.props?.taskId === taskId) return b;
          if (b.children?.length) {
            const found = findTaskBlock(b.children);
            if (found) return found;
          }
        }
        return null;
      };

      const block = findTaskBlock(blocks);
      if (block) {
        try {
          editor.updateBlock(block, { props: { ...block.props, checked: status === 'done' } } as any);
        } catch { /* best-effort */ }
      }
    };

    window.addEventListener('lumina:task-updated', handler);
    return () => window.removeEventListener('lumina:task-updated', handler);
  }, [editor]);

  // ── onChange handler with deletion detection ────────────────────────────
  const handleChange = useCallback(() => {
    if (!onChange) return;
    const blocks = editor.document as Block[];
    const text = extractPlainText(blocks);
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    // Detect removed taskBlocks
    const currentTaskIds = new Set(
      (blocks as BlockLike[])
        .filter((b) => b.type === 'taskBlock' && b.props?.taskId)
        .map((b) => b.props!.taskId as string),
    );

    // Also check nested blocks (inside columns)
    const collectTaskIds = (blks: BlockLike[]) => {
      for (const b of blks) {
        if (b.type === 'taskBlock' && b.props?.taskId) currentTaskIds.add(b.props.taskId as string);
        if (b.children?.length) collectTaskIds(b.children);
      }
    };
    collectTaskIds(blocks as BlockLike[]);

    const prevTaskIds = new Set<string>();
    const collectPrevTaskIds = (blks: BlockLike[]) => {
      for (const b of blks) {
        if (b.type === 'taskBlock' && b.props?.taskId) prevTaskIds.add(b.props.taskId as string);
        if (b.children?.length) collectPrevTaskIds(b.children);
      }
    };
    collectPrevTaskIds(previousBlocksRef.current);

    // Archive removed tasks (soft-delete, best-effort)
    for (const taskId of prevTaskIds) {
      if (!currentTaskIds.has(taskId)) {
        fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'done' }),
        }).catch(() => {});
      }
    }

    previousBlocksRef.current = blocks as any[];
    onChange(blocks, text, wordCount);
  }, [editor, onChange]);

  // ── Column picker ─────────────────────────────────────────────────────
  const openColumnPicker = useCallback(() => {
    // Position near the cursor
    const wrapperRect = editorWrapperRef.current?.getBoundingClientRect();
    if (wrapperRect) {
      setColumnPickerPos({ top: wrapperRect.top + 40, left: wrapperRect.left + 20 });
    }
    setColumnPickerOpen(true);
  }, []);

  const insertColumns = useCallback(
    (ratio: ColumnRatio) => {
      const cursor = editor.getTextCursorPosition();
      editor.insertBlocks(
        [
          {
            type: 'columnList' as any,
            children: ratio.widths.map((width) => ({
              type: 'column' as any,
              props: { width } as any,
              children: [{ type: 'paragraph' as any }],
            })),
          } as any,
        ],
        cursor.block,
        'after',
      );
      setColumnPickerOpen(false);
    },
    [editor],
  );

  // Close column picker on click outside
  useEffect(() => {
    if (!columnPickerOpen) return;
    const handler = () => setColumnPickerOpen(false);
    const timer = setTimeout(() => document.addEventListener('click', handler), 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handler);
    };
  }, [columnPickerOpen]);

  // ── AI prompt: open at current cursor block, stream result ─────────────
  const openAIPrompt = useCallback(() => {
    const block = editor.getTextCursorPosition().block;
    const blockId = block.id;
    // Defer so BlockNote's slash-menu close/teardown finishes before we read
    // DOM rects. Without the defer, `[data-id=...]` often hasn't settled.
    setTimeout(() => {
      let top = 0;
      let left = 0;
      const el = document.querySelector(`[data-id="${blockId}"]`) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        top = rect.bottom + 4;
        left = rect.left;
      } else {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const rect = sel.getRangeAt(0).getBoundingClientRect();
          top = rect.bottom + 4;
          left = rect.left;
        }
      }
      setAIPrompt({ position: { top, left }, anchorBlockId: blockId });
    }, 30);
  }, [editor]);

  const cancelAIPrompt = useCallback(() => {
    setAIPrompt(null);
  }, []);

  const handleAISubmit = useCallback(
    async (prompt: string) => {
      const state = aiPrompt;
      setAIPrompt(null);
      if (!state) return;

      // Re-resolve the block at submit time — `getBlock` returns undefined if
      // the user deleted the anchor since opening the prompt.
      const anchor = editor.getBlock(state.anchorBlockId);
      if (!anchor) {
        toast.error('AI assist unavailable');
        return;
      }

      // Insert a placeholder right after the anchor that doubles as a
      // "thinking" indicator. We'll overwrite its content with streamed text
      // as chunks arrive; on error/abort we remove it so the editor never
      // ends up with a stale "Generating…" block.
      const placeholderBlocks = editor.insertBlocks(
        [
          {
            type: 'paragraph' as const,
            content: [
              { type: 'text' as const, text: '✨ Generating…', styles: { italic: true } },
            ],
          } as any,
        ],
        anchor,
        'after',
      );
      const placeholder = placeholderBlocks[0];
      if (!placeholder) {
        toast.error('AI assist unavailable');
        return;
      }

      const removePlaceholder = () => {
        try { editor.removeBlocks([placeholder]); } catch { /* best-effort */ }
      };

      // Pass current doc text as context so the model can ground its answer.
      const context = extractPlainText(editor.document as Block[]);

      let res: Response;
      try {
        res = await fetch('/api/docs/ai-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ prompt, context }),
        });
      } catch {
        removePlaceholder();
        toast.error('AI assist unavailable');
        return;
      }

      if (res.status === 429) {
        removePlaceholder();
        toast.error('AI assist limit reached. Try again in a minute.');
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

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          accumulated += chunk;
          try {
            editor.updateBlock(placeholder, {
              type: 'paragraph' as const,
              content: [{ type: 'text' as const, text: accumulated, styles: {} }],
            } as any);
          } catch {
            /* block may have been removed by the user — bail silently */
            return;
          }
        }
      } catch {
        if (!accumulated.trim()) removePlaceholder();
        toast.error('AI assist unavailable');
        return;
      }

      // Stream closed with no content: don't leave an empty placeholder.
      if (!accumulated.trim()) {
        removePlaceholder();
        toast.error('AI assist unavailable');
        return;
      }

      // Server awards a one-time `ai_docs` coin for the first AI usage.
      // Re-pull the balance so the UI reflects it without a page refresh.
      // Lazy-import to keep the editor bundle lean.
      void import('@/store/useCoinsStore').then(({ useCoinsStore }) =>
        useCoinsStore.getState().invalidateBalance(),
      );
    },
    [aiPrompt, editor],
  );

  const slashMenuCallbacks = useMemo(
    () => ({ openColumnPicker, createTask, openAIPrompt, docId }),
    [openColumnPicker, createTask, openAIPrompt, docId],
  );

  const slashMenuItems = useMemo(
    () => getLuminaSlashMenuItems(editor, slashMenuCallbacks),
    [editor, slashMenuCallbacks],
  );

  return (
    <div
      ref={editorWrapperRef}
      className={cn('lumina-editor w-full relative', className)}
      style={{ background: 'transparent' }}
    >
      <BlockNoteView
        editor={editor}
        theme={resolvedTheme}
        onChange={handleChange}
        slashMenu={false}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          suggestionMenuComponent={LuminaSuggestionMenu}
          getItems={async (query) => {
            const q = query.toLowerCase();
            return slashMenuItems.filter(
              (item) =>
                item.title.toLowerCase().includes(q) ||
                (item.aliases?.some((alias: string) => alias.toLowerCase().includes(q)) ?? false),
            );
          }}
        />
      </BlockNoteView>

      {/* AI prompt — floating inline input at cursor */}
      {aiPrompt && (
        <AIPromptInput
          position={aiPrompt.position}
          onSubmit={handleAISubmit}
          onCancel={cancelAIPrompt}
        />
      )}

      {/* Column ratio picker popover */}
      {columnPickerOpen && (
        <div
          className="fixed z-[100]"
          style={{
            top: columnPickerPos?.top ?? 100,
            left: columnPickerPos?.left ?? 100,
          }}
        >
          <ColumnRatioPicker
            onSelect={insertColumns}
            onClose={() => setColumnPickerOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
