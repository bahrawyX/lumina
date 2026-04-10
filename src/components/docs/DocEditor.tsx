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
import { BlockNoteView } from '@blocknote/mantine';
import type { Theme } from '@blocknote/mantine';
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from '@blocknote/core';
import {
  locales as multiColumnLocales,
  multiColumnDropCursor,
  withMultiColumn,
} from '@blocknote/xl-multi-column';
import { useTheme } from '@/components/theme-provider';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import '@blocknote/mantine/style.css';
import type { Block, BlockNoteEditor } from '@blocknote/core';
import { cn } from '@/lib/utils';
import ColumnRatioPicker, { type ColumnRatio } from './ColumnRatioPicker';

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
const AudioIcon = () => (
  <svg {...iconProps}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);
const ColumnsIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="3" width="7" height="18" rx="1" />
    <rect x="14" y="3" width="7" height="18" rx="1" />
  </svg>
);

// ── Custom TaskBlock with taskId stored in block props ──────────────────────
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

      return (
        <div className="flex items-start gap-2 py-0.5 w-full">
          <input
            type="checkbox"
            checked={checked}
            onChange={async (e) => {
              const newChecked = e.target.checked;
              window.dispatchEvent(
                new CustomEvent('lumina:taskblock-toggle', {
                  detail: { blockId: block.id, taskId, checked: newChecked },
                }),
              );
            }}
            className="mt-1 w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
          />
          <div
            ref={contentRef}
            className={cn(
              'text-sm text-foreground outline-none flex-1 min-w-0',
              checked && 'line-through text-muted-foreground',
            )}
          />
        </div>
      );
    },
  },
);
const TaskBlock = TaskBlockFactory();

// ── Multi-column + TaskBlock schema ─────────────────────────────────────────
const schema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      taskBlock: TaskBlock,
    },
    inlineContentSpecs: defaultInlineContentSpecs,
    styleSpecs: defaultStyleSpecs,
  }),
);

type LuminaEditor = typeof schema.BlockNoteEditor;

// ── Lumina theme bound to our HSL CSS variables ─────────────────────────────
const luminaBlockNoteTheme = {
  colors: {
    editor: {
      text: 'hsl(var(--foreground))',
      background: 'transparent',
    },
    menu: {
      text: 'hsl(var(--popover-foreground))',
      background: 'hsl(var(--popover))',
    },
    tooltip: {
      text: 'hsl(var(--popover-foreground))',
      background: 'hsl(var(--popover))',
    },
    hovered: {
      text: 'hsl(var(--foreground))',
      background: 'hsl(var(--muted))',
    },
    selected: {
      text: 'hsl(var(--foreground))',
      background: 'hsl(var(--primary) / 0.18)',
    },
    disabled: {
      text: 'hsl(var(--muted-foreground))',
      background: 'transparent',
    },
    shadow: 'rgba(0, 0, 0, 0.25)',
    border: 'hsl(var(--border))',
    sideMenu: 'hsl(var(--muted-foreground))',
    highlights: {
      gray:   { text: '#aaaaaa', background: 'hsl(var(--muted))' },
      brown:  { text: '#b5856a', background: '#3b2a23' },
      red:    { text: '#e57373', background: '#3a1d1d' },
      orange: { text: '#fb923c', background: '#3a2515' },
      yellow: { text: '#fbbf24', background: '#3a2c10' },
      green:  { text: '#4ade80', background: '#163024' },
      blue:   { text: '#60a5fa', background: '#162339' },
      purple: { text: '#c084fc', background: '#241439' },
      pink:   { text: '#f472b6', background: '#3a1530' },
    },
  },
  borderRadius: 8,
  fontFamily: 'inherit',
} satisfies Theme;

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
    docId: string;
  },
): DefaultReactSuggestionItem[] {
  const defaults = getDefaultReactSlashMenuItems(editor);

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
    subtext: 'Highlight important information',
    onItemClick: () => {
      const cursor = editor.getTextCursorPosition();
      editor.updateBlock(cursor.block, {
        type: 'paragraph' as const,
        content: [{ type: 'text' as const, text: '💡 ', styles: {} }],
      });
    },
    aliases: ['callout', 'info', 'note', 'tip'],
    group: 'Lumina',
    icon: <CalloutIcon />,
  };

  const dividerItem: DefaultReactSuggestionItem = {
    title: 'Divider',
    subtext: 'Horizontal line separator',
    onItemClick: () => {
      const cursor = editor.getTextCursorPosition();
      editor.updateBlock(cursor.block, {
        type: 'paragraph' as const,
        content: [{ type: 'text' as const, text: '───────────────────────────', styles: {} }],
      });
    },
    aliases: ['divider', 'hr', 'line', 'separator'],
    group: 'Lumina',
    icon: <DividerIcon />,
  };

  const audioItem: DefaultReactSuggestionItem = {
    title: 'Audio',
    subtext: 'Embed an audio file',
    onItemClick: () => {
      const cursor = editor.getTextCursorPosition();
      editor.insertBlocks(
        [{ type: 'audio' as any, props: { name: '', url: '', caption: '', showPreview: true } } as any],
        cursor.block,
        'after',
      );
    },
    aliases: ['audio', 'sound', 'mp3', 'music', 'voice'],
    group: 'Media',
    icon: <AudioIcon />,
  };

  return [...defaults, audioItem, columnsItem, taskItem, calloutItem, dividerItem];
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
        'bg-popover/95 backdrop-blur-md border border-border/60 rounded-xl',
        'shadow-lg shadow-black/30 p-1',
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
                    'min-h-[34px] cursor-pointer transition-colors',
                    isSelected ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted/60',
                  )}
                >
                  <div
                    className={cn(
                      'w-7 h-7 min-w-[28px] rounded-md',
                      'bg-muted border border-border/40',
                      'flex items-center justify-center',
                      'text-xs font-semibold text-foreground',
                    )}
                  >
                    {item.icon ?? item.title.charAt(0)}
                  </div>
                  <span className="text-sm font-medium truncate flex-1 min-w-0">{item.title}</span>
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
// DocEditor — the main component
// ═════════════════════════════════════════════════════════════════════════════
export default function DocEditor({ docId, initialContent, onChange, className }: DocEditorProps) {
  const { resolvedTheme } = useTheme();
  void resolvedTheme;

  // Column picker state
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [columnPickerPos, setColumnPickerPos] = useState<{ top: number; left: number } | null>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  // Track previous blocks for deletion detection
  const previousBlocksRef = useRef<any[]>([]);

  const editor = useCreateBlockNote({
    schema: schema as any,
    dropCursor: multiColumnDropCursor as any,
    initialContent: (initialContent && initialContent.length > 0)
      ? initialContent as any
      : undefined,
  });

  // Store initial blocks for deletion tracking
  useEffect(() => {
    previousBlocksRef.current = editor.document as any[];
  }, [editor]);

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
        const blocks = editor.document as any[];
        const findBlock = (blks: any[]): any => {
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
      const blocks = editor.document as any[];

      const findTaskBlock = (blks: any[]): any => {
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
      (blocks as any[])
        .filter((b: any) => b.type === 'taskBlock' && b.props?.taskId)
        .map((b: any) => b.props.taskId),
    );

    // Also check nested blocks (inside columns)
    const collectTaskIds = (blks: any[]) => {
      for (const b of blks) {
        if (b.type === 'taskBlock' && b.props?.taskId) currentTaskIds.add(b.props.taskId);
        if (b.children?.length) collectTaskIds(b.children);
      }
    };
    collectTaskIds(blocks as any[]);

    const prevTaskIds = new Set<string>();
    const collectPrevTaskIds = (blks: any[]) => {
      for (const b of blks) {
        if (b.type === 'taskBlock' && b.props?.taskId) prevTaskIds.add(b.props.taskId);
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

  const slashMenuCallbacks = useMemo(
    () => ({ openColumnPicker, createTask, docId }),
    [openColumnPicker, createTask, docId],
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
        theme={luminaBlockNoteTheme}
        onChange={handleChange}
        slashMenu={false}
        style={{ background: 'transparent', backgroundColor: 'transparent' }}
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
