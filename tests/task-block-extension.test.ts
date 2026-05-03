import { describe, it, expect } from 'vitest';
import { TaskBlockExtension } from '@/components/docs/extensions/TaskBlockExtension';

// Tiptap exposes the runtime config via `.config` after Node.create();
// `.options` is what `addOptions()` returns. Walking config directly is
// the only way to test schema invariants without mounting an editor.
type Cfg = typeof TaskBlockExtension.config & {
  atom?: boolean;
  draggable?: boolean;
  addAttributes?: () => Record<string, {
    default?: unknown;
    parseHTML?: (el: Element) => unknown;
    renderHTML?: (attrs: Record<string, unknown>) => Record<string, unknown>;
  }>;
  parseHTML?: () => Array<{ tag: string }>;
};

describe('TaskBlockExtension schema', () => {
  const config = TaskBlockExtension.config as Cfg;

  it('name is "taskBlock"', () => {
    expect(TaskBlockExtension.name).toBe('taskBlock');
  });

  it('atom is true', () => {
    expect(config.atom).toBe(true);
  });

  it('draggable is true', () => {
    expect(config.draggable).toBe(true);
  });

  describe('attributes', () => {
    const attrs = config.addAttributes?.() ?? {};

    it('taskId defaults to null', () => {
      expect(attrs.taskId?.default).toBeNull();
    });

    it('checked defaults to false', () => {
      expect(attrs.checked?.default).toBe(false);
    });

    it('taskTitle defaults to "Untitled task"', () => {
      expect(attrs.taskTitle?.default).toBe('Untitled task');
    });

    it('checked parseHTML reads "true" correctly', () => {
      const el = document.createElement('div');
      el.setAttribute('data-checked', 'true');
      expect(attrs.checked?.parseHTML?.(el)).toBe(true);
    });

    it('checked parseHTML reads "false" correctly', () => {
      const el = document.createElement('div');
      el.setAttribute('data-checked', 'false');
      expect(attrs.checked?.parseHTML?.(el)).toBe(false);
    });

    it('checked renderHTML produces correct data attribute', () => {
      expect(attrs.checked?.renderHTML?.({ checked: true })).toEqual({
        'data-checked': 'true',
      });
      expect(attrs.checked?.renderHTML?.({ checked: false })).toEqual({
        'data-checked': 'false',
      });
    });

    it('taskTitle parseHTML reads data-task-title attribute', () => {
      const el = document.createElement('div');
      el.setAttribute('data-task-title', 'My task');
      expect(attrs.taskTitle?.parseHTML?.(el)).toBe('My task');
    });

    it('taskId renderHTML produces data-task-id attribute', () => {
      expect(attrs.taskId?.renderHTML?.({ taskId: 'abc-123' })).toEqual({
        'data-task-id': 'abc-123',
      });
    });
  });

  describe('parseHTML rule', () => {
    const rules = config.parseHTML?.() ?? [];

    it('matches div[data-type="task-block"]', () => {
      expect(rules[0]?.tag).toBe('div[data-type="task-block"]');
    });
  });
});
