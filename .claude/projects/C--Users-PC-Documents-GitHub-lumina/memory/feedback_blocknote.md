---
name: BlockNote Gotchas
description: Critical patterns for BlockNote editor — shadcn renderer, explicit theme, keyboard guard
type: feedback
---

BlockNote uses `@blocknote/shadcn` (NOT mantine). The shadcn renderer reads `prefers-color-scheme` by default — must pass `theme={resolvedTheme}` explicitly to `BlockNoteView`.

**Why:** Without explicit theme prop, the editor ignores Lumina's next-themes toggle and shows wrong colors.

**How to apply:**
- Always use shadcn imports, never mantine
- Pass `theme={resolvedTheme}` to BlockNoteView
- `@blocknote/xl-multi-column` is lazy-loaded via dynamic `import()` with module-level pre-warming
- CSS theming uses `--bn-colors-*` variables mapped to Lumina's HSL tokens in globals.css
- AppShell keyboard handler MUST check `isContentEditable` and `closest('[contenteditable]')` for any new single-key shortcuts, to avoid intercepting typing in the editor
