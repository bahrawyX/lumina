'use client';

import React, { useCallback, useMemo } from 'react';
import {
  useCreateBlockNote,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import type { Theme } from '@blocknote/mantine';
import { useTheme } from '@/components/theme-provider';
import '@blocknote/mantine/style.css';
import type { Block, BlockNoteEditor } from '@blocknote/core';
import { cn } from '@/lib/utils';

// ── Lumina theme bound to our HSL CSS variables ──────────────────────────────
// Wired to shadcn tokens so a dark/light toggle propagates instantly.
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

// Custom slash menu items for Lumina
function getLuminaSlashMenuItems(editor: BlockNoteEditor<any, any, any>) {
  const defaults = getDefaultReactSlashMenuItems(editor);

  const taskItem = {
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
    badge: '☐',
  };

  const calloutItem = {
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
    badge: '💡',
  };

  const dividerItem = {
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
    badge: '—',
  };

  return [...defaults, taskItem, calloutItem, dividerItem];
}

export default function DocEditor({ initialContent, onChange, className }: DocEditorProps) {
  // Reads from Lumina's own ThemeProvider — `next-themes` is not installed in
  // the tree, so the previous import always returned undefined and BlockNote
  // silently fell back to its light palette (white menus in dark mode).
  const { resolvedTheme } = useTheme();
  void resolvedTheme; // theme object below uses CSS vars, so it auto-tracks

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
          getItems={async (query) =>
            slashMenuItems.filter(
              (item) =>
                item.title.toLowerCase().includes(query.toLowerCase()) ||
                (item.aliases?.some((alias: string) => alias.toLowerCase().includes(query.toLowerCase())) ?? false)
            )
          }
        />
      </BlockNoteView>
    </div>
  );
}
