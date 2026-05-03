import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TaskBlockNodeView } from './TaskBlockNodeView';

// Tiptap Node schema for a Lumina task linked to the task board.
// The visible card is rendered by TaskBlockNodeView (React); ProseMirror
// treats this node as a single opaque widget (atom: true) — the cursor
// goes around it, not through it, like an image.
export const TaskBlockExtension = Node.create({
  name: 'taskBlock',

  group: 'block',

  // atom: true — the cursor cannot enter this node. All interaction happens
  // through the React NodeView; ProseMirror sees one indivisible unit.
  atom: true,

  // Lets DragHandle pick this node up and reorder it among other blocks.
  draggable: true,

  addAttributes() {
    return {
      taskId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-task-id'),
        renderHTML: (attributes) => ({
          'data-task-id': attributes.taskId,
        }),
      },
      checked: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute('data-checked') === 'true',
        renderHTML: (attributes) => ({
          'data-checked': String(attributes.checked),
        }),
      },
      taskTitle: {
        default: 'Untitled task',
        parseHTML: (element) =>
          element.getAttribute('data-task-title') ?? 'Untitled task',
        renderHTML: (attributes) => ({
          'data-task-title': attributes.taskTitle,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="task-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'task-block' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskBlockNodeView);
  },
});
