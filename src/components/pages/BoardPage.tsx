'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { authClient } from '@/lib/auth-client';

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

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="px-6 pt-8 pb-4 flex-shrink-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground-subtle">
          Workspace · Board
        </p>
        <h1 className="font-display text-2xl md:text-3xl font-medium tracking-[-0.035em] text-foreground mt-1">
          Board
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          A freeform canvas for sketching, mapping and thinking out loud. Saves as you draw.
        </p>
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
