'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, Droplets, Gem, Sparkles } from 'lucide-react';
import AppShellHeader from '@/components/app-shell-header';
import { supabase } from '@/lib/supabase';

export default function ToolsPage() {
  const [email, setEmail] = useState('');

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ''));
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader title="Tools" isLoggedIn={Boolean(email)} email={email} currentTab="tools" onLogout={handleLogout} />

        <section className="ab-premium-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
          <div className="ab-card-kicker">Khu tiện ích riêng</div>
          <div className="ab-card-headline">Tách tool ra khỏi màn hình chính để app nhìn sạch hơn</div>
          <div className="ab-soft-label">Danh mục là trung tâm. Các tính năng chuyên biệt nằm riêng ở đây để mở ra vẫn đã mắt và đúng trọng tâm.</div>
        </section>

        <section className="ab-home-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <Link href="/backtest" className="ab-premium-card" style={{ padding: 16, display: 'grid', gap: 10 }}>
            <div className="ab-row-between align-center">
              <div className="ab-card-kicker">Chiến lược</div>
              <BarChart3 size={18} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>Backtest</div>
            <div className="ab-soft-label">Tra cứu nhanh hiệu suất scan theo mã, giữ riêng để không làm rối dashboard.</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, marginTop: 4 }}>
              <span>Mở công cụ</span>
              <ArrowRight size={16} />
            </div>
          </Link>

          <Link href="/gold" className="ab-premium-card" style={{ padding: 16, display: 'grid', gap: 10 }}>
            <div className="ab-row-between align-center">
              <div className="ab-card-kicker">Hàng hóa</div>
              <Gem size={18} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>Giá vàng</div>
            <div className="ab-soft-label">Theo dõi SJC và giá vàng thế giới trong một màn hình chuyên biệt.</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, marginTop: 4 }}>
              <span>Mở công cụ</span>
              <ArrowRight size={16} />
            </div>
          </Link>

          <Link href="/oil" className="ab-premium-card" style={{ padding: 16, display: 'grid', gap: 10 }}>
            <div className="ab-row-between align-center">
              <div className="ab-card-kicker">Hàng hóa</div>
              <Droplets size={18} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>Giá xăng</div>
            <div className="ab-soft-label">Giữ riêng để app gọn hơn nhưng vẫn mở được nhanh khi cần đối chiếu.</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, marginTop: 4 }}>
              <span>Mở công cụ</span>
              <ArrowRight size={16} />
            </div>
          </Link>
        </section>

        <section className="ab-premium-card" style={{ padding: 14, display: 'grid', gap: 10 }}>
          <div className="ab-row-between align-center">
            <div>
              <div className="ab-card-kicker">Tư duy giao diện mới</div>
              <div className="ab-card-headline small">Ít hơn nhưng rõ hơn</div>
            </div>
            <Sparkles size={16} />
          </div>
          <div className="ab-soft-label">Dashboard chỉ giữ NAV, PnL và holdings. Watchlist để riêng. Market để riêng. Tools để riêng. Mở app ra là thấy đúng thứ cần xem thay vì một đống tính năng nằm ngang hàng nhau.</div>
        </section>
      </div>
    </main>
  );
      }
