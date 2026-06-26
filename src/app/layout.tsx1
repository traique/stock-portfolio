import './globals.css';
import './premium-overrides.css';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Manrope, Playfair_Display } from 'next/font/google';

const sansFont = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const numFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-num',
  display: 'swap',
});

const logoFont = Playfair_Display({
  subsets: ['latin'],
  weight: ['900'],
  variable: '--font-logo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default:  'LCTA — Quản lý danh mục chứng khoán',
    template: '%s | LCTA',
  },
  description:
    'Theo dõi danh mục, phân tích kỹ thuật AI và quản lý giao dịch chứng khoán Việt Nam một cách chuyên nghiệp.',
  keywords: ['chứng khoán', 'danh mục đầu tư', 'HOSE', 'HNX', 'phân tích kỹ thuật', 'AI'],
  authors: [{ name: 'LCTA' }],
  creator: 'LCTA',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lcta.vercel.app',
  ),
  openGraph: {
    type:        'website',
    locale:      'vi_VN',
    siteName:    'LCTA',
    title:       'LCTA — Quản lý danh mục chứng khoán',
    description: 'Theo dõi danh mục, phân tích kỹ thuật AI và quản lý giao dịch chứng khoán Việt Nam.',
    images: [
      {
        url:    '/og-image.png',
        width:  1200,
        height: 630,
        alt:    'LCTA — Quản lý danh mục chứng khoán',
      },
    ],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'LCTA — Quản lý danh mục chứng khoán',
    description: 'Theo dõi danh mục, phân tích kỹ thuật AI và quản lý giao dịch chứng khoán Việt Nam.',
    images:      ['/og-image.png'],
  },
  robots: {
    index:  true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body
        className={`${sansFont.variable} ${numFont.variable} ${logoFont.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
