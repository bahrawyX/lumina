'use client';

import type { ReactNode } from 'react';
import { DARK } from './tokens';

/**
 * macOS-style window chrome wrapper for landing mockups.
 * Renders a title bar with traffic-light dots and an optional label.
 */
export function MockupFrame({
  title,
  children,
  aspect = '16 / 10',
}: {
  title?: string;
  children: ReactNode;
  aspect?: string;
}) {
  return (
    <div
      className="relative w-full rounded-xl overflow-hidden shadow-2xl"
      style={{
        background: DARK.surface,
        border: `1px solid ${DARK.border}`,
        aspectRatio: aspect,
      }}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-1.5 px-3 py-2.5"
        style={{
          background: DARK.surfaceElevated,
          borderBottom: `1px solid ${DARK.borderSubtle}`,
        }}
      >
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'hsl(0 60% 55%)' }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'hsl(38 80% 55%)' }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'hsl(140 40% 50%)' }} />
        {title ? (
          <span
            className="ml-3 text-[10px] font-mono tracking-wide"
            style={{ color: DARK.textMuted }}
          >
            {title}
          </span>
        ) : null}
      </div>
      {/* Body */}
      <div className="absolute inset-x-0 bottom-0 top-[34px] overflow-hidden">
        {children}
      </div>
    </div>
  );
}
