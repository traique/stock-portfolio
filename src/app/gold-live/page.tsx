'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

export default function GoldLivePage() {
  const [cards, setCards] = useState<any[]>([]);
  const [source, setSource] = useState({ time: '', date: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/gold-live').then(res => res.json()).then(data => {
      setCards(data.cards || []);
      setSource({ time: data.sourceTime, date: data.sourceDate });
      setLoading(false);
    });
  }, []);

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader currentTab="gold" isLoggedIn={true} />
        
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          {cards.map(item => (
            <article key={item.code} className="ab-premium-card" style={{ padding: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{item.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[ { l: 'MUA', v: item.buy, c: item.changeBuy }, { l: 'BÁN', v: item.sell, c: item.changeSell } ].map((g, i) => (
                  <div key={i} style={{ background: 'var(--bg)', borderRadius: 14, padding: 10, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 800 }}>{g.l}</div>
                    <div className="num-premium" style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{new Intl.NumberFormat('vi-VN').format(g.v || 0)}</div>
                    <div className="num-premium" style={{ fontSize: 11, fontWeight: 800, color: (g.c || 0) > 0 ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
                      {(g.c || 0) > 0 ? '+' : ''}{new Intl.NumberFormat('vi-VN').format(g.c || 0)}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>

        {!loading && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, color: 'var(--muted)', fontSize: 11, fontWeight: 700, marginTop: 20 }}>
            <Clock size={12} /> CẬP NHẬT: {source.time} · {source.date}
          </div>
        )}
      </div>
    </main>
  );
}
