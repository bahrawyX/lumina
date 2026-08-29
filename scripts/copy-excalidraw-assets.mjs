/**
 * Copy Excalidraw's fonts into `public/` so the board can self-host them.
 *
 * ## Why this is necessary
 *
 * Excalidraw resolves its font files at runtime. Left alone it fetches them
 * from a public CDN — and this app's CSP declares `font-src 'self' data:`, so
 * every one of those requests is refused and the canvas renders with fallback
 * text metrics. That is the same failure mode the ambient audio tracks had,
 * where a missing `media-src` silently blocked every file.
 *
 * Rather than widen the CSP for a third-party host, the fonts are copied out of
 * the package and served from our own origin. `window.EXCALIDRAW_ASSET_PATH`
 * then points at them (see `ExcalidrawBoard.tsx`).
 *
 * Runs on `postinstall` so a fresh clone or an `npm ci` has them without anyone
 * having to remember. Copying is skipped when the destination is already
 * current, so repeat installs stay fast.
 */
import { cp, mkdir, stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'fonts');
const DEST = join(root, 'public', 'excalidraw', 'fonts');

async function countFiles(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? await countFiles(join(dir, entry.name)) : 1;
  }
  return total;
}

async function main() {
  if (!existsSync(SOURCE)) {
    // Not an error: the dependency may simply not be installed yet in a
    // partial install, and failing here would break `npm install` itself.
    console.log('[excalidraw-assets] package fonts not found, skipping');
    return;
  }

  if (existsSync(DEST)) {
    const [from, to] = await Promise.all([countFiles(SOURCE), countFiles(DEST)]);
    if (from === to) {
      console.log(`[excalidraw-assets] up to date (${to} files)`);
      return;
    }
  }

  await mkdir(dirname(DEST), { recursive: true });
  await cp(SOURCE, DEST, { recursive: true });
  const copied = await countFiles(DEST);
  const { size } = await stat(DEST).catch(() => ({ size: 0 }));
  void size;
  console.log(`[excalidraw-assets] copied ${copied} font files to public/excalidraw/fonts`);
}

main().catch((err) => {
  // Again, non-fatal. A board with fallback fonts is a degraded board; a failed
  // `npm install` is a broken checkout.
  console.warn('[excalidraw-assets] copy failed:', err?.message ?? err);
});
