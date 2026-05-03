import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { SlashItem } from '@/components/docs/slashItems';

// Framer Motion's animation pipeline doesn't work in jsdom — stub to a
// passthrough so the tree renders synchronously.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, style, ...rest }: Record<string, unknown> & {
      children?: React.ReactNode;
      className?: string;
      style?: React.CSSProperties;
    }) => React.createElement('div', { className, style }, children as React.ReactNode),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

const mockItems: SlashItem[] = [
  {
    title: 'Heading 1',
    description: 'Large heading',
    group: 'Basic',
    aliases: ['h1'],
    icon: '<svg></svg>',
    execute: vi.fn(),
  },
  {
    title: 'Paragraph',
    description: 'Plain text',
    group: 'Basic',
    aliases: ['p'],
    icon: '<svg></svg>',
    execute: vi.fn(),
  },
  {
    title: 'AI Assist',
    description: 'Gemini AI',
    group: 'Lumina',
    aliases: ['ai'],
    icon: '<svg></svg>',
    execute: vi.fn(),
  },
];

const commandFn = vi.fn();

// SuggestionProps requires editor/range/etc., but SlashMenuList only reads
// items + command. Filling the rest with a real Editor would require
// mounting one (impossible in jsdom). Cast through unknown so TS doesn't
// complain about the missing fields.
const baseProps = {
  items: mockItems,
  command: commandFn,
  editor: {},
  query: '',
  text: '',
  decorationNode: null,
  clientRect: null,
  range: { from: 0, to: 1 },
} as unknown as Record<string, unknown>;

beforeEach(() => {
  commandFn.mockReset();
});

describe('SlashMenuList', () => {
  it('renders all item titles', async () => {
    const { SlashMenuList } = await import('@/components/docs/SlashMenuList');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(React.createElement(SlashMenuList as any, baseProps));
    expect(screen.getByText('Heading 1')).toBeInTheDocument();
    expect(screen.getByText('Paragraph')).toBeInTheDocument();
    expect(screen.getByText('AI Assist')).toBeInTheDocument();
  });

  it('renders all item descriptions', async () => {
    const { SlashMenuList } = await import('@/components/docs/SlashMenuList');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(React.createElement(SlashMenuList as any, baseProps));
    expect(screen.getByText('Large heading')).toBeInTheDocument();
    expect(screen.getByText('Gemini AI')).toBeInTheDocument();
  });

  it('renders group labels for represented groups', async () => {
    const { SlashMenuList } = await import('@/components/docs/SlashMenuList');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(React.createElement(SlashMenuList as any, baseProps));
    expect(screen.getByText('Basic')).toBeInTheDocument();
    expect(screen.getByText('Lumina')).toBeInTheDocument();
  });

  it('renders empty state when items array is empty', async () => {
    const { SlashMenuList } = await import('@/components/docs/SlashMenuList');
    const emptyProps = { ...baseProps, items: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(React.createElement(SlashMenuList as any, emptyProps));
    expect(screen.getByText(/no commands match/i)).toBeInTheDocument();
  });

  it('calls command with the item when an item is clicked', async () => {
    const { SlashMenuList } = await import('@/components/docs/SlashMenuList');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(React.createElement(SlashMenuList as any, baseProps));
    fireEvent.click(screen.getByText('Heading 1'));
    expect(commandFn).toHaveBeenCalledWith(mockItems[0]);
  });
});
