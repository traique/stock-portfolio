import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Tối ưu bandwidth Vercel Free (100GB/tháng)
  compress: true,

  // Giảm build time và bundle size
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  // Security headers — không tốn gì thêm
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'X-Frame-Options',            value: 'DENY' },
          { key: 'X-XSS-Protection',           value: '1; mode=block' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Cache static assets 1 năm
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

// Sentry chỉ active khi có DSN — không ảnh hưởng build nếu chưa cấu hình
const sentryConfig = {
  silent:              true,   // Không spam build log
  disableLogger:       true,
  widenClientFileUpload: false, // Tắt để giảm build time trên free tier
  // Không upload source maps (tốn bandwidth và storage) — bật khi cần debug production
  sourcemaps: {
    disable: true,
  },
};

export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryConfig)
  : nextConfig;
