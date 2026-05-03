import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { BookmarkNodeView } from './BookmarkNodeView';

// Bookmark — a styled URL card distinct from inline links. atom: true so
// the cursor doesn't enter the card; users interact with it as a widget.
// Phase 6 ships without OG-metadata unfurling — the title attr is empty
// and we just display the URL. Future work can fetch and persist metadata.
export const BookmarkExtension = Node.create({
  name: 'bookmark',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-url') ?? '',
        renderHTML: (attrs) => ({ 'data-url': attrs.url }),
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title') ?? '',
        renderHTML: (attrs) => ({ 'data-title': attrs.title }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="bookmark"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'bookmark' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookmarkNodeView);
  },
});
