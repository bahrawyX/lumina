import { Extension } from '@tiptap/core';

// Adds shortcuts that StarterKit doesn't ship by default (Cmd+U for
// Underline, Cmd+Shift+H for Highlight, heading variants, force-save).
// Using a dedicated extension keeps the bindings co-located and easy to
// audit, instead of scattering them across the editorProps.handleKeyDown.
export const KeyboardShortcutsExtension = Extension.create({
  name: 'keyboardShortcuts',

  addKeyboardShortcuts() {
    return {
      'Mod-u': () => this.editor.chain().focus().toggleUnderline().run(),
      'Mod-Shift-h': () => this.editor.chain().focus().toggleHighlight().run(),
      'Mod-Alt-1': () =>
        this.editor.chain().focus().setNode('heading', { level: 1 }).run(),
      'Mod-Alt-2': () =>
        this.editor.chain().focus().setNode('heading', { level: 2 }).run(),
      'Mod-Alt-3': () =>
        this.editor.chain().focus().setNode('heading', { level: 3 }).run(),
      'Mod-Alt-0': () => this.editor.chain().focus().setParagraph().run(),
      'Mod-Shift-b': () => this.editor.chain().focus().toggleBlockquote().run(),
      // Cmd+S → fire a custom event the editor listens for, then suppress the
      // browser's native Save dialog. The editor handler calls onUpdate
      // synchronously so the user gets immediate "Saving…" feedback.
      'Mod-s': () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('lumina:force-save'));
        }
        return true;
      },
    };
  },
});
