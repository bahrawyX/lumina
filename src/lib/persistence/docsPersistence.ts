/**
 * docsPersistence.ts
 * Thin client-side wrappers around /api/docs.
 * Never calls Drizzle directly — all DB access lives in the API routes.
 *
 * Guest mode: when the user is operating without a session, all CRUD is
 * persisted to localStorage so the docs feature works exactly the same way
 * tasks/events do for guests.
 */

import type { DocTreeNode, DocContent, DocPatch, DocSearchResult } from '@/types/doc';
import { useCoinsStore } from '@/store/useCoinsStore';

// ── Helpers ────────────────────────────────────────────────────────────────────

function apiBase() {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  return res;
}

// ── Guest mode (localStorage-backed) ───────────────────────────────────────────

const GUEST_DOCS_KEY = 'lumina-guest-docs';

function isGuestUser(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('lumina-guest');
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: { isGuest?: boolean } };
    return parsed?.state?.isGuest === true;
  } catch {
    return false;
  }
}

function readGuestDocs(): Record<string, DocContent> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(GUEST_DOCS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DocContent>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeGuestDocs(map: Record<string, DocContent>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GUEST_DOCS_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

function newGuestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function stripContent(doc: DocContent): DocTreeNode {
  const { content, contentText, coverImage, coverGradient, ...rest } = doc;
  void content; void contentText; void coverImage; void coverGradient;
  return rest;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Fetch all docs for the sidebar tree (no content field). */
export async function fetchAll(): Promise<DocTreeNode[]> {
  if (isGuestUser()) {
    return Object.values(readGuestDocs()).map(stripContent);
  }
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
  if (isGuestUser()) {
    return readGuestDocs()[id] ?? null;
  }
  try {
    const res = await apiFetch(`/api/docs/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export type CreateOneResult =
  | { ok: true; doc: DocContent }
  | { ok: false; reason: 'unauthorized' | 'network' | 'server'; status?: number };

/** Create a new doc. Returns a discriminated result so callers can show meaningful errors. */
export async function createOne(params: {
  title?: string;
  parentId?: string | null;
  icon?: string;
  content?: Record<string, unknown>[];
  contentText?: string;
  linkedTaskId?: string | null;
  linkedEventId?: string | null;
}): Promise<CreateOneResult> {
  if (isGuestUser()) {
    const map = readGuestDocs();
    const now = new Date().toISOString();
    const siblings = Object.values(map).filter((d) => (d.parentId ?? null) === (params.parentId ?? null));
    const nextPosition = siblings.reduce((max, d) => Math.max(max, d.position), -1) + 1;
    const wordCount = params.contentText
      ? params.contentText.split(/\s+/).filter(Boolean).length
      : 0;
    const doc: DocContent = {
      id: newGuestId(),
      parentId: params.parentId ?? null,
      title: params.title?.trim() || 'Untitled',
      icon: params.icon ?? null,
      isPinned: false,
      isArchived: false,
      position: nextPosition,
      linkedTaskId: params.linkedTaskId ?? null,
      linkedEventId: params.linkedEventId ?? null,
      wordCount,
      createdAt: now,
      updatedAt: now,
      content: params.content ?? null,
      contentText: params.contentText ?? '',
      coverImage: null,
      coverGradient: null,
    };
    map[doc.id] = doc;
    writeGuestDocs(map);
    return { ok: true, doc };
  }
  try {
    const res = await apiFetch('/api/docs', {
      method: 'POST',
      body: JSON.stringify(params),
      credentials: 'include',
    });
    if (res.status === 401) return { ok: false, reason: 'unauthorized', status: 401 };
    if (!res.ok) return { ok: false, reason: 'server', status: res.status };
    const doc = (await res.json()) as DocContent;
    // Server awards a one-time `first_doc` coin when creating doc #1.
    useCoinsStore.getState().invalidateBalance();
    return { ok: true, doc };
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[docsPersistence] createOne failed:', err);
    }
    return { ok: false, reason: 'network' };
  }
}

export type UpdateOneResult =
  | { status: 'success'; updatedAt: string }
  | { status: 'conflict' }
  | { status: 'error' };

/**
 * Update an existing doc.
 * Returns:
 *   'success'  — HTTP 2xx
 *   'conflict' — HTTP 409 (stale-write protection fired)
 *   'error'    — HTTP 4xx/5xx (other) or network failure
 *
 * Callers may optionally await the result and roll back / toast on failure.
 */
export async function updateOne(
  id: string,
  patch: DocPatch & { updatedAt?: string }
): Promise<UpdateOneResult> {
  if (isGuestUser()) {
    const map = readGuestDocs();
    const existing = map[id];
    const now = new Date().toISOString();
    if (!existing) return { status: 'success', updatedAt: now };
    const wordCount =
      typeof patch.contentText === 'string'
        ? patch.contentText.split(/\s+/).filter(Boolean).length
        : existing.wordCount;
    map[id] = {
      ...existing,
      ...patch,
      wordCount,
      updatedAt: now,
    } as DocContent;
    writeGuestDocs(map);
    return { status: 'success', updatedAt: now };
  }
  try {
    const res = await apiFetch(`/api/docs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (res.status === 409) return { status: 'conflict' };
    if (!res.ok) return { status: 'error' };
    let updatedAt = new Date().toISOString();
    try {
      const data = (await res.json()) as { updatedAt?: string };
      if (typeof data?.updatedAt === 'string') updatedAt = data.updatedAt;
    } catch {
      /* fallback to local timestamp */
    }
    // Server may award a one-time `doc_500_words` coin when content
    // crosses 500 words. Cheap to over-trigger this — the debounce
    // collapses many edits into one GET /api/coins.
    if (typeof patch.contentText === 'string') {
      useCoinsStore.getState().invalidateBalance();
    }
    return { status: 'success', updatedAt };
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[docsPersistence] updateOne failed:', err);
    }
    return { status: 'error' };
  }
}

/** Soft-delete (archive) a doc. */
export async function deleteOne(id: string, hard = false): Promise<void> {
  if (isGuestUser()) {
    const map = readGuestDocs();
    if (hard) {
      delete map[id];
    } else if (map[id]) {
      map[id] = { ...map[id], isArchived: true, updatedAt: new Date().toISOString() };
    }
    writeGuestDocs(map);
    return;
  }
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
  if (isGuestUser()) {
    const q = query.toLowerCase();
    return Object.values(readGuestDocs())
      .filter((d) => !d.isArchived)
      .filter((d) => d.title.toLowerCase().includes(q) || (d.contentText ?? '').toLowerCase().includes(q))
      .slice(0, 25)
      .map((d) => ({
        id: d.id,
        title: d.title,
        icon: d.icon,
        parentId: d.parentId,
        updatedAt: d.updatedAt,
        excerpt: (d.contentText ?? '').slice(0, 120),
      }));
  }
  try {
    const res = await apiFetch(`/api/docs/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
