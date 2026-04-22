'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
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

const fmt = (v?: number | null, d = 0) => v == null || !Number.isFinite(v) ? 'N/A' : new Intl.NumberFormat('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const fmtChange = (v?: number | null, d = 0) => v == null || !Number.isFinite(v) || v === 0 ? '0' : `${v > 0 ? '+' : ''}${fmt(v, d)}`;
const toneColor = (v?: number | null) => !Number.isFinite(v as number) || v === 0 ? 'var(--muted)' : (v as number) > 0 ? 'var(--green)' : 'var(--red)';
const toneBg = (v?: number | null) => !Number.isFinite(v as number) || v === 0 ? 'var(--soft-2)' : (v as number) > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(225, 29, 72, 0.12)';

function fmtSourceDate(v?: string | null) {
  if (!v || !v.includes('-')) return v || '';
  const [y, m, d] = v.split('-');
  return `${d}/${m}/${y}`;
}

function LoadingCard() {
  return (
    <article className="ab-premium-card" style={{ padding: 14 }}>
      <div className="ab-skeleton" style={{ width: '40%', height: 20 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <div className="ab-skeleton" style={{ height: 60, borderRadius: 14 }} />
        <div className="ab-skeleton" style={{ height: 60, borderRadius: 14 }} />
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
      try {
        const response = await fetch('/api/gold-live', { cache: 'no-store' });
        const data: GoldResponse = await response.json();
        if (!response.ok) setMessage(data?.error || 'Lỗi dữ liệu');
        else {
          setCards(data.cards || []);
          setSourceTime(data.sourceTime || null);
          setSourceDate(data.sourceDate || null);
        }
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader title="Giá vàng" isLoggedIn={Boolean(email)} email={email} currentTab="gold" onLogout={() => supabase.auth.signOut().then(() => window.location.href = '/')} />
        
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          {loading ? Array.from({ length: 3 }).map((_, i) => <LoadingCard key={i} />) : cards.map((item) => (
            <article key={item.code} className="ab-premium-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>{item.name}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em' }}>{item.symbol}</div>
              </div>

              {item.code === 'XAUUSD' ? (
                <div style={{ background: 'var(--soft)', borderRadius: 14, padding: '12px 14px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 800 }}>THẾ GIỚI (USD/oz)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-serif)', whiteSpace: 'nowrap' }}>{fmt(item.sell, 2)}</span>
                    <span style={{ padding: '3px 8px', borderRadius: 99, background: toneBg(item.changeSell), color: toneColor(item.changeSell), fontSize: 12, fontWeight: 800 }}>{fmtChange(item.changeSell, 2)}</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[ { l: 'MUA VÀO', v: item.buy, c: item.changeBuy }, { l: 'BÁN RA', v: item.sell, c: item.changeSell } ].map((g, idx) => (
                    <div key={idx} style={{ background: 'var(--soft)', borderRadius: 14, padding: 10, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 800 }}>{g.l}</div>
                      <div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-serif)', marginTop: 2, whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>{fmt(g.v)}</div>
                      <div style={{ display: 'inline-block', marginTop: 6, padding: '2px 8px', borderRadius: 99, background: toneBg(g.c), color: toneColor(g.c), fontSize: 11, fontWeight: 800 }}>{fmtChange(g.c)}</div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </section>

        {/* CẬP NHẬT DƯỚI CÙNG TRANG */}
        {!loading && (sourceTime || sourceDate) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--muted)', fontSize: 12, fontWeight: 600, padding: '10px 0' }}>
            <Clock size={13} />
            <span>Cập nhật hệ thống: {sourceTime} · {fmtSourceDate(sourceDate)}</span>
          </div>
        )}
      </div>
    </main>
  );
}
