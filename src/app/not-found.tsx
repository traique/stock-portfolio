import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Không tìm thấy trang' };

export default function NotFound() {
  return (
    <main className="ab-page">
      <div
        className="ab-shell"
        style={{
          minHeight:      '100dvh',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            24,
          textAlign:      'center',
          padding:        '40px 20px',
        }}
      >
        {/* Number */}
        <div
          style={{
            fontSize:      'clamp(80px, 20vw, 140px)',
            fontWeight:    900,
            lineHeight:    1,
            color:         'transparent',
            background:    'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            WebkitBackgroundClip: 'text',
            backgroundClip:      'text',
            fontFamily:    'var(--font-num)',
          }}
        >
          404
        </div>

        {/* Message */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
            Không tìm thấy trang
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
            Trang bạn đang tìm không tồn tại hoặc đã bị di chuyển.
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/" className="ab-btn ab-btn-primary"
            style={{ display: 'flex', alignItems: 'center', padding: '0 28px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            Về trang chủ
          </Link>
          <Link href="/dashboard"
            style={{
              display:        'flex',
              alignItems:     'center',
              padding:        '0 28px',
              height:         48,
              borderRadius:   999,
              border:         '1px solid var(--border)',
              background:     'var(--soft)',
              color:          'var(--text)',
              fontSize:       14,
              fontWeight:     700,
              textDecoration: 'none',
            }}>
            Danh mục
          </Link>
        </div>
      </div>
    </main>
  );
}
