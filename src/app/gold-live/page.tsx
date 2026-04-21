'use client';

import { useEffect, useState } from 'react';
import { Gem, Clock } from 'lucide-react';
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

type GoldResponse = { cards?: GoldCard[]; sourceTime?: string | null; sourceDate?: string | null; error?: string };

function fmt(value?: number | null, decimal = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: decimal, maximumFractionDigits: decimal }).format(value);
}

function fmtChange(value?: number | null, decimal = 0) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return '0';
  const sign = value > 0 ? '+' : '';
  return `${sign}${fmt(value, decimal)}`;
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

function fmtSourceDate(value?: string | null) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function fmtUpdated(value?: string | null, sourceDate?: string | null, sourceTime?: string | null) {
  if (sourceDate && sourceTime) return `${sourceTime} · ${fmtSourceDate(sourceDate)}`;
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

function LoadingCard() {
  return (
    <article className="ab-premium-card" style={{ padding: 24 }}>
      <div className="ab-skeleton" style={{ width: '50%', height: 28 }} />
      <div className="ab-skeleton" style={{ width: '30%', height: 16, marginTop: 8 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
        <div className="ab-skeleton" style={{ width: '100%', height: 80, borderRadius: 20 }} />
        <div className="ab-skeleton" style={{ width: '100%', height: 80, borderRadius: 20 }} />
      </div>
    </article>
  );
}

export default function GoldLivePage() {
  const [email, setEmail] = useState('');
  const [cards, setCards] = useState<GoldCard[]>([]);
  const [sourceTime, setSourceTime] = useState<string | null>(null);
  const [sourceDate, setSourceDate] = useState<string | null>(null);
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
        else {
          setCards(data.cards || []);
          setSourceTime(data.sourceTime || null);
          setSourceDate(data.sourceDate || null);
        }
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
        <AppShellHeader title="Giá vàng trực tuyến" isLoggedIn={Boolean(email)} email={email} currentTab="gold" onLogout={handleLogout} />
        
        {message && (
          <section className="ab-premium-card" style={{ padding: 16 }}>
            <div className="ab-error">{message}</div>
          </section>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {(loading ? Array.from({ length: 3 }).map((_, index) => ({ code: String(index) })) : cards).map((card: GoldCard | { code: string }) => {
            if (loading) return <LoadingCard key={card.code} />;
            
            const item = card as GoldCard;
            const isWorld = item.code === 'XAUUSD';

            return (
              <article key={item.code} className="ab-premium-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* --- HEADER KHỐI --- */}
                <div className="ab-row-between align-center">
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 800, fontFamily: '"Playfair Display", serif', color: 'var(--text)' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', marginTop: 4 }}>
                      {item.symbol}
                    </div>
                  </div>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--soft)', display: 'grid', placeItems: 'center', color: 'var(--yellow)', border: '1px solid var(--border)' }}>
                    <Gem size={22} />
                  </div>
                </div>

                {/* --- LƯỚI GIÁ --- */}
                {isWorld ? (
                  <div style={{ background: 'var(--soft)', borderRadius: 20, padding: 20, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.02em' }}>GIÁ HIỆN TẠI (USD/oz)</div>
                    <div style={{ fontSize: 36, fontWeight: 800, fontFamily: '"Playfair Display", serif', color: 'var(--text)', marginTop: 6 }}>
                      {fmt(item.sell, 2)}
                    </div>
                    <div style={{ 
                      display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '6px 12px', 
                      borderRadius: 999, background: toneBg(item.changeSell), color: toneColor(item.changeSell), fontSize: 14, fontWeight: 800 
                    }}>
                      {fmtChange(item.changeSell, 2)}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {/* Cột Mua Vào */}
                    <div style={{ background: 'var(--soft)', borderRadius: 20, padding: 16, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.02em' }}>MUA VÀO</div>
                      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: '"Playfair Display", serif', color: 'var(--text)', marginTop: 6, wordBreak: 'break-word' }}>
                        {fmt(item.buy)}
                      </div>
                      <div style={{ 
                        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '4px 10px', 
                        borderRadius: 999, background: toneBg(item.changeBuy), color: toneColor(item.changeBuy), fontSize: 13, fontWeight: 800 
                      }}>
                        {fmtChange(item.changeBuy)}
                      </div>
                    </div>

                    {/* Cột Bán Ra */}
                    <div style={{ background: 'var(--soft)', borderRadius: 20, padding: 16, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.02em' }}>BÁN RA</div>
                      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: '"Playfair Display", serif', color: 'var(--text)', marginTop: 6, wordBreak: 'break-word' }}>
                        {fmt(item.sell)}
                      </div>
                      <div style={{ 
                        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '4px 10px', 
                        borderRadius: 999, background: toneBg(item.changeSell), color: toneColor(item.changeSell), fontSize: 13, fontWeight: 800 
                      }}>
                        {fmtChange(item.changeSell)}
                      </div>
                    </div>
                  </div>
                )}

                {/* --- FOOTER CẬP NHẬT --- */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, color: 'var(--muted)', fontSize: 12, fontWeight: 600, marginTop: 'auto' }}>
                  <Clock size={14} />
                  <span>{fmtUpdated(item.updatedAt, sourceDate, sourceTime)}</span>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
