import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Adds a CSS class to whichever top-level block currently contains the
// cursor. Uses ProseMirror Decorations rather than DOM mutation in a React
// useEffect because PM redraws the DOM on every transaction — class names
// added directly via element.classList.add get clobbered. Decorations are
// PM-aware: they survive redraws and update in lockstep with the selection.
//
// Pairs with .lumina-editor.focus-mode-active CSS in globals.css to dim
// non-focused blocks.
export const FocusBlockExtension = Extension.create({
  name: 'focusBlock',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('focusBlock'),
        props: {
          decorations(state) {
            const $from = state.selection.$from;
            // depth 0 = the doc itself; we need depth >= 1 to be inside a
            // block. Defensively bail on degenerate selections.
            if ($from.depth < 1) return DecorationSet.empty;
            const blockStart = $from.before(1);
            const blockEnd = $from.after(1);
            return DecorationSet.create(state.doc, [
              Decoration.node(blockStart, blockEnd, {
                class: 'is-focused-block',
              }),
            ]);
          },
        },
      }),
    ];
  },
});
