import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ToggleNodeView } from './ToggleNodeView';

// Custom collapsible block — no free Tiptap extension exists for this. The
// Pro "details" extension is paid; we build from scratch instead. Open/closed
// state is a node attribute (isOpen) so it persists with the doc, while the
// React NodeView holds the rendering logic for the chevron + content area.
export const ToggleExtension = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'block+',
  // defining: true — Enter at the end of the toggle's last block exits the
  // toggle (creating a new block AFTER it), instead of nesting deeper. The
  // user uses Backspace at the start of an empty inner block to escape early.
  defining: true,

  addAttributes() {
    return {
      isOpen: {
        default: true,
        parseHTML: (el) => el.getAttribute('data-open') !== 'false',
        renderHTML: (attrs) => ({ 'data-open': String(attrs.isOpen) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'details[data-type="toggle"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'details',
      mergeAttributes(HTMLAttributes, { 'data-type': 'toggle' }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleNodeView);
  },
});
