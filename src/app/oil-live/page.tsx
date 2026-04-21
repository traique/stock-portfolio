'use client';

import { useEffect, useState } from 'react';
import { Droplets } from 'lucide-react';
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
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return '0';
  const sign = value > 0 ? '+' : '';
  return `${sign}${fmt(value)}`;
}

function toneColor(value?: number | null) {
  if (!Number.isFinite(value as number) || value === 0) return 'var(--muted)';
  return (value as number) > 0 ? 'var(--green)' : 'var(--red)';
}

function toneBg(value?: number | null) {
  if (!Number.isFinite(value as number) || value === 0) return 'var(--soft-2)';
  return (value as number) > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(225, 29, 72, 0.1)';
}

function LoadingCard() {
  return (
    <article className="ab-premium-card" style={{ padding: 'clamp(14px, 4vw, 20px)' }}>
      <div className="ab-skeleton" style={{ width: '40%', height: 24 }} />
      <div className="ab-skeleton" style={{ width: '20%', height: 14, marginTop: 8 }} />
      <div className="ab-skeleton" style={{ width: '100%', height: 80, marginTop: 16, borderRadius: 16 }} />
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
          <section className="ab-premium-card" style={{ padding: 14 }}>
            <div className="ab-error">{message}</div>
          </section>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          {(loading ? Array.from({ length: 4 }).map((_, index) => ({ code: String(index) })) : cards).map((card: OilCard | { code: string }) => {
            if (loading) return <LoadingCard key={card.code} />;
            
            const item = card as OilCard;

            return (
              <article key={item.code} className="ab-premium-card" style={{ padding: 'clamp(16px, 4vw, 20px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ab-row-between align-center">
                  <div>
                    <div style={{ fontSize: 'clamp(22px, 5vw, 26px)', fontWeight: 800, fontFamily: '"Playfair Display", serif', color: 'var(--text)' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.06em', marginTop: 4, textTransform: 'uppercase' }}>
                      {item.source}
                    </div>
                  </div>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--soft)', display: 'grid', placeItems: 'center', color: '#3b82f6', border: '1px solid var(--border)' }}>
                    <Droplets size={18} />
                  </div>
                </div>

                <div style={{ background: 'var(--soft)', borderRadius: 18, padding: '16px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    GIÁ BÁN ({item.unit})
                  </div>
                  <div style={{ fontSize: 'clamp(30px, 7vw, 36px)', fontWeight: 800, fontFamily: '"Playfair Display", serif', color: 'var(--text)', marginTop: 4, whiteSpace: 'nowrap' }}>
                    {fmt(item.price)}
                  </div>
                  <div style={{ 
                    display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '4px 10px', 
                    borderRadius: 999, background: toneBg(item.change), color: toneColor(item.change), fontSize: 13, fontWeight: 800 
                  }}>
                    {fmtChange(item.change)}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
