'use client';

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { motion } from 'framer-motion';
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from '@tiptap/suggestion';
import { cn } from '@/lib/utils';
import type { SlashItem } from './slashItems';

export interface SlashMenuListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const GROUP_ORDER = ['Basic', 'Media', 'Lumina'] as const;

export const SlashMenuList = forwardRef<
  SlashMenuListHandle,
  SuggestionProps<SlashItem>
>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const items = props.items ?? [];

  // Reset selection when filter changes (e.g. user types more characters).
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Keep the active item visible during keyboard navigation.
  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({
      block: 'nearest',
    });
  }, [selectedIndex]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (!item) return;
    props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps): boolean => {
      if (items.length === 0) return false;
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'w-64 rounded-xl border border-border/60 bg-popover',
          'px-3 py-4 shadow-lg shadow-black/10',
        )}
      >
        <p className="text-center text-sm italic text-muted-foreground">
          No commands match
        </p>
      </motion.div>
    );
  }

  // Build a flat list of (index, item, isFirstInGroup) so the rendered order
  // matches the global selectedIndex used by keyboard navigation.
  let runningIndex = 0;
  const grouped = GROUP_ORDER.map((group) => {
    const groupItems = items.filter((item) => item.group === group);
    if (groupItems.length === 0) return null;
    const startIndex = runningIndex;
    runningIndex += groupItems.length;
    return { group, groupItems, startIndex };
  }).filter(Boolean) as Array<{
    group: (typeof GROUP_ORDER)[number];
    groupItems: SlashItem[];
    startIndex: number;
  }>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'w-64 max-h-80 overflow-y-auto rounded-xl border border-border/60',
        'bg-popover py-1.5 shadow-lg shadow-black/10',
        '[&::-webkit-scrollbar]:w-1',
        '[&::-webkit-scrollbar-track]:bg-transparent',
        '[&::-webkit-scrollbar-thumb]:rounded-full',
        '[&::-webkit-scrollbar-thumb]:bg-border',
      )}
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'hsl(var(--border)) transparent',
      }}
    >
      {grouped.map(({ group, groupItems, startIndex }) => (
        <div key={group}>
          <p className="px-3 pb-0.5 pt-2 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
            {group}
          </p>
          {groupItems.map((item, localIdx) => {
            const itemIndex = startIndex + localIdx;
            const isSelected = itemIndex === selectedIndex;
            return (
              <button
                key={item.title}
                type="button"
                ref={(el) => {
                  itemRefs.current[itemIndex] = el;
                }}
                onMouseDown={(e) => {
                  // Prevent the editor from losing focus before we run command()
                  e.preventDefault();
                }}
                onClick={() => selectItem(itemIndex)}
                onMouseEnter={() => setSelectedIndex(itemIndex)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-1.5 text-left',
                  'transition-colors duration-75',
                  isSelected
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                <div
                  className={cn(
                    'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md',
                    isSelected ? 'bg-accent-foreground/10' : 'bg-muted',
                  )}
                  dangerouslySetInnerHTML={{ __html: item.icon }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-none">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </motion.div>
  );
});

SlashMenuList.displayName = 'SlashMenuList';
