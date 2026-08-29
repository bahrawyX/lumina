import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

/**
 * Baseline security headers applied to every response.
 *
 * Notes:
 * - `frame-ancestors 'none'` + `X-Frame-Options: DENY` block clickjacking.
 * - CSP is deliberately permissive for styles/scripts because Next/Turbopack
 *   and framer-motion inject inline styles and hydration scripts. We lean on
 *   React's output escaping for XSS — the app has very few uses of
 *   `dangerouslySetInnerHTML` and all are audited (JSON-LD / static HTML).
 * - `connect-src` includes the app origin plus the external services the app
 *   actually calls from the browser (none today — everything routes through
 *   our own `/api/*`, which then talks to Gemini / Google / Microsoft
 *   server-side). If that changes, extend the list.
 */
const isDev = process.env.NODE_ENV !== 'production';

/**
 * P1-5: `'unsafe-eval'` was sent in production as well as development.
 *
 * It is genuinely required in dev — Turbopack's HMR and React Refresh evaluate
 * module code at runtime — and genuinely not required by the production bundle.
 * Shipping it anyway hands any injected script the one primitive CSP exists to
 * take away, which matters most on exactly the pages that render user content.
 *
 * `'wasm-unsafe-eval'` replaces it in production rather than dropping the line
 * entirely: the dotLottie renderer instantiates a WebAssembly module, and
 * WASM compilation is gated behind an eval-family source. That directive
 * permits WASM and nothing else — no `eval`, no `new Function`.
 */
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'";

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      scriptSrc,
      // P1-5 — `connect-src 'self' https:` permitted exfiltration to ANY host
      // on the internet, which is what turns a readable session token into a
      // full account takeover. The only genuine cross-origin fetches are the
      // marketing page's Lottie assets and the dotLottie WASM renderer, so the
      // allowlist is those hosts and nothing else. (Self-hosting those assets
      // would let this collapse to a bare 'self' — see the landing-page work.)
      "connect-src 'self' https://lottie.host https://assets-v2.lottiefiles.com https://cdn.jsdelivr.net https://unpkg.com",
      // Ambient sounds stream from archive.org and jsdelivr. There was no
      // `media-src`, so it fell back to `default-src 'self'` and every track
      // was blocked outright — which is why Ambient Sounds "did not work".
      // The `<audio>` element failed, the Web Audio fallback kicked in, and
      // "rainfall" became synthesised noise.
      //
      // archive.org redirects downloads to `ia###.us.archive.org`, hence the
      // wildcard. `blob:`/`data:` cover locally generated audio.
      "media-src 'self' blob: data: https://cdn.jsdelivr.net https://archive.org https://*.archive.org",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {},
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  env: {
    NEXT_PUBLIC_BETTER_AUTH_URL:
      process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? 'http://localhost:3000',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  // Sidebar / mobile-nav label is "Insights" but the route lives at
  // /intelligence (legacy name). Redirect /insights → /intelligence so
  // every link or bookmark using the label-matching URL still resolves.
  async redirects() {
    return [
      { source: '/insights', destination: '/intelligence', permanent: true },
      { source: '/insights/:path*', destination: '/intelligence/:path*', permanent: true },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
