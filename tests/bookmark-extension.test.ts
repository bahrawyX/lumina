import { describe, it, expect } from 'vitest';
import { BookmarkExtension } from '@/components/docs/extensions/BookmarkExtension';

type AttrSpec = {
  default?: unknown;
  parseHTML?: (el: Element) => unknown;
  renderHTML?: (attrs: Record<string, unknown>) => Record<string, unknown>;
};

describe('BookmarkExtension', () => {
  const config = BookmarkExtension.config as unknown as {
    group?: string;
    atom?: boolean;
    draggable?: boolean;
    addAttributes?: () => Record<string, AttrSpec>;
    parseHTML?: () => Array<{ tag: string }>;
  };
  const attrs = config.addAttributes?.() ?? {};

  it('name is "bookmark"', () => {
    expect(BookmarkExtension.name).toBe('bookmark');
  });

  it('atom is true', () => {
    expect(config.atom).toBe(true);
  });

  it('draggable is true', () => {
    expect(config.draggable).toBe(true);
  });

  it('group is "block"', () => {
    expect(config.group).toBe('block');
  });

  it('url attribute defaults to empty string', () => {
    expect(attrs.url?.default).toBe('');
  });

  it('title attribute defaults to empty string', () => {
    expect(attrs.title?.default).toBe('');
  });

  it('url parseHTML reads data-url attribute', () => {
    const el = document.createElement('div');
    el.setAttribute('data-url', 'https://example.com');
    expect(attrs.url?.parseHTML?.(el)).toBe('https://example.com');
  });

  it('url parseHTML returns empty string when attribute is missing', () => {
    const el = document.createElement('div');
    expect(attrs.url?.parseHTML?.(el)).toBe('');
  });

  it('url renderHTML produces data-url attribute', () => {
    expect(attrs.url?.renderHTML?.({ url: 'https://example.com' })).toEqual({
      'data-url': 'https://example.com',
    });
  });

  it('parseHTML matches div[data-type="bookmark"]', () => {
    const rules = config.parseHTML?.() ?? [];
    expect(rules[0]?.tag).toBe('div[data-type="bookmark"]');
  });
});
