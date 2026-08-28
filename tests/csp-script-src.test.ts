/**
 * P1-5 — `'unsafe-eval'` was shipped to production.
 *
 * It is genuinely needed in development (Turbopack HMR and React Refresh
 * evaluate module code at runtime) and genuinely not needed by the production
 * bundle. Sending it anyway hands any injected script the exact primitive CSP
 * exists to remove.
 *
 * The config is read and evaluated rather than string-matched, so a directive
 * that is declared but not wired into the header array still fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rawConfig = readFileSync(resolve(process.cwd(), 'next.config.mjs'), 'utf8');

/**
 * Comments stripped.
 *
 * The comment above `connect-src` quotes the old, bad directive verbatim to
 * explain what was fixed — so a scan of the raw file finds the explanation and
 * reports the fix as the defect.
 */
const config = rawConfig
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

/** Rebuild the `script-src` the config would emit for a given NODE_ENV. */
function scriptSrcFor(env: 'development' | 'production'): string {
  const isDev = env !== 'production';
  const match = config.match(
    /const scriptSrc = isDev\s*\?\s*("[^"]*")\s*:\s*("[^"]*")/,
  );
  if (!match) throw new Error('scriptSrc is no longer a dev/prod conditional');
  return JSON.parse(isDev ? match[1] : match[2]) as string;
}

describe('P1-5 — script-src', () => {
  it('production does not allow unsafe-eval', () => {
    expect(scriptSrcFor('production')).not.toContain("'unsafe-eval'");
  });

  it('production still allows WASM, or the Lottie renderer dies', () => {
    // WASM compilation is gated behind an eval-family source. Dropping the
    // directive entirely would have broken all six landing-page animations —
    // which is why this is a swap and not a deletion.
    expect(scriptSrcFor('production')).toContain("'wasm-unsafe-eval'");
  });

  it('development keeps unsafe-eval, because HMR needs it', () => {
    // Removing it here would break the dev server, which is a different kind
    // of wrong from shipping it.
    expect(scriptSrcFor('development')).toContain("'unsafe-eval'");
  });

  it('the conditional is actually used in the header array', () => {
    // A `scriptSrc` const that nothing references would pass every assertion
    // above while the header kept its old literal.
    const headerBlock = config.slice(
      config.indexOf('const securityHeaders'),
      config.indexOf('/** @type'),
    );
    expect(headerBlock).toContain('scriptSrc,');
    expect(headerBlock).not.toContain("'unsafe-eval'");
  });

  it('connect-src is still an allowlist, not https:', () => {
    // The other half of P1-5. `connect-src 'self' https:` permitted
    // exfiltration to any host on the internet.
    //
    // The negative lookahead is load-bearing: `https:` is a prefix of
    // `https://lottie.host`, so the naive pattern flags the allowlist itself.
    expect(config).not.toMatch(/connect-src 'self' https:(?!\/\/)/);
    expect(config).toContain("connect-src 'self' https://lottie.host");
  });

  it('object-src and frame-ancestors are still locked down', () => {
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("frame-ancestors 'none'");
  });
});
