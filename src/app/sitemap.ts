import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lcta.vercel.app';
  return [
    {
      url:              base,
      lastModified:     new Date(),
      changeFrequency:  'weekly',
      priority:         1,
    },
    {
      url:              `${base}/gold`,
      lastModified:     new Date(),
      changeFrequency:  'daily',
      priority:         0.6,
    },
    {
      url:              `${base}/oil`,
      lastModified:     new Date(),
      changeFrequency:  'daily',
      priority:         0.6,
    },
  ];
}
