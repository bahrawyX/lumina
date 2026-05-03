import { Node, mergeAttributes } from '@tiptap/core';

// Container node for a multi-column layout. Holds one or more column nodes
// (the ColumnExtension defined alongside this file). Renders as a flex row
// via CSS in globals.css.
export const ColumnsExtension = Node.create({
  name: 'columns',

  group: 'block',

  // 'column+' = one or more nodes from the 'column' group. ProseMirror
  // resolves this content spec at extension-registration time, so
  // ColumnExtension MUST be registered BEFORE this extension or schema
  // construction will fail with an unknown content node error.
  content: 'column+',

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'columns' }),
      0,
    ];
  },

  addCommands() {
    return {
      // editor.chain().focus().insertColumns([1, 1]).run() → 50/50 split
      // editor.chain().focus().insertColumns([2, 1]).run() → 67/33 split
      // editor.chain().focus().insertColumns([1, 1, 1]).run() → 3 equal cols
      insertColumns:
        (ratios: number[]) =>
        ({ commands }) => {
          if (!Array.isArray(ratios) || ratios.length < 2) return false;
          return commands.insertContent({
            type: 'columns',
            content: ratios.map((ratio) => ({
              type: 'column',
              attrs: { ratio },
              content: [{ type: 'paragraph' }],
            })),
          });
        },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      insertColumns: (ratios: number[]) => ReturnType;
    };
  }
}
