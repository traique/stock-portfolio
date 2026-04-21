'use client';

import { useEffect, useState } from 'react';
import { Droplets, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

type OilCard = {
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  unit: string;
  source: string;
  updatedAt: string | null;
};

type OilResponse = { cards?: OilCard[]; error?: string };

function fmt(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

function fmtChange(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 'Không đổi';
  const sign = value > 0 ? '+' : '';
  return `${sign}${fmt(value)}`;
}

// Hàm lấy màu chữ
function toneColor(value?: number | null) {
  if (!Number.isFinite(value as number) || value === 0) return 'var(--muted)';
  return (value as number) > 0 ? 'var(--green)' : 'var(--red)';
}

// Hàm lấy màu nền (Pill Background)
function toneBg(value?: number | null) {
  if (!Number.isFinite(value as number) || value === 0) return 'var(--soft-2)';
  return (value as number) > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(225, 29, 72, 0.1)';
}

function fmtUpdated(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function LoadingCard() {
  return (
    <article className="ab-premium-card" style={{ padding: 24 }}>
      <div className="ab-skeleton" style={{ width: '50%', height: 28 }} />
      <div className="ab-skeleton" style={{ width: '30%', height: 16, marginTop: 8 }} />
      <div className="ab-skeleton" style={{ width: '100%', height: 100, marginTop: 24, borderRadius: 20 }} />
    </article>
  );
}

export default function OilLivePage() {
  const [email, setEmail] = useState('');
  const [cards, setCards] = useState<OilCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ''));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMessage('');
      try {
        const response = await fetch('/api/oil-live', { cache: 'no-store' });
        const data: OilResponse = await response.json();
        if (!response.ok) setMessage(data?.error || 'Không lấy được dữ liệu giá xăng');
        else setCards(data.cards || []);
      } catch {
        setMessage('Lỗi kết nối dữ liệu giá xăng');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader title="Giá xăng dầu" isLoggedIn={Boolean(email)} email={email} currentTab="oil" onLogout={handleLogout} />
        
        {message && (
          <section className="ab-premium-card" style={{ padding: 16 }}>
            <div className="ab-error">{message}</div>
          </section>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {(loading ? Array.from({ length: 4 }).map((_, index) => ({ code: String(index) })) : cards).map((card: OilCard | { code: string }) => {
            if (loading) return <LoadingCard key={card.code} />;
            
            const item = card as OilCard;

            return (
              <article key={item.code} className="ab-premium-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* --- HEADER KHỐI --- */}
                <div className="ab-row-between align-center">
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 800, fontFamily: '"Playfair Display", serif', color: 'var(--text)' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', marginTop: 4, textTransform: 'uppercase' }}>
                      {item.source}
                    </div>
                  </div>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--soft)', display: 'grid', placeItems: 'center', color: '#3b82f6', border: '1px solid var(--border)' }}>
                    <Droplets size={22} />
                  </div>
                </div>

                {/* --- KHỐI GIÁ --- */}
                <div style={{ background: 'var(--soft)', borderRadius: 20, padding: 20, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    GIÁ BÁN ({item.unit})
                  </div>
                  <div style={{ fontSize: 38, fontWeight: 800, fontFamily: '"Playfair Display", serif', color: 'var(--text)', marginTop: 6 }}>
                    {fmt(item.price)}
                  </div>
                  <div style={{ 
                    display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '6px 12px', 
                    borderRadius: 999, background: toneBg(item.change), color: toneColor(item.change), fontSize: 14, fontWeight: 800 
                  }}>
                    {fmtChange(item.change)}
                  </div>
                </div>

                {/* --- FOOTER CẬP NHẬT --- */}
                {item.updatedAt && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, color: 'var(--muted)', fontSize: 12, fontWeight: 600, marginTop: 'auto' }}>
                    <Clock size={14} />
                    <span>{fmtUpdated(item.updatedAt)}</span>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
