import { describe, it, expect } from 'vitest';

// Verify every Tiptap package the editor depends on is installed and
// exports what the editor expects. Catches Phase 1 regressions
// (accidental uninstall, version mismatch, missing peer dep).
describe('Tiptap packages — installation check', () => {
  it('@tiptap/react exports useEditor and EditorContent', async () => {
    const { useEditor, EditorContent } = await import('@tiptap/react');
    expect(typeof useEditor).toBe('function');
    // EditorContent is a forwardRef — its type is 'object' not 'function'
    expect(EditorContent).toBeDefined();
  });

  it('@tiptap/starter-kit exports a default extension', async () => {
    const { default: StarterKit } = await import('@tiptap/starter-kit');
    expect(StarterKit).toBeDefined();
  });

  it('@tiptap/extension-placeholder exports Placeholder', async () => {
    const { Placeholder } = await import('@tiptap/extension-placeholder');
    expect(Placeholder).toBeDefined();
  });

  it('@tiptap/extension-task-list exports TaskList', async () => {
    const { TaskList } = await import('@tiptap/extension-task-list');
    expect(TaskList).toBeDefined();
  });

  it('@tiptap/extension-drag-handle-react exports a component', async () => {
    const mod = await import('@tiptap/extension-drag-handle-react');
    const exported =
      (mod as { DragHandle?: unknown }).DragHandle ?? mod.default;
    expect(exported).toBeDefined();
  });

  it('@tiptap/suggestion exports a default function', async () => {
    const { default: Suggestion } = await import('@tiptap/suggestion');
    expect(typeof Suggestion).toBe('function');
  });

  it('lowlight exports createLowlight and common', async () => {
    const { createLowlight, common } = await import('lowlight');
    expect(typeof createLowlight).toBe('function');
    expect(typeof common).toBe('object');
  });

  it('tippy.js exports a default function', async () => {
    const { default: tippy } = await import('tippy.js');
    expect(typeof tippy).toBe('function');
  });

  it('@tiptap/extension-table exports Table', async () => {
    const { Table } = await import('@tiptap/extension-table');
    expect(Table).toBeDefined();
  });

  it('@tiptap/extension-mathematics exports Mathematics', async () => {
    const { Mathematics } = await import('@tiptap/extension-mathematics');
    expect(Mathematics).toBeDefined();
  });

  it('katex is importable', async () => {
    const katex = await import('katex');
    expect(katex).toBeDefined();
  });

  it('@blocknote packages are NOT in package.json', async () => {
    // import('@blocknote/...') would trip vitest's static analyzer; instead
    // we read package.json and confirm zero @blocknote entries. Equivalent
    // assertion (the package can't be imported if it isn't a dependency)
    // and avoids the bundler complaining about unresolvable specifiers.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const blocknoteEntries = Object.keys(allDeps).filter((d) => d.startsWith('@blocknote/'));
    expect(blocknoteEntries).toEqual([]);
  });
});
