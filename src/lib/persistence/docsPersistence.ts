/**
 * docsPersistence.ts
 * Thin client-side wrappers around /api/docs.
 * Never calls Drizzle directly — all DB access lives in the API routes.
 */

import type { DocTreeNode, DocContent, DocPatch, DocSearchResult } from '@/types/doc';

// ── Helpers ────────────────────────────────────────────────────────────────────

function apiBase() {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  return res;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Fetch all docs for the sidebar tree (no content field). */
export async function fetchAll(): Promise<DocTreeNode[]> {
  try {
    const res = await apiFetch('/api/docs');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Fetch a single doc with full content. */
export async function fetchOne(id: string): Promise<DocContent | null> {
  try {
    const res = await apiFetch(`/api/docs/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Create a new doc. Returns the created doc or null on failure. */
export async function createOne(params: {
  title?: string;
  parentId?: string | null;
  icon?: string;
  content?: Record<string, unknown>[];
  contentText?: string;
  linkedTaskId?: string | null;
  linkedEventId?: string | null;
}): Promise<DocContent | null> {
  try {
    const res = await apiFetch('/api/docs', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[docsPersistence] createOne failed:', err);
    }
    return null;
  }
}

/** Update an existing doc. Returns true on success, 'conflict' on 409. */
export async function updateOne(
  id: string,
  patch: DocPatch & { updatedAt?: string }
): Promise<true | 'conflict'> {
  try {
    const res = await apiFetch(`/api/docs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (res.status === 409) return 'conflict';
    return true;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[docsPersistence] updateOne failed:', err);
    }
    return true;
  }
}

/** Soft-delete (archive) a doc. */
export async function deleteOne(id: string, hard = false): Promise<void> {
  try {
    const url = hard ? `/api/docs/${id}?hard=true` : `/api/docs/${id}`;
    await apiFetch(url, {
      method: 'DELETE',
      ...(hard ? { body: JSON.stringify({ confirm: true }) } : {}),
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[docsPersistence] deleteOne failed:', err);
    }
  }
}

/** Full-text search across docs. */
export async function search(query: string): Promise<DocSearchResult[]> {
  try {
    const res = await apiFetch(`/api/docs/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
