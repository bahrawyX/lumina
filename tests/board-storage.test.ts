/**
 * The board's persistence.
 *
 * A canvas you cannot come back to is a toy, so the storage is the part worth
 * testing. It is scoped per account for the same reason `useSettingsStore` is
 * (F5.3) — one browser regularly serves more than one account, and a board is
 * about the most personal thing in the app to leak.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { boardStorageKey, loadBoard, saveBoard, clearBoard } from '@/lib/board/boardStorage';
import { clearLuminaStorage } from '@/lib/storage';

const scene = (id: string) =>
  ({
    elements: [{ id, type: 'rectangle' }],
    appState: { viewBackgroundColor: '#fff' },
    files: {},
  }) as unknown as Parameters<typeof saveBoard>[1];

beforeEach(() => localStorage.clear());

describe('board storage is per account', () => {
  it('two accounts do not see each other boards', () => {
    saveBoard('user-a', scene('a-rect'));
    saveBoard('user-b', scene('b-rect'));

    expect(loadBoard('user-a')!.elements[0]).toMatchObject({ id: 'a-rect' });
    expect(loadBoard('user-b')!.elements[0]).toMatchObject({ id: 'b-rect' });
  });

  it('a signed-out or guest session gets its own bucket, not a shared one', () => {
    saveBoard(null, scene('anon-rect'));
    expect(loadBoard('user-a')).toBeNull();
    expect(loadBoard(null)!.elements[0]).toMatchObject({ id: 'anon-rect' });
  });

  it('nothing saved reads as null, not as an error', () => {
    // The distinction the P0-2 work is about: empty and failed must not look
    // the same, or the board renders blank and calls it success.
    expect(loadBoard('nobody')).toBeNull();
  });

  it('a corrupt scene costs the drawing, not the page', () => {
    localStorage.setItem(boardStorageKey('user-a'), '{ not json');
    expect(() => loadBoard('user-a')).not.toThrow();
    expect(loadBoard('user-a')).toBeNull();
  });

  it('a scene missing its elements array is rejected rather than half-loaded', () => {
    localStorage.setItem(boardStorageKey('user-a'), JSON.stringify({ appState: {} }));
    expect(loadBoard('user-a')).toBeNull();
  });

  it('clear removes only the caller own board', () => {
    saveBoard('user-a', scene('a'));
    saveBoard('user-b', scene('b'));
    clearBoard('user-a');
    expect(loadBoard('user-a')).toBeNull();
    expect(loadBoard('user-b')).not.toBeNull();
  });

  it('reports whether the write landed', () => {
    // Boards with pasted images reach the 5MB quota quickly, and a silent
    // failure there means losing work without being told.
    expect(saveBoard('user-a', scene('a'))).toBe(true);
  });
});

describe('the board is swept on sign-out', () => {
  it('clearLuminaStorage removes it', () => {
    // The key has to keep matching `isLuminaKey`, or one account's board
    // survives into the next person's session on a shared machine.
    saveBoard('user-a', scene('a'));
    expect(localStorage.getItem(boardStorageKey('user-a'))).not.toBeNull();

    clearLuminaStorage();

    expect(localStorage.getItem(boardStorageKey('user-a'))).toBeNull();
  });
});

describe('the canvas is never server-rendered', () => {
  it('the page imports it through next/dynamic with ssr disabled', () => {
    // Excalidraw touches `window` while its module evaluates, so a static
    // import throws during SSR rather than degrading.
    const page = readFileSync(resolve(process.cwd(), 'src/components/pages/BoardPage.tsx'), 'utf8');
    expect(page).toContain("dynamic(() => import('@/components/board/ExcalidrawBoard')");
    expect(page).toContain('ssr: false');
  });

  it('fonts are self-hosted, or the CSP blocks them', () => {
    // `font-src 'self' data:` refuses Excalidraw's CDN, which would leave the
    // canvas measuring text with the wrong metrics — the same shape as the
    // ambient tracks blocked by a missing `media-src`.
    const board = readFileSync(
      resolve(process.cwd(), 'src/components/board/ExcalidrawBoard.tsx'),
      'utf8',
    );
    expect(board).toContain("window.EXCALIDRAW_ASSET_PATH = '/excalidraw/'");

    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.postinstall).toContain('copy-excalidraw-assets');
  });
});
