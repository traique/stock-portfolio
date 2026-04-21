import './globals.css';
import './premium-overrides.css';
import type { Metadata } from 'next';
import { Be_Vietnam_Pro, Playfair_Display } from 'next/font/google';

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

// Khai báo Font Serif quyền lực
const playfairDisplay = Playfair_Display({
  subsets: ['latin', 'vietnamese'],
  weight: ['600', '700', '800', '900'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LCTA',
  description: 'Radar đầu tư premium',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      {/* Ép cả 2 font vào body để sử dụng toàn cục */}
      <body className={`${beVietnamPro.variable} ${playfairDisplay.variable}`}>
        {children}
      </body>
    </html>
  );
}
