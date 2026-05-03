import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { buildSlashItems, type SlashItem } from '../slashItems';
import { createSlashMenuRenderer } from '../SlashMenuRenderer';

export interface SlashCommandOptions {
  // Wired by DocEditor to bridge slash items into page-level UI state.
  onOpenColumnPicker: () => void;
  onOpenAIPrompt: (params: {
    coords: { top: number; left: number };
    docPos: number;
  }) => void;
  onOpenDocLinkPicker: (params: {
    coords: { top: number; left: number };
    docPos: number;
  }) => void;
  // Passed to /task so created tasks are linked back to this doc.
  docId: string;
}

export const SlashCommandExtension = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      onOpenColumnPicker: () => {
        /* injected at configure time */
      },
      onOpenAIPrompt: () => {
        /* injected at configure time */
      },
      onOpenDocLinkPicker: () => {
        /* injected at configure time */
      },
      docId: '',
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,

        items: ({ query }): SlashItem[] => {
          const all = buildSlashItems();
          if (!query) return all;
          const q = query.toLowerCase();
          // startsWith semantics on both the title (and each word of the
          // title for multi-word entries like "Heading 1") and aliases.
          // Plain `title.includes(q)` matched "paragraph" for query "h"
          // because of the 'h' inside the word — confusing.
          return all.filter((item) => {
            const title = item.title.toLowerCase();
            if (title.startsWith(q)) return true;
            if (title.split(/\s+/).some((w) => w.startsWith(q))) return true;
            if (item.aliases.some((a) => a.toLowerCase().startsWith(q))) return true;
            return false;
          });
        },

        render: createSlashMenuRenderer,

        command: ({ editor, range, props: item }) => {
          item.execute({
            editor,
            range,
            onOpenColumnPicker: options.onOpenColumnPicker,
            onOpenAIPrompt: options.onOpenAIPrompt,
            onOpenDocLinkPicker: options.onOpenDocLinkPicker,
            docId: options.docId,
          });
        },
      }),
    ];
  },
});
