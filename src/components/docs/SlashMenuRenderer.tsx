'use client';

import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from '@tiptap/suggestion';
import { SlashMenuList, type SlashMenuListHandle } from './SlashMenuList';
import type { SlashItem } from './slashItems';

// Builds the four-method object @tiptap/suggestion expects from `render()`.
// tippy.js owns positioning; ReactRenderer owns the React tree mounted into
// tippy's content node. Both are recreated on every onStart and torn down
// in onExit.
export function createSlashMenuRenderer() {
  let component: ReactRenderer<SlashMenuListHandle, SuggestionProps<SlashItem>>;
  let popup: TippyInstance[];

  return {
    onStart(props: SuggestionProps<SlashItem>) {
      component = new ReactRenderer(SlashMenuList, {
        props,
        editor: props.editor,
      });

      if (!props.clientRect) return;

      popup = tippy('body', {
        getReferenceClientRect: props.clientRect as () => DOMRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start',
        offset: [0, 8],
        // We style the menu ourselves; suppress tippy's default theme so it
        // doesn't double-frame our motion.div.
        theme: 'lumina-slash',
        // Framer Motion in SlashMenuList handles its own enter animation.
        animation: false,
        // The suggestion plugin manages dismissal — let tippy stay around and
        // we'll destroy it explicitly in onExit.
        hideOnClick: false,
      });
    },

    onUpdate(props: SuggestionProps<SlashItem>) {
      component?.updateProps(props);
      if (!props.clientRect || !popup?.[0]) return;
      popup[0].setProps({
        getReferenceClientRect: props.clientRect as () => DOMRect,
      });
    },

    onKeyDown(props: SuggestionKeyDownProps): boolean {
      if (props.event.key === 'Escape') {
        popup?.[0]?.hide();
        return true;
      }
      return component?.ref?.onKeyDown(props) ?? false;
    },

    onExit() {
      popup?.[0]?.destroy();
      component?.destroy();
    },
  };
}
