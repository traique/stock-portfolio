import { ImageResponse } from 'next/og';

export const runtime     = 'edge';
export const alt         = 'LCTA — Quản lý danh mục chứng khoán';
export const size        = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width:          '100%',
          height:         '100%',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'flex-start',
          justifyContent: 'space-between',
          padding:        '80px',
          background:     'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          fontFamily:     'sans-serif',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width:          56, height: 56, borderRadius: 14,
            background:     'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            display:        'flex', alignItems: 'center', justifyContent: 'center',
            fontSize:       28, fontWeight: 900, color: '#fff',
          }}>L</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
            LCTA
          </div>
        </div>

        {/* Main */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.1, letterSpacing: '-0.03em' }}>
            Quản lý danh mục
            <br />
            <span style={{ color: '#3b82f6' }}>chứng khoán</span>
          </div>
          <div style={{ fontSize: 28, color: '#94a3b8', fontWeight: 400, lineHeight: 1.4 }}>
            Phân tích kỹ thuật AI · Theo dõi P&L · Cảnh báo giá
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 12 }}>
          {['HOSE', 'HNX', 'AI Analysis', 'Free'].map(tag => (
            <div key={tag} style={{
              padding: '8px 20px', borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.3)',
              color: '#94a3b8', fontSize: 18, fontWeight: 600,
            }}>{tag}</div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
