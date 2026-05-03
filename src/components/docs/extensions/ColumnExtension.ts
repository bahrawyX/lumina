import { Node, mergeAttributes } from '@tiptap/core';

// One column inside a `columns` container. Holds any block-level content
// (paragraphs, headings, lists, taskBlocks, etc.). Width is controlled by
// flex-grow via the inline `flex` style — kept inline so HTML export is
// self-contained without needing the editor's CSS.
export const ColumnExtension = Node.create({
  name: 'column',

  // Custom group name referenced by ColumnsExtension's content spec. Not
  // 'block' — this prevents columns from being created at the document root.
  group: 'column',

  // Each column accepts the same content as the document body.
  content: 'block+',

  // The cursor stays inside this column's content; it doesn't escape into
  // the surrounding columns container during typing.
  isolating: true,

  addAttributes() {
    return {
      ratio: {
        default: 1,
        parseHTML: (el) => Number(el.getAttribute('data-ratio') ?? 1),
        renderHTML: (attrs) => ({ 'data-ratio': attrs.ratio }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const ratio = HTMLAttributes['data-ratio'] ?? 1;
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'column',
        style: `flex: ${ratio}; min-width: 0;`,
      }),
      0,
    ];
  },
});
