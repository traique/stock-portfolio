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
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 'Không đổi';
  const sign = value > 0 ? '+' : '';
  return `${sign}${fmt(value)}`;
}

function tone(value?: number | null) {
  if (!Number.isFinite(value as number) || value === 0) return 'var(--muted)';
  return (value as number) > 0 ? 'var(--green)' : 'var(--red)';
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
        <AppShellHeader title="Giá xăng" isLoggedIn={Boolean(email)} email={email} currentTab="oil" onLogout={handleLogout} />
        {message ? <section className="ab-premium-card"><div className="ab-error">{message}</div></section> : null}
        <section className="ab-position-grid">
          {(loading ? Array.from({ length: 7 }).map((_, index) => ({ code: String(index) })) : cards).map((card: OilCard | { code: string }) => {
            if (loading) {
              return <article key={card.code} className="ab-premium-card ab-position-card ab-skeleton-card"><div className="ab-skeleton skeleton-title" /><div className="ab-skeleton skeleton-price" /><div className="ab-skeleton skeleton-line short" /></article>;
            }
            const item = card as OilCard;
            return (
              <article key={item.code} className="ab-premium-card ab-position-card">
                <div className="ab-row-between align-start">
                  <div>
                    <div className="ab-symbol premium">{item.name}</div>
                    <div className="ab-soft-label" style={{ marginTop: 8 }}>{item.source}</div>
                  </div>
                  <div className="ab-stat-chip"><Droplets size={16} /></div>
                </div>
                <div className="ab-price premium" style={{ fontSize: 34 }}>{fmt(item.price)}</div>
                <div className="ab-soft-label" style={{ marginTop: 10 }}>{item.unit}</div>
                <div className="ab-soft-change under-price" style={{ color: tone(item.change) }}>{fmtChange(item.change)}</div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
