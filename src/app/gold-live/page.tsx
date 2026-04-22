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

// Hàm format linh hoạt: số nguyên dùng chuẩn VN, số thập phân (USD) dùng chuẩn US
const fmt = (v?: number | null, d = 0) => v == null || !Number.isFinite(v) ? 'N/A' : new Intl.NumberFormat(d > 0 ? 'en-US' : 'vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const fmtChange = (v?: number | null, d = 0) => v == null || !Number.isFinite(v) || v === 0 ? '0' : `${v > 0 ? '+' : ''}${fmt(v, d)}`;

function fmtSourceDate(v?: string | null) {
  if (!v || !v.includes('-')) return v || '';
  const [y, m, d] = v.split('-');
  return `${d}/${m}/${y}`;
}

function LoadingCard() {
  return (
    <article className="ab-premium-card" style={{ padding: 16 }}>
      <div className="ab-skeleton" style={{ width: '50%', height: 24 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
        <div className="ab-skeleton" style={{ height: 64, borderRadius: 14 }} />
        <div className="ab-skeleton" style={{ height: 64, borderRadius: 14 }} />
      </div>
    </article>
  );
}

export default function GoldLivePage() {
  const [email, setEmail] = useState('');
  const [cards, setCards] = useState<GoldCard[]>([]);
  const [source, setSource] = useState({ time: '', date: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ''));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/gold-live', { cache: 'no-store' });
        const data: GoldResponse = await response.json();
        if (response.ok) {
          setCards(data.cards || []);
          setSource({ time: data.sourceTime || '', date: data.sourceDate || '' });
        }
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader isLoggedIn={Boolean(email)} email={email} currentTab="gold" onLogout={() => supabase.auth.signOut().then(() => window.location.href = '/')} />
        
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          {loading ? Array.from({ length: 3 }).map((_, i) => <LoadingCard key={i} />) : cards.map((item) => {
            const isWorld = item.code === 'XAUUSD';

            return (
              <article key={item.code} className="ab-premium-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{item.name}</div>
                  <div className="num-premium" style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.04em', marginTop: 2 }}>{item.symbol}</div>
                </div>

                {isWorld ? (
                  // --- GIAO DIỆN CHUẨN CHO VÀNG THẾ GIỚI (1 CỘT DUY NHẤT) ---
                  <div style={{ background: 'var(--soft)', borderRadius: 16, padding: '16px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>GIÁ HIỆN TẠI (USD/oz)</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
                      <div className="num-premium" style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>
                        {fmt(item.sell, 2)}
                      </div>
                      <div className="num-premium" style={{ 
                        fontSize: 14, fontWeight: 800, 
                        color: (item.changeSell || 0) > 0 ? 'var(--green)' : 'var(--red)',
                        background: (item.changeSell || 0) > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                        padding: '4px 10px', borderRadius: 99
                      }}>
                        {fmtChange(item.changeSell, 2)}
                      </div>
                    </div>
                  </div>
                ) : (
                  // --- GIAO DIỆN TRONG NƯỚC (2 CỘT MUA / BÁN) ---
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[ { l: 'MUA VÀO', v: item.buy, c: item.changeBuy }, { l: 'BÁN RA', v: item.sell, c: item.changeSell } ].map((g, i) => (
                      <div key={i} style={{ background: 'var(--soft)', borderRadius: 14, padding: 12, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{g.l}</div>
                        <div className="num-premium" style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: 'var(--text)' }}>
                          {fmt(g.v)}
                        </div>
                        <div className="num-premium" style={{ 
                          fontSize: 12, fontWeight: 800, marginTop: 6,
                          color: (g.c || 0) > 0 ? 'var(--green)' : 'var(--red)'
                        }}>
                          {fmtChange(g.c)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        {!loading && (source.time || source.date) && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12, fontWeight: 700, marginTop: 12 }}>
            <Clock size={13} /> 
            <span>Cập nhật hệ thống: {source.time ? `${source.time} · ` : ''}{fmtSourceDate(source.date)}</span>
          </div>
        )}
      </div>
    </main>
  );
}
