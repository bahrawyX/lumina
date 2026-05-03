import { describe, it, expect } from 'vitest';
import { KeyboardShortcutsExtension } from '@/components/docs/extensions/KeyboardShortcutsExtension';

// Build a minimal mock that satisfies whatever the shortcut callbacks try
// to call on the editor. Each chain method returns an object exposing
// only the next call in the chain — enough to walk the no-op fluent API.
const mockEditor = {
  chain: () => ({
    focus: () => ({
      toggleUnderline: () => ({ run: () => true }),
      toggleHighlight: () => ({ run: () => true }),
      toggleCode: () => ({ run: () => true }),
      setNode: () => ({ run: () => true }),
      setHeading: () => ({ run: () => true }),
      setParagraph: () => ({ run: () => true }),
      toggleBlockquote: () => ({ run: () => true }),
    }),
  }),
};

const mockThis = { editor: mockEditor as unknown };

type ShortcutMap = Record<string, () => boolean>;

const getShortcuts = (): ShortcutMap => {
  const factory = KeyboardShortcutsExtension.config.addKeyboardShortcuts as
    | ((this: typeof mockThis) => ShortcutMap)
    | undefined;
  return factory?.call(mockThis) ?? {};
};

describe('KeyboardShortcutsExtension', () => {
  it('name is "keyboardShortcuts"', () => {
    expect(KeyboardShortcutsExtension.name).toBe('keyboardShortcuts');
  });

  it('defines Mod-u for underline', () => {
    expect(typeof getShortcuts()['Mod-u']).toBe('function');
  });

  it('Mod-u returns true (consumed)', () => {
    expect(getShortcuts()['Mod-u']?.()).toBe(true);
  });

  it('defines Mod-Shift-h for highlight', () => {
    expect(typeof getShortcuts()['Mod-Shift-h']).toBe('function');
  });

  it('defines Mod-Alt-1 for Heading 1', () => {
    expect(typeof getShortcuts()['Mod-Alt-1']).toBe('function');
  });

  it('defines Mod-Alt-2 for Heading 2', () => {
    expect(typeof getShortcuts()['Mod-Alt-2']).toBe('function');
  });

  it('defines Mod-Alt-3 for Heading 3', () => {
    expect(typeof getShortcuts()['Mod-Alt-3']).toBe('function');
  });

  it('defines Mod-Alt-0 for Paragraph', () => {
    expect(typeof getShortcuts()['Mod-Alt-0']).toBe('function');
  });

  it('defines Mod-Shift-b for Blockquote', () => {
    expect(typeof getShortcuts()['Mod-Shift-b']).toBe('function');
  });

  it('defines Mod-s for force-save', () => {
    expect(typeof getShortcuts()['Mod-s']).toBe('function');
  });

  it('Mod-s dispatches a lumina:force-save CustomEvent', () => {
    const dispatched: Event[] = [];
    const original = window.dispatchEvent.bind(window);
    window.dispatchEvent = ((e: Event) => {
      dispatched.push(e);
      return true;
    }) as typeof window.dispatchEvent;
    try {
      getShortcuts()['Mod-s']?.();
    } finally {
      window.dispatchEvent = original;
    }
    expect(dispatched.some((e) => e.type === 'lumina:force-save')).toBe(true);
  });
});
