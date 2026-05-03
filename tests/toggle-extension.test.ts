import { describe, it, expect } from 'vitest';
import { ToggleExtension } from '@/components/docs/extensions/ToggleExtension';

type AttrSpec = {
  default?: unknown;
  parseHTML?: (el: Element) => unknown;
  renderHTML?: (attrs: Record<string, unknown>) => Record<string, unknown>;
};

describe('ToggleExtension', () => {
  const config = ToggleExtension.config as unknown as {
    group?: string;
    content?: string;
    defining?: boolean;
    addAttributes?: () => Record<string, AttrSpec>;
    parseHTML?: () => Array<{ tag: string }>;
  };
  const attrs = config.addAttributes?.() ?? {};

  it('name is "toggle"', () => {
    expect(ToggleExtension.name).toBe('toggle');
  });

  it('group is "block"', () => {
    expect(config.group).toBe('block');
  });

  it('content is "block+"', () => {
    expect(config.content).toBe('block+');
  });

  it('defining is true — Enter at end of toggle exits it', () => {
    expect(config.defining).toBe(true);
  });

  it('isOpen defaults to true', () => {
    expect(attrs.isOpen?.default).toBe(true);
  });

  it('parseHTML reads data-open="false" as false', () => {
    const el = document.createElement('details');
    el.setAttribute('data-open', 'false');
    expect(attrs.isOpen?.parseHTML?.(el)).toBe(false);
  });

  it('parseHTML reads data-open="true" as true', () => {
    const el = document.createElement('details');
    el.setAttribute('data-open', 'true');
    expect(attrs.isOpen?.parseHTML?.(el)).toBe(true);
  });

  it('parseHTML treats missing data-open attribute as true (default open)', () => {
    const el = document.createElement('details');
    expect(attrs.isOpen?.parseHTML?.(el)).toBe(true);
  });

  it('renderHTML produces data-open string', () => {
    expect(attrs.isOpen?.renderHTML?.({ isOpen: true })).toEqual({
      'data-open': 'true',
    });
    expect(attrs.isOpen?.renderHTML?.({ isOpen: false })).toEqual({
      'data-open': 'false',
    });
  });

  it('parseHTML matches details[data-type="toggle"]', () => {
    const rules = config.parseHTML?.() ?? [];
    expect(rules[0]?.tag).toBe('details[data-type="toggle"]');
  });
});
