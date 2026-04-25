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
  title: 'LCTA',
  description: 'Hệ thống quản lý gia sản cao cấp',
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
