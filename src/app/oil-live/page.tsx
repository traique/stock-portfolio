'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

type OilCard = { code: string; name: string; price: number | null; change: number | null; unit: string; source: string; };
type OilResponse = { cards?: OilCard[]; error?: string };

const fmt = (v?: number | null) => v == null || !Number.isFinite(v) ? 'N/A' : new Intl.NumberFormat('vi-VN').format(v);
const fmtChange = (v?: number | null) => v == null || !Number.isFinite(v) || v === 0 ? '0' : `${v > 0 ? '+' : ''}${fmt(v)}`;
const toneColor = (v?: number | null) => !Number.isFinite(v as number) || v === 0 ? 'var(--muted)' : (v as number) > 0 ? 'var(--green)' : 'var(--red)';
const toneBg = (v?: number | null) => !Number.isFinite(v as number) || v === 0 ? 'var(--soft-2)' : (v as number) > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(225, 29, 72, 0.12)';

function LoadingCard() {
  return (
    <article className="ab-premium-card" style={{ padding: 14 }}>
      <div className="ab-skeleton" style={{ width: '40%', height: 20 }} />
      <div className="ab-skeleton" style={{ width: '100%', height: 50, marginTop: 12, borderRadius: 14 }} />
    </article>
  );
}

export default function OilLivePage() {
  const [email, setEmail] = useState('');
  const [cards, setCards] = useState<OilCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ''));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/oil-live', { cache: 'no-store' });
        const data: OilResponse = await response.json();
        if (response.ok) setCards(data.cards || []);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader title="Giá xăng" isLoggedIn={Boolean(email)} email={email} currentTab="oil" onLogout={() => supabase.auth.signOut().then(() => window.location.href = '/')} />
        
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
          {loading ? Array.from({ length: 6 }).map((_, i) => <LoadingCard key={i} />) : cards.map((item) => (
            <article key={item.code} className="ab-premium-card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.source}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--soft)', padding: '6px 12px', borderRadius: 14, border: '1px solid var(--border)' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-serif)', lineHeight: 1 }}>{fmt(item.price)}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, marginTop: 2 }}>VNĐ/LÍT</div>
                </div>
                <div style={{ padding: '4px 8px', borderRadius: 99, background: toneBg(item.change), color: toneColor(item.change), fontSize: 12, fontWeight: 800 }}>
                  {fmtChange(item.change)}
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
