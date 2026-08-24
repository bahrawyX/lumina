'use client';

import type { ReactNode } from 'react';

/**
 * Render `fallback` while loading, `children` once ready.
 *
 * ## Why this replaced `boneyard-js`
 *
 * P1-16: `devDependencies` were declared correctly, but the lockfile marked
 * several of them non-dev, so they installed in a production install — verified
 * with a clean `npm ci --omit=dev`: **420 packages, 795 MB**. The single
 * largest cause was this package:
 *
 *     boneyard-js@1.7.6 declares "dependencies": { "playwright": "^1.58.2" }
 *
 * A browser-automation toolkit in the production dependency graph is a real
 * supply-chain surface, for what is — in this app — a `<Skeleton>` used in
 * seven files.
 *
 * It also dragged in `src/bones/*.bones.json`: **444 KB on disk** statically
 * imported by `src/bones/registry.js`, which was referenced by all 14
 * prerendered pages **including the landing page and the 404**
 * (`page.PerformancePage.bones.json` alone is 247 KB). The marketing page paid
 * for skeletons of pages it will never render.
 *
 * And the recorded bones were barely load-bearing: **every one of the seven
 * call sites already hand-writes its own `fallback`**, using the local
 * `<Skeleton>` primitive. This component preserves that exact API — `loading`,
 * `fallback`, `className`, `children` — so the call sites are unchanged.
 */
export interface LoadingBoundaryProps {
  /**
   * Kept for source compatibility with the call sites and as a readable label
   * of which surface is loading. Nothing reads it — the recorded skeleton JSON
   * it used to key into is gone.
   */
  name?: string;
  loading: boolean;
  fallback: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function LoadingBoundary({
  loading,
  fallback,
  className,
  children,
}: LoadingBoundaryProps) {
  if (loading) {
    return className ? <div className={className}>{fallback}</div> : <>{fallback}</>;
  }
  return className ? <div className={className}>{children}</div> : <>{children}</>;
}

export { LoadingBoundary as Skeleton };
