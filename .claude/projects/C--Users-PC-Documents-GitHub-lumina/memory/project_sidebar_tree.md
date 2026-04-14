---
name: Unused SidebarDocsTree Component
description: SidebarDocsTree.tsx exists but is replaced by inline tree in Sidebar.tsx
type: project
---

`SidebarDocsTree.tsx` exists as a full-featured standalone component but is currently UNUSED — the inline tree (`SidebarDocsInlineTree` + `InlineDocItem`) in `Sidebar.tsx` replaced it.

**Why:** Inline approach was simpler and better integrated with sidebar layout.

**How to apply:** If docs tree needs changes, edit the inline components in Sidebar.tsx, not SidebarDocsTree.tsx. The standalone file can be deleted if cleanup is desired.
