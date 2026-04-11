'use client';

import { useEffect, useState } from 'react';
import { Gem } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

type GoldCard = {
  code: 'SJL1L10' | 'SJ9999' | 'XAUUSD';
  name: string;
  symbol: string;
  buy: number | null;
  sell: number | null;
  changeBuy: number | null;
  changeSell: number | null;
  updatedAt: string | null;
  unit: string;
};

type GoldResponse = { cards?: GoldCard[]; error?: string };

function fmt(value?: number | null, decimal = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: decimal, maximumFractionDigits: decimal }).format(value);
}

function fmtChange(value?: number | null, decimal = 0) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 'Không đổi';
  const sign = value > 0 ? '+' : '';
  return `${sign}${fmt(value, decimal)}`;
}

function tone(value?: number | null) {
  if (!Number.isFinite(value as number) || value === 0) return 'var(--muted)';
  return (value as number) > 0 ? 'var(--green)' : 'var(--red)';
}

function fmtUpdated(value?: string | null) {
  if (!value) return 'Đang cập nhật';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Đang cập nhật';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

export default function GoldLivePage() {
  const [email, setEmail] = useState('');
  const [cards, setCards] = useState<GoldCard[]>([]);
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
        const response = await fetch('/api/gold-live', { cache: 'no-store' });
        const data: GoldResponse = await response.json();
        if (!response.ok) setMessage(data?.error || 'Không lấy được dữ liệu giá vàng');
        else setCards(data.cards || []);
      } catch {
        setMessage('Lỗi kết nối dữ liệu giá vàng');
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
        <AppShellHeader title="Giá vàng" isLoggedIn={Boolean(email)} email={email} currentTab="gold" onLogout={handleLogout} />
        {message ? <section className="ab-premium-card"><div className="ab-error">{message}</div></section> : null}
        <section className="ab-position-grid">
          {(loading ? Array.from({ length: 3 }).map((_, index) => ({ code: String(index) })) : cards).map((card: GoldCard | { code: string }) => {
            if (loading) {
              return <article key={card.code} className="ab-premium-card ab-position-card ab-skeleton-card"><div className="ab-skeleton skeleton-title" /><div className="ab-skeleton skeleton-price" /><div className="ab-skeleton skeleton-line" /></article>;
            }
            const item = card as GoldCard;
            const isWorld = item.code === 'XAUUSD';
            return (
              <article key={item.code} className="ab-premium-card ab-position-card">
                <div className="ab-row-between align-start">
                  <div>
                    <div className="ab-symbol premium">{item.name}</div>
                    <div className="ab-soft-label" style={{ marginTop: 8 }}>{item.symbol}</div>
                  </div>
                  <div className="ab-stat-chip"><Gem size={16} /></div>
                </div>
                {isWorld ? (
                  <div className="ab-mini-card premium" style={{ marginTop: 16 }}>
                    <div className="ab-soft-label">Giá hiện tại</div>
                    <div className="ab-price premium" style={{ fontSize: 32, marginTop: 10 }}>{fmt(item.sell, 2)}</div>
                    <div className="ab-soft-change under-price" style={{ color: tone(item.changeSell) }}>{fmtChange(item.changeSell, 2)}</div>
                    <div className="ab-soft-label" style={{ marginTop: 10 }}>Cập nhật: {fmtUpdated(item.updatedAt)}</div>
                  </div>
                ) : (
                  <div className="ab-mini-grid premium" style={{ marginTop: 16 }}>
                    <div className="ab-mini-card premium">
                      <div className="ab-soft-label">Mua vào</div>
                      <div className="ab-mini-value" style={{ fontSize: 22 }}>{fmt(item.buy)}</div>
                      <div className="ab-soft-change under-price" style={{ color: tone(item.changeBuy) }}>{fmtChange(item.changeBuy)}</div>
                    </div>
                    <div className="ab-mini-card premium">
                      <div className="ab-soft-label">Bán ra</div>
                      <div className="ab-mini-value" style={{ fontSize: 22 }}>{fmt(item.sell)}</div>
                      <div className="ab-soft-change under-price" style={{ color: tone(item.changeSell) }}>{fmtChange(item.changeSell)}</div>
                    </div>
                  </div>
                )}
                {!isWorld ? <div className="ab-soft-label" style={{ marginTop: 12 }}>Cập nhật: {fmtUpdated(item.updatedAt)}</div> : null}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
    }
