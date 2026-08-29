'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { authClient } from '@/lib/auth-client';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MaximizeIcon, MinimizeIcon } from '@/components/icons/WindowIcons';

/**
 * `ssr: false` is required, not a preference: Excalidraw reads `window` while
 * its module is evaluated, so importing it on the server throws during render.
 */
const ExcalidrawBoard = dynamic(() => import('@/components/board/ExcalidrawBoard'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
      Loading your board…
    </div>
  ),
});

export default function BoardPage() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;

  /**
   * Maximised is an in-page state rather than the browser's Fullscreen API.
   *
   * `requestFullscreen` hands Escape to the browser, and Excalidraw already
   * uses Escape to cancel a drag and clear a selection — so the same key would
   * both abandon the shape being drawn and throw the user out of fullscreen.
   * Toggling layout keeps Escape belonging to the canvas, and keeps the
   * browser's own chrome (tabs, address bar) available, which is usually what
   * someone wants from "make the board bigger" rather than a kiosk.
   */
  const [maximized, setMaximized] = useState(false);
  const toggle = useCallback(() => setMaximized((m) => !m), []);

  // The page behind a maximised board must not scroll — a stray wheel event
  // over the chrome would drift the page under a canvas that fills the screen.
  useEffect(() => {
    if (!maximized) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [maximized]);

  const toggleButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={maximized}
          aria-label={maximized ? 'Exit full screen' : 'Expand board to full screen'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground hover:bg-accent"
        >
          {maximized ? <MinimizeIcon size={16} /> : <MaximizeIcon size={16} />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{maximized ? 'Exit full screen' : 'Full screen'}</TooltipContent>
    </Tooltip>
  );

  if (maximized) {
    return (
      // `fixed inset-0` rather than a CSS `:fullscreen` rule so the board is
      // still inside React's tree — Excalidraw keeps its scene, scroll position
      // and undo history across the toggle instead of remounting.
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/*
          A real strip rather than a button floating over the canvas.
          Overlaying it collided with Excalidraw's own chrome: measured at
          1100×780 the Library button occupies x 1002–1084 / y 16–52, and a
          button at `top-3 right-3` lands on x 1056–1088 / y 12–44 — directly
          on top of it. Dodging that is not a matter of picking better offsets
          either, because Excalidraw moves its controls between its desktop and
          mobile layouts, so any fixed corner is wrong in one of them.

          Giving the control its own 36px row costs ~5% of the height and makes
          overlap impossible in every layout.
        */}
        <div className="flex-shrink-0 h-9 px-3 flex items-center justify-between border-b border-border/60 bg-background">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground-subtle">
            Board
          </span>
          {toggleButton}
        </div>
        <div className="flex-1 min-h-0">
          <ExcalidrawBoard userId={userId} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="px-6 pt-8 pb-4 flex-shrink-0 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground-subtle">
            Workspace · Board
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-medium tracking-[-0.035em] text-foreground mt-1">
            Board
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            A freeform canvas for sketching, mapping and thinking out loud. Saves as you draw.
          </p>
        </div>
        <div className="flex-shrink-0 pt-1">{toggleButton}</div>
      </header>

      {/* `min-h-0` on both this and the parent: without it a flex child refuses
          to shrink below its content, and the canvas pushes the page instead of
          filling the space left over. */}
      <div className="flex-1 min-h-0 border-t border-border/60">
        <ExcalidrawBoard userId={userId} />
      </div>
    </div>
  );
}
