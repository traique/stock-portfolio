import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stock Portfolio',
  description: 'Theo dõi lời lỗ cổ phiếu với Supabase + Vercel',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
