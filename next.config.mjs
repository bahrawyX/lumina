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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https:",
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
};

export default withBundleAnalyzer(nextConfig);
