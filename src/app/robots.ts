import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lumina-six-bay.vercel.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/',
          '/onboarding/',
          '/tasks/',
          '/plan/',
          '/focus/',
          '/pomodoro/',
          '/performance/',
          '/intelligence/',
          '/goals/',
          '/shop/',
          '/docs/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
