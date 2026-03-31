import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container">
      <section className="hero">
        <div className="grid grid-2" style={{ alignItems: 'center' }}>
          <div>
            <div style={{ opacity: 0.8, fontSize: 14 }}>Supabase + Vercel</div>
            <h1 style={{ fontSize: 42, lineHeight: 1.15, margin: '12px 0 0' }}>
              Theo dõi lời lỗ cổ phiếu đơn giản, đẹp và dễ deploy
            </h1>
            <p style={{ marginTop: 16, color: '#cbd5e1', lineHeight: 1.7 }}>
              Nhập mã cổ phiếu, giá mua, số lượng. Hệ thống tự lấy giá hiện tại khi mở trang và tính tổng vốn,
              giá trị hiện tại, lời lỗ từng mã và toàn danh mục.
            </p>
            <div style={{ marginTop: 20 }}>
              <Link href="/auth/login" className="btn btn-light">
                Bắt đầu ngay
              </Link>
            </div>
          </div>

          <div className="card" style={{ padding: 20, color: '#0f172a' }}>
            <div className="grid grid-2">
              <div className="card" style={{ padding: 16, background: '#f8fafc' }}>
                <div className="summary-label">Tổng vốn</div>
                <div className="summary-value">150.000.000đ</div>
              </div>
              <div className="card" style={{ padding: 16, background: '#f8fafc' }}>
                <div className="summary-label">Hiện tại</div>
                <div className="summary-value">162.400.000đ</div>
              </div>
            </div>
            <div className="card" style={{ padding: 16, background: '#ecfdf5', marginTop: 16 }}>
              <div className="summary-label" style={{ color: '#047857' }}>Lời / Lỗ</div>
              <div className="summary-value positive">+12.400.000đ</div>
              <div className="positive" style={{ fontWeight: 600 }}>+8.27%</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
