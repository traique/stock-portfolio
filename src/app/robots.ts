import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lcta.vercel.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow:     '/',
        disallow:  ['/dashboard', '/api/', '/auth/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
