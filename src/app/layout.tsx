import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AlphaBoard',
  description: 'Quản lý danh mục chuyên nghiệp',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
