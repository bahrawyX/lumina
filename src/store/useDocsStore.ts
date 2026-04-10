import { create } from 'zustand';
import { toast } from 'sonner';
import type { DocTreeNode, DocContent, DocPatch, DocSearchResult, CreateDocParams } from '@/types/doc';
import * as docsPersistence from '@/lib/persistence/docsPersistence';

// ── Debounce helper ──────────────────────────────────────────────────────────
let saveTimer: ReturnType<typeof setTimeout> | null = null;

interface DocsState {
  docs: DocTreeNode[];
  openDocId: string | null;
  openDocContent: DocContent | null;
  expandedIds: string[];
  dbHydrated: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  searchQuery: string;
  searchResults: DocSearchResult[];
  isSearching: boolean;

  // Hydration
  hydrateFromDb: (docs: DocTreeNode[]) => void;
  hydrateFromDbFailed: () => void;

  // Navigation
  openDoc: (id: string) => void;
  closeDoc: () => void;
  toggleExpanded: (id: string) => void;
  setExpandedIds: (ids: string[]) => void;

  // CRUD
  createDoc: (params: CreateDocParams) => Promise<string | null>;
  updateDoc: (id: string, patch: DocPatch) => void;
  archiveDoc: (id: string) => void;
  restoreDoc: (id: string) => void;
  deleteDoc: (id: string) => void;
  pinDoc: (id: string, pinned: boolean) => void;
  moveDoc: (id: string, parentId: string | null, position: number) => void;

  // Content
  setOpenDocContent: (doc: DocContent) => void;
  saveContent: (id: string, content: Record<string, unknown>[], contentText: string, wordCount: number) => void;

  // Inline tasks
  createInlineTask: (title: string, docId: string) => Promise<string | null>;

  // Search
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
}

export const useDocsStore = create<DocsState>((set, get) => ({
  docs: [],
  openDocId: null,
  openDocContent: null,
  expandedIds: [],
  dbHydrated: false,
  isSaving: false,
  lastSavedAt: null,
  searchQuery: '',
  searchResults: [],
  isSearching: false,

  // ── Hydration ──────────────────────────────────────────────────────────────
  hydrateFromDb: (docs) => {
    if (get().dbHydrated) return;
    set({ dbHydrated: true, docs });
  },

  hydrateFromDbFailed: () => {
    set({ dbHydrated: true });
  },

  // ── Navigation ─────────────────────────────────────────────────────────────
  openDoc: (id) => {
    set({ openDocId: id, openDocContent: null });
  },

  closeDoc: () => {
    set({ openDocId: null, openDocContent: null });
  },

  toggleExpanded: (id) => {
    set((state) => {
      const isExpanded = state.expandedIds.includes(id);
      return {
        expandedIds: isExpanded
          ? state.expandedIds.filter((eid) => eid !== id)
          : [...state.expandedIds, id],
      };
    });
  },

  setExpandedIds: (ids) => {
    set({ expandedIds: ids });
  },

  // ── CRUD ───────────────────────────────────────────────────────────────────
  createDoc: async (params) => {
    const res = await docsPersistence.createOne({
      title: params.title,
      parentId: params.parentId,
      icon: params.icon,
      linkedTaskId: params.linkedTaskId,
      linkedEventId: params.linkedEventId,
    });

    if (res.ok === false) {
      if (res.reason === 'unauthorized') {
        toast.error('Sign in to create docs', {
          description: 'Your session has expired. Please sign in again.',
        });
      } else if (res.reason === 'network') {
        toast.error("Couldn't create doc", { description: 'Check your connection and try again.' });
      } else {
        toast.error("Couldn't create doc", { description: `Server error (${res.status ?? 'unknown'})` });
      }
      return null;
    }

    const result = res.doc;

    const node: DocTreeNode = {
      id: result.id,
      parentId: result.parentId,
      title: result.title,
      icon: result.icon,
      isPinned: result.isPinned,
      isArchived: result.isArchived,
      position: result.position,
      linkedTaskId: result.linkedTaskId,
      linkedEventId: result.linkedEventId,
      wordCount: result.wordCount,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };

    set((state) => ({
      docs: [...state.docs, node],
    }));

    // Auto-expand parent if creating a child
    if (params.parentId) {
      set((state) => ({
        expandedIds: state.expandedIds.includes(params.parentId!)
          ? state.expandedIds
          : [...state.expandedIds, params.parentId!],
      }));
    }

    return result.id;
  },

  updateDoc: (id, patch) => {
    // Optimistic update
    set((state) => ({
      docs: state.docs.map((d) =>
        d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d
      ),
    }));

    // Persist
    docsPersistence.updateOne(id, patch);
  },

  archiveDoc: (id) => {
    set((state) => ({
      docs: state.docs.map((d) => {
        if (d.id === id || d.parentId === id) {
          return { ...d, isArchived: true };
        }
        return d;
      }),
      openDocId: state.openDocId === id ? null : state.openDocId,
      openDocContent: state.openDocId === id ? null : state.openDocContent,
    }));

    docsPersistence.updateOne(id, { isArchived: true });
  },

  restoreDoc: (id) => {
    set((state) => ({
      docs: state.docs.map((d) =>
        d.id === id ? { ...d, isArchived: false } : d
      ),
    }));

    docsPersistence.updateOne(id, { isArchived: false });
  },

  deleteDoc: (id) => {
    set((state) => ({
      docs: state.docs.filter((d) => d.id !== id && d.parentId !== id),
      openDocId: state.openDocId === id ? null : state.openDocId,
      openDocContent: state.openDocId === id ? null : state.openDocContent,
    }));

    docsPersistence.deleteOne(id, true);
  },

  pinDoc: (id, pinned) => {
    set((state) => ({
      docs: state.docs.map((d) =>
        d.id === id ? { ...d, isPinned: pinned } : d
      ),
    }));

    docsPersistence.updateOne(id, { isPinned: pinned });
  },

  moveDoc: (id, parentId, position) => {
    set((state) => ({
      docs: state.docs.map((d) =>
        d.id === id ? { ...d, parentId, position } : d
      ),
    }));

    docsPersistence.updateOne(id, { parentId, position });
  },

  // ── Content ────────────────────────────────────────────────────────────────
  setOpenDocContent: (doc) => {
    set({ openDocContent: doc, openDocId: doc.id });
  },

  saveContent: (id, content, contentText, wordCount) => {
    // Update local state immediately
    set((state) => ({
      docs: state.docs.map((d) =>
        d.id === id
          ? { ...d, wordCount, updatedAt: new Date().toISOString() }
          : d
      ),
      openDocContent: state.openDocContent?.id === id
        ? { ...state.openDocContent, content, contentText, wordCount }
        : state.openDocContent,
    }));

    // Debounced save to server (1000ms)
    if (saveTimer) clearTimeout(saveTimer);
    set({ isSaving: true });

    saveTimer = setTimeout(async () => {
      const state = get();
      const doc = state.docs.find((d) => d.id === id);
      const result = await docsPersistence.updateOne(id, {
        content,
        contentText,
        wordCount,
        ...(doc ? { updatedAt: doc.updatedAt } : {}),
      });

      if (result === 'conflict') {
        set({ isSaving: false });
        // The consumer (DocPage) should handle conflict via toast
        console.warn('[useDocsStore] Save conflict for doc', id);
        return;
      }

      set({ isSaving: false, lastSavedAt: new Date().toISOString() });
    }, 1000);
  },

  // ── Inline tasks ───────────────────────────────────────────────────────────
  createInlineTask: async (title, docId) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, linkedDocId: docId }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.id ?? null;
    } catch {
      return null;
    }
  },

  // ── Search ─────────────────────────────────────────────────────────────────
  search: async (query) => {
    if (!query.trim()) {
      set({ searchQuery: '', searchResults: [], isSearching: false });
      return;
    }

    set({ searchQuery: query, isSearching: true });
    const results = await docsPersistence.search(query);
    set({ searchResults: results, isSearching: false });
  },

  clearSearch: () => {
    set({ searchQuery: '', searchResults: [], isSearching: false });
  },
}));
