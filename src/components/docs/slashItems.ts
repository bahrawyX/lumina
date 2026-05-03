import type { Editor, Range } from '@tiptap/core';
import { toast } from 'sonner';

export interface SlashItemExecuteProps {
  editor: Editor;
  range: Range;
  // Callbacks injected by SlashCommandExtension at plugin-creation time. They
  // bridge to DocEditor state so the slash item can ask the page-level UI to
  // open ColumnRatioPicker / AIPromptInput / DocLinkPicker.
  onOpenColumnPicker?: () => void;
  onOpenAIPrompt?: (params: {
    coords: { top: number; left: number };
    // Doc position where the AI-generated content should be inserted. Captured
    // at slash-item-execute time so a focus shift before submit doesn't move
    // the insert point.
    docPos: number;
  }) => void;
  onOpenDocLinkPicker?: (params: {
    coords: { top: number; left: number };
    docPos: number;
  }) => void;
  // The doc this editor is editing — passed to /task so the created task is
  // linked back to the source doc (matches the BlockNote behavior).
  docId?: string;
}

export interface SlashItem {
  title: string;
  description: string;
  group: 'Basic' | 'Media' | 'Lumina';
  aliases: string[];
  // SVG markup, rendered via dangerouslySetInnerHTML in the menu list. Must
  // be 16x16, stroke="currentColor" so it inherits the menu item color.
  icon: string;
  execute: (props: SlashItemExecuteProps) => void;
}

const ICON = {
  h1: `<svg width="16" height="16" viewBox="0 0 16 16"><text x="1" y="12" font-size="11" font-weight="700" fill="currentColor" font-family="monospace">H1</text></svg>`,
  h2: `<svg width="16" height="16" viewBox="0 0 16 16"><text x="1" y="12" font-size="11" font-weight="700" fill="currentColor" font-family="monospace">H2</text></svg>`,
  h3: `<svg width="16" height="16" viewBox="0 0 16 16"><text x="1" y="12" font-size="11" font-weight="700" fill="currentColor" font-family="monospace">H3</text></svg>`,
  paragraph: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 2H5.5a2.5 2.5 0 000 5H9V14M9 2v12"/></svg>`,
  quote: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 4a1 1 0 011-1h2a1 1 0 011 1v3a3 3 0 01-3 3H3V8h1a1 1 0 001-1V4zm7 0a1 1 0 011-1h2a1 1 0 011 1v3a3 3 0 01-3 3h-1V8h1a1 1 0 001-1V4z" opacity=".7"/></svg>`,
  code: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 4 1 8 5 12"/><polyline points="11 4 15 8 11 12"/></svg>`,
  ul: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="3" cy="4" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1" fill="currentColor" stroke="none"/><line x1="6" y1="4" x2="14" y2="4"/><line x1="6" y1="8" x2="14" y2="8"/><line x1="6" y1="12" x2="14" y2="12"/></svg>`,
  ol: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><text x="0" y="6" font-size="4.5" fill="currentColor" font-family="monospace">1.</text><text x="0" y="10.5" font-size="4.5" fill="currentColor" font-family="monospace">2.</text><text x="0" y="15" font-size="4.5" fill="currentColor" font-family="monospace">3.</text><line x1="7" y1="4.5" x2="14" y2="4.5"/><line x1="7" y1="9" x2="14" y2="9"/><line x1="7" y1="13.5" x2="14" y2="13.5"/></svg>`,
  checklist: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="5" height="5" rx="1"/><path d="M3.5 4.5l1 1 2-2" stroke-width="1.2"/><line x1="9" y1="4" x2="14" y2="4"/><rect x="2" y="9" width="5" height="5" rx="1"/><line x1="9" y1="11.5" x2="14" y2="11.5"/></svg>`,
  hr: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="1" y1="8" x2="15" y2="8"/></svg>`,
  image: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="14" height="10" rx="1.5"/><circle cx="5.5" cy="6.5" r="1.2"/><polyline points="1 11 5 7 8 10 11 7 15 11"/></svg>`,
  video: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="10" height="10" rx="1.5"/><polyline points="11 6 15 4 15 12 11 10"/></svg>`,
  audio: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 2L2 5.5H1a.5.5 0 00-.5.5v4a.5.5 0 00.5.5h1L6 14V2z"/><path d="M9 5.5a3.5 3.5 0 010 5"/><path d="M11.5 3a6.5 6.5 0 010 10"/></svg>`,
  task: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="6" height="6" rx="1.2"/><path d="M3.5 5l1.2 1.2L7 3.5"/><path d="M10 5h4M10 8h4M10 11h4M3 11l1 1 3-3" stroke-width="1.2"/></svg>`,
  columns: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="2" width="5.5" height="12" rx="1"/><rect x="9.5" y="2" width="5.5" height="12" rx="1"/></svg>`,
  callout: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1l1.5 4h4l-3.5 2.5 1.5 4L8 9l-3.5 2.5 1.5-4L2.5 5h4z"/></svg>`,
  ai: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="9" rx="1.5"/><path d="M5 13l1.5 2 1.5-2"/><line x1="5" y1="7" x2="11" y2="7"/><line x1="5" y1="9.5" x2="9" y2="9.5"/></svg>`,
  table: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="1.5" width="13" height="13" rx="1"/><line x1="1.5" y1="5.5" x2="14.5" y2="5.5"/><line x1="1.5" y1="9.5" x2="14.5" y2="9.5"/><line x1="5.5" y1="5.5" x2="5.5" y2="14.5"/><line x1="9.5" y1="5.5" x2="9.5" y2="14.5"/></svg>`,
  toggle: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 5 8 9 12 5"/><line x1="3" y1="12" x2="13" y2="12"/></svg>`,
  pageLink: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3h3v3M13 3L8 8M7 4H4a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V9"/></svg>`,
  bookmark: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2h12v10l-6-3-6 3V2z"/></svg>`,
  math: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><text x="1" y="12" font-size="10" fill="currentColor" font-family="serif" font-style="italic">∑x²</text></svg>`,
};

export function buildSlashItems(): SlashItem[] {
  return [
    // ── Basic ──
    {
      title: 'Heading 1',
      description: 'Large section heading',
      group: 'Basic',
      aliases: ['h1', 'heading1', 'title'],
      icon: ICON.h1,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
      },
    },
    {
      title: 'Heading 2',
      description: 'Medium section heading',
      group: 'Basic',
      aliases: ['h2', 'heading2', 'subtitle'],
      icon: ICON.h2,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
      },
    },
    {
      title: 'Heading 3',
      description: 'Small section heading',
      group: 'Basic',
      aliases: ['h3', 'heading3'],
      icon: ICON.h3,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
      },
    },
    {
      title: 'Paragraph',
      description: 'Plain text block',
      group: 'Basic',
      aliases: ['p', 'text', 'plain', 'normal'],
      icon: ICON.paragraph,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setParagraph().run();
      },
    },
    {
      title: 'Quote',
      description: 'Highlighted blockquote',
      group: 'Basic',
      aliases: ['blockquote', 'quote', 'bq'],
      icon: ICON.quote,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setBlockquote().run();
      },
    },
    {
      title: 'Code Block',
      description: 'Syntax-highlighted code',
      group: 'Basic',
      aliases: ['code', 'pre', 'codeblock', 'snippet'],
      icon: ICON.code,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setCodeBlock().run();
      },
    },
    {
      title: 'Math',
      description: 'LaTeX equation block',
      group: 'Basic',
      aliases: ['math', 'equation', 'latex', 'formula', 'katex', 'tex'],
      icon: ICON.math,
      execute: ({ editor, range }) => {
        // @tiptap/extension-mathematics provides insertBlockMath via its
        // BlockMath sub-extension. Renders via KaTeX into the document.
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertBlockMath({ latex: 'E = mc^2' })
          .run();
      },
    },
    {
      title: 'Bullet List',
      description: 'Unordered list of items',
      group: 'Basic',
      aliases: ['ul', 'list', 'bullet', 'unordered', 'dash'],
      icon: ICON.ul,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: 'Ordered List',
      description: 'Numbered list of items',
      group: 'Basic',
      aliases: ['ol', 'numbered', 'ordered', '1.'],
      icon: ICON.ol,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: 'Task List',
      description: 'Native checklist',
      group: 'Basic',
      aliases: ['checklist', 'check', 'tasklist'],
      icon: ICON.checklist,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleTaskList().run();
      },
    },
    {
      title: 'Toggle',
      description: 'Collapsible content block',
      group: 'Basic',
      aliases: ['toggle', 'collapse', 'accordion', 'details', 'expand', 'fold'],
      icon: ICON.toggle,
      execute: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: 'toggle',
            attrs: { isOpen: true },
            content: [{ type: 'paragraph' }],
          })
          .run();
      },
    },
    {
      title: 'Table',
      description: 'Insert a 3x3 table',
      group: 'Basic',
      aliases: ['table', 'grid', 'spreadsheet'],
      icon: ICON.table,
      execute: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      },
    },
    {
      title: 'Divider',
      description: 'Horizontal separator line',
      group: 'Basic',
      aliases: ['hr', 'line', 'separator', 'rule', 'divide'],
      icon: ICON.hr,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run();
      },
    },
    {
      title: 'Page Link',
      description: 'Link to another document',
      group: 'Basic',
      aliases: ['page', 'link', 'doc', 'document', 'pagelink', 'ref'],
      icon: ICON.pageLink,
      execute: ({ editor, range, onOpenDocLinkPicker }) => {
        editor.chain().focus().deleteRange(range).run();
        const { from } = editor.state.selection;
        let coords: { top: number; left: number };
        try {
          const dom = editor.view.coordsAtPos(from);
          coords = { top: dom.bottom + 4, left: dom.left };
        } catch {
          coords = { top: 100, left: 100 };
        }
        onOpenDocLinkPicker?.({ coords, docPos: from });
      },
    },

    // ── Media ──
    {
      title: 'Image',
      description: 'Embed an image from URL',
      group: 'Media',
      aliases: ['img', 'image', 'photo', 'picture'],
      icon: ICON.image,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        // Browser native prompt — Phase 5 can replace with a Radix Dialog.
        const url = window.prompt('Image URL:');
        if (url && url.trim()) {
          editor.chain().focus().setImage({ src: url.trim() }).run();
        } else {
          editor.commands.focus();
        }
      },
    },
    {
      title: 'Video',
      description: 'Embed a video from URL',
      group: 'Media',
      aliases: ['vid', 'video', 'movie', 'youtube', 'vimeo'],
      icon: ICON.video,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        const url = window.prompt('Video URL (YouTube, Vimeo, or direct):');
        if (url && url.trim()) {
          const safe = url.trim().replace(/"/g, '&quot;');
          editor
            .chain()
            .focus()
            .insertContent(
              `<p><a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a></p>`,
            )
            .run();
        } else {
          editor.commands.focus();
        }
      },
    },
    {
      title: 'Audio',
      description: 'Embed an audio file',
      group: 'Media',
      aliases: ['audio', 'sound', 'mp3', 'music', 'podcast'],
      icon: ICON.audio,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        const url = window.prompt('Audio file URL (mp3, wav, ogg):');
        if (url && url.trim()) {
          const safe = url.trim().replace(/"/g, '&quot;');
          editor
            .chain()
            .focus()
            .insertContent(
              `<p>🎵 <a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a></p>`,
            )
            .run();
        } else {
          editor.commands.focus();
        }
      },
    },
    {
      title: 'Bookmark',
      description: 'Save a link as a card',
      group: 'Media',
      aliases: ['bookmark', 'url', 'website', 'embed', 'card'],
      icon: ICON.bookmark,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        const url = window.prompt('URL to bookmark:');
        if (url?.trim()) {
          editor.commands.insertContent({
            type: 'bookmark',
            attrs: { url: url.trim(), title: '' },
          });
        } else {
          editor.commands.focus();
        }
      },
    },

    // ── Lumina ──
    {
      title: 'Task',
      description: 'Create and embed a task',
      group: 'Lumina',
      aliases: ['task', 'todo', 'action', 'item'],
      icon: ICON.task,
      execute: ({ editor, range, docId }) => {
        editor.chain().focus().deleteRange(range).run();
        // Suggestion's command() is sync; kick off the network call in a
        // detached IIFE so the menu closes immediately. The taskBlock is
        // inserted on success, an error toast on failure.
        const title = 'New task';
        void (async () => {
          try {
            const res = await fetch('/api/tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title,
                status: 'todo',
                ...(docId ? { linkedDocId: docId } : {}),
              }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { id?: string };
            if (!data.id) throw new Error('Missing id in response');
            editor.commands.insertContent({
              type: 'taskBlock',
              attrs: {
                taskId: data.id,
                taskTitle: title,
                checked: false,
              },
            });
          } catch {
            toast.error("Couldn't create task — please try again");
          }
        })();
      },
    },
    {
      title: 'Columns',
      description: 'Multi-column layout',
      group: 'Lumina',
      aliases: ['columns', 'col', 'layout', 'grid', 'split'],
      icon: ICON.columns,
      execute: ({ editor, range, onOpenColumnPicker }) => {
        editor.chain().focus().deleteRange(range).run();
        onOpenColumnPicker?.();
      },
    },
    {
      title: 'Callout',
      description: 'Highlighted tip or note',
      group: 'Lumina',
      aliases: ['callout', 'note', 'info', 'tip', 'hint', 'warning'],
      icon: ICON.callout,
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent('<p>💡 </p>').run();
      },
    },
    {
      title: 'AI Assist',
      description: 'Generate content with Gemini',
      group: 'Lumina',
      aliases: ['ai', 'ask', 'generate', 'assist', 'gemini', 'gpt', 'write'],
      icon: ICON.ai,
      execute: ({ editor, range, onOpenAIPrompt }) => {
        editor.chain().focus().deleteRange(range).run();
        // After deleteRange the selection sits at the deletion point —
        // viewport coords for AIPromptInput's fixed positioning, doc pos
        // for the eventual insert.
        const { from } = editor.state.selection;
        let coords: { top: number; left: number };
        try {
          const dom = editor.view.coordsAtPos(from);
          coords = { top: dom.bottom + 4, left: dom.left };
        } catch {
          coords = { top: 100, left: 100 };
        }
        onOpenAIPrompt?.({ coords, docPos: from });
      },
    },
  ];
}
