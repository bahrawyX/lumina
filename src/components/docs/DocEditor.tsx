'use client';

import React, { useCallback, useMemo } from 'react';
import {
  useCreateBlockNote,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  type DefaultReactSuggestionItem,
  type SuggestionMenuProps,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import type { Theme } from '@blocknote/mantine';
import { useTheme } from '@/components/theme-provider';
import '@blocknote/mantine/style.css';
import type { Block, BlockNoteEditor } from '@blocknote/core';
import { cn } from '@/lib/utils';

// Inline icons (project avoids lucide-react)
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

// ── Lumina theme bound to our HSL CSS variables ──────────────────────────────
// Wired to shadcn tokens so a dark/light toggle propagates instantly via CSS.
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

interface DocEditorProps {
  initialContent?: Block[] | null;
  onChange?: (blocks: Block[], plainText: string, wordCount: number) => void;
  className?: string;
}

function extractPlainText(blocks: Block[]): string {
  const parts: string[] = [];

  function walkContent(content: Block['content']) {
    if (!content) return;
    if (typeof content === 'string') {
      parts.push(content);
      return;
    }
    if (Array.isArray(content)) {
      for (const item of content) {
        if ('text' in item && typeof item.text === 'string') {
          parts.push(item.text);
        }
      }
    }
  }

  function walkBlocks(blks: Block[]) {
    for (const block of blks) {
      walkContent(block.content);
      if (block.children && block.children.length > 0) {
        walkBlocks(block.children);
      }
    }
  }

  walkBlocks(blocks);
  return parts.join(' ');
}

// ── Custom slash menu items for Lumina ───────────────────────────────────────
function getLuminaSlashMenuItems(
  editor: BlockNoteEditor<any, any, any>,
): DefaultReactSuggestionItem[] {
  const defaults = getDefaultReactSlashMenuItems(editor);

  const taskItem: DefaultReactSuggestionItem = {
    title: 'Task',
    subtext: 'Add a task linked to your board',
    onItemClick: () => {
      const cursor = editor.getTextCursorPosition();
      editor.updateBlock(cursor.block, {
        type: 'paragraph' as const,
        content: [{ type: 'text' as const, text: '☐ ', styles: {} }],
      });
    },
    aliases: ['task', 'todo', 'checkbox'],
    group: 'Lumina',
    icon: <TaskIcon />,
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

  // Native BlockNote audio block — empty url opens BlockNote's file panel
  // for upload/embed, identical UX to image/video blocks.
  const audioItem: DefaultReactSuggestionItem = {
    title: 'Audio',
    subtext: 'Embed an audio file',
    onItemClick: () => {
      const cursor = editor.getTextCursorPosition();
      editor.insertBlocks(
        [
          {
            type: 'audio' as any,
            props: { name: '', url: '', caption: '', showPreview: true },
          } as any,
        ],
        cursor.block,
        'after',
      );
    },
    aliases: ['audio', 'sound', 'mp3', 'music', 'voice'],
    group: 'Media',
    icon: <AudioIcon />,
  };

  return [...defaults, audioItem, taskItem, calloutItem, dividerItem];
}

// ── Custom slash menu component (Tailwind, no CSS specificity wars) ──────────
function LuminaSuggestionMenu({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
}: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  // Group items by their `group` field while preserving insertion order.
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; startIndex: number; items: DefaultReactSuggestionItem[] }>();
    items.forEach((item, idx) => {
      const name = item.group ?? 'Other';
      if (!map.has(name)) {
        map.set(name, { name, startIndex: idx, items: [] });
      }
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
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
          No matches
        </div>
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
                    isSelected
                      ? 'bg-muted text-foreground'
                      : 'text-foreground hover:bg-muted/60',
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
                  <span className="text-sm font-medium truncate flex-1 min-w-0">
                    {item.title}
                  </span>
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

export default function DocEditor({ initialContent, onChange, className }: DocEditorProps) {
  // Lumina has its own ThemeProvider — using the wrong hook (next-themes)
  // returned undefined and made BlockNote default to light. The theme object
  // above is bound to CSS vars, so it tracks dark/light automatically.
  const { resolvedTheme } = useTheme();
  void resolvedTheme;

  const editor = useCreateBlockNote({
    initialContent: (initialContent && initialContent.length > 0)
      ? initialContent as any
      : undefined,
  });

  const handleChange = useCallback(() => {
    if (!onChange) return;
    const blocks = editor.document as Block[];
    const text = extractPlainText(blocks);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    onChange(blocks, text, wordCount);
  }, [editor, onChange]);

  const slashMenuItems = useMemo(() => getLuminaSlashMenuItems(editor), [editor]);

  return (
    <div className={cn('lumina-editor', className)}>
      <BlockNoteView
        editor={editor}
        theme={luminaBlockNoteTheme}
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
    </div>
  );
}
