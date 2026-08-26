import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lumina-six-bay.vercel.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // F1.14: every entry carried a trailing slash, but the actual routes
        // are single-segment with none. Robots directives are literal prefix
        // matches, so `Disallow: /calendar/` did not match `/calendar` — in
        // practice only `/api/` was genuinely blocked by this file.
        //
        // It did not matter in the end: every app route serves
        // `<meta name="robots" content="noindex, nofollow">`, so the pages were
        // correctly excluded anyway. Fixed so the two mechanisms agree, rather
        // than leaving a decorative file that reads as protection.
        //
        // Without the slash each entry covers both `/calendar` and
        // `/calendar/anything`.
        disallow: [
          '/api',
          '/auth',
          '/onboarding',
          '/calendar',
          '/tasks',
          '/plan',
          '/focus',
          '/pomodoro',
          '/performance',
          '/intelligence',
          '/goals',
          '/shop',
          '/docs',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
