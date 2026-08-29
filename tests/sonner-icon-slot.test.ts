/**
 * The toast icon slot must stay `relative`.
 *
 * It looks like decoration and it is not. Sonner's loading spinner is
 * `.sonner-loading-wrapper`, which its own stylesheet declares as
 *
 *     .sonner-loading-wrapper { position: absolute; inset: 0; height: 16px; width: 16px }
 *     .sonner-loader          { position: absolute; top: 50%; left: 50%;
 *                               transform: translate(-50%, -50%) }
 *
 * so the spinner centres itself against its nearest POSITIONED ancestor. That
 * ancestor is meant to be the icon slot, via Sonner's rule:
 *
 *     [data-sonner-toast][data-styled='true'] [data-icon] { position: relative; … }
 *
 * The wrapper passes `unstyled: true`, which makes Sonner emit
 * `data-styled="false"` — so that selector never matches. With the slot left
 * `static` the spinner escaped its box and centred against the toast instead.
 * Measured in a browser against Sonner's real stylesheet, it landed 16px left
 * and 20px above where it belonged, which is the visible "the spinner isn't
 * centred" in a loading toast.
 *
 * jsdom does no layout, so the geometry cannot be re-measured here. What this
 * guards is the property that produced it: drop `relative` and the bug is back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'src', 'components', 'ui', 'sonner.tsx'), 'utf8');

/** The `icon:` entry in the `classNames` map, comments stripped. */
function iconClassName(): string {
  const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const match = withoutComments.match(/\bicon:\s*"([^"]*)"/);
  expect(match, 'no `icon:` entry in the Sonner classNames map').toBeTruthy();
  return match![1];
}

describe('the Sonner icon slot', () => {
  it('is a positioned ancestor for the absolutely-positioned loader', () => {
    expect(iconClassName()).toMatch(/\brelative\b/);
  });

  it('centres its contents, which Sonner’s own rule did before unstyled removed it', () => {
    const cls = iconClassName();
    expect(cls).toMatch(/\bflex\b/);
    expect(cls).toMatch(/\bitems-center\b/);
    expect(cls).toMatch(/\bjustify-center\b/);
  });

  it('still reserves the 16px box the spinner sizes itself to', () => {
    // `--size: 16px` in `.sonner-loading-wrapper`; a slot of a different size
    // would centre correctly and still look wrong next to the text.
    const cls = iconClassName();
    expect(cls).toMatch(/\bh-4\b/);
    expect(cls).toMatch(/\bw-4\b/);
    expect(cls).toMatch(/\bshrink-0\b/);
  });

  it('is still running unstyled, which is why any of this is needed', () => {
    // If `unstyled` were ever dropped, Sonner's own `[data-icon]` rule would
    // apply again and this file's premise would need revisiting.
    expect(src).toContain('unstyled: true');
  });
});
