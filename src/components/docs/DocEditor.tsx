'use client';

import React, { useCallback, useMemo } from 'react';
import {
  useCreateBlockNote,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { useTheme } from 'next-themes';
import '@blocknote/mantine/style.css';
import type { Block, BlockNoteEditor } from '@blocknote/core';
import { cn } from '@/lib/utils';

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
  const { resolvedTheme } = useTheme();

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
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
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
