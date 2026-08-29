'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
// After Excalidraw's own stylesheet, so our variable overrides win on source
// order without needing `!important`.
import './excalidraw-theme.css';
import { boardStorageKey, loadBoard, saveBoard, type BoardScene } from '@/lib/board/boardStorage';

/**
 * The visual board.
 *
 * Three things about embedding Excalidraw here that are not obvious:
 *
 * **Assets are self-hosted.** Excalidraw resolves its fonts at runtime and, by
 * default, fetches them from a public CDN. This app declares
 * `font-src 'self' data:`, so every one of those requests would be refused and
 * the canvas would silently fall back to wrong text metrics — the same shape as
 * the ambient audio, where a missing `media-src` blocked every track.
 * `scripts/copy-excalidraw-assets.mjs` copies the fonts into `public/` on
 * postinstall and `EXCALIDRAW_ASSET_PATH` points at them, so the CSP does not
 * have to be widened for a third-party host.
 *
 * **It must not render on the server.** Excalidraw touches `window` during
 * module evaluation, so the page imports this component through `next/dynamic`
 * with `ssr: false`.
 *
 * **Saving is debounced, not per-stroke.** `onChange` fires on every pointer
 * move; writing the scene each time would serialise the whole document
 * hundreds of times a second.
 */

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

// Set before the component mounts, since the font loader reads it eagerly.
if (typeof window !== 'undefined') {
  window.EXCALIDRAW_ASSET_PATH = '/excalidraw/';
}

/** Long enough to batch a stroke, short enough that a tab close rarely loses work. */
const SAVE_DEBOUNCE_MS = 800;

export default function ExcalidrawBoard({ userId }: { userId: string | null }) {
  const [dark, setDark] = useState(false);
  const [initial, setInitial] = useState<BoardScene | null | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<BoardScene | null>(null);

  // Load once per account. `undefined` means "still reading", `null` means
  // "read, and there was nothing" — the distinction matters or an empty board
  // and a failed read look identical.
  useEffect(() => {
    setInitial(loadBoard(userId));
  }, [userId]);

  // `next-themes` toggles `.dark` on <html>, so watch the attribute rather
  // than subscribing to the theme library — this keeps the board decoupled
  // from whichever provider is in use.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains('dark'));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pending.current) {
      saveBoard(userId, pending.current);
      pending.current = null;
    }
  }, [userId]);

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      pending.current = {
        elements: elements as ExcalidrawElement[],
        // Only the view-level state is kept. Persisting the whole `appState`
        // would restore transient things like the current selection and any
        // open dialog, which is disorienting on reload.
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          zoom: appState.zoom,
        },
        files,
      };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // A debounce that only fires on a timer loses whatever was drawn in the last
  // fraction of a second before the tab goes away. `pagehide` covers closing,
  // navigating and the bfcache; `visibilitychange` covers switching apps on
  // mobile, where `pagehide` is unreliable.
  useEffect(() => {
    const onLeave = () => flush();
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  if (initial === undefined) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        Loading your board…
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <Excalidraw
        initialData={
          initial
            ? { elements: initial.elements, appState: initial.appState, files: initial.files }
            : null
        }
        onChange={handleChange}
        // Follows the app's theme live. Reading the class once during render
        // would leave the canvas in whichever mode it mounted in when the user
        // flips the switch.
        theme={dark ? 'dark' : 'light'}
        UIOptions={{
          canvasActions: {
            // Excalidraw's own "load from file" replaces the scene wholesale
            // with no undo across the boundary, which is a sharp edge on a
            // board that autosaves. Export and clear stay.
            loadScene: false,
          },
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}

export { boardStorageKey };
