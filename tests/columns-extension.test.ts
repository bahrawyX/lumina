import { describe, it, expect } from 'vitest';
import { ColumnsExtension } from '@/components/docs/extensions/ColumnsExtension';
import { ColumnExtension } from '@/components/docs/extensions/ColumnExtension';

type AttrSpec = {
  default?: unknown;
  parseHTML?: (el: Element) => unknown;
  renderHTML?: (attrs: Record<string, unknown>) => Record<string, unknown>;
};

describe('ColumnExtension', () => {
  const config = ColumnExtension.config as {
    group?: string;
    content?: string;
    isolating?: boolean;
    addAttributes?: () => Record<string, AttrSpec>;
  };

  it('name is "column"', () => {
    expect(ColumnExtension.name).toBe('column');
  });

  it('group is "column"', () => {
    expect(config.group).toBe('column');
  });

  it('content is "block+"', () => {
    expect(config.content).toBe('block+');
  });

  it('isolating is true (cursor stays inside the column)', () => {
    expect(config.isolating).toBe(true);
  });

  it('ratio attribute defaults to 1', () => {
    const attrs = config.addAttributes?.() ?? {};
    expect(attrs.ratio?.default).toBe(1);
  });

  it('ratio parseHTML reads data-ratio as a number', () => {
    const attrs = config.addAttributes?.() ?? {};
    const el = document.createElement('div');
    el.setAttribute('data-ratio', '2');
    expect(attrs.ratio?.parseHTML?.(el)).toBe(2);
  });
});

describe('ColumnsExtension', () => {
  const config = ColumnsExtension.config as {
    group?: string;
    content?: string;
    addCommands?: () => Record<string, (...args: unknown[]) => unknown>;
  };

  it('name is "columns"', () => {
    expect(ColumnsExtension.name).toBe('columns');
  });

  it('group is "block"', () => {
    expect(config.group).toBe('block');
  });

  it('content is "column+" — Column must be registered before Columns', () => {
    expect(config.content).toBe('column+');
  });

  it('defines insertColumns command', () => {
    const cmds = config.addCommands?.() ?? {};
    expect(typeof cmds.insertColumns).toBe('function');
  });

  it('insertColumns returns a command function', () => {
    const cmds = config.addCommands?.() ?? {};
    const result = cmds.insertColumns?.([1, 1]);
    expect(typeof result).toBe('function');
  });
});
