import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';

/**
 * Board persistence, scoped to the account.
 *
 * Keyed per user for the same reason `useSettingsStore` is (F5.3): one browser
 * is regularly used by more than one account, and a board is the most personal
 * thing in the app to leak. The key ends up `lumina-board::<userId>`, which
 * `isLuminaKey` matches, so `clearLuminaStorage` sweeps it on sign-out like
 * everything else.
 *
 * Signed-out and guest sessions share an `anon` bucket. That is deliberate:
 * a guest should be able to sketch, and their work should not vanish on a
 * reload — the same promise guest mode makes for tasks and events.
 *
 * ## Why localStorage and not the database
 *
 * A board is a single document per user, edited continuously, and worth
 * nothing to anyone else — the profile localStorage is good at. Moving it
 * server-side means a table, a debounce-aware endpoint, conflict handling for
 * two open tabs, and a size limit; worth doing when boards need to sync across
 * devices or be shared, and not before. `saveBoard` returns whether the write
 * landed so a caller can tell the user when it did not, which is the part that
 * would otherwise be silent.
 */

export interface BoardScene {
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
}

const KEY = 'lumina-board';

export function boardStorageKey(userId: string | null): string {
  return `${KEY}::${userId ?? 'anon'}`;
}

/**
 * Read the saved scene.
 *
 * `null` means "nothing saved" — an empty board. A parse failure also returns
 * `null` rather than throwing, because a corrupt scene should cost the drawing,
 * not the page.
 */
export function loadBoard(userId: string | null): BoardScene | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(boardStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BoardScene>;
    if (!Array.isArray(parsed.elements)) return null;
    return {
      elements: parsed.elements,
      appState: parsed.appState ?? {},
      files: parsed.files ?? {},
    };
  } catch {
    return null;
  }
}

/** Write the scene. Returns false when storage refused it (quota, private mode). */
export function saveBoard(userId: string | null, scene: BoardScene): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(boardStorageKey(userId), JSON.stringify(scene));
    return true;
  } catch {
    // Almost always the 5MB quota, which a board with pasted images reaches
    // quickly. Reported rather than swallowed so the caller can say so.
    return false;
  }
}

export function clearBoard(userId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(boardStorageKey(userId));
  } catch {
    /* nothing useful to do */
  }
}
