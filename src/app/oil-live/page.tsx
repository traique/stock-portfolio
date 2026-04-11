'use client';

import { useEffect, useMemo, useState } from 'react';
import { Droplets } from 'lucide-react';
import AppShellHeader from '@/components/app-shell-header';
import { supabase } from '@/lib/supabase';

type OilCard = {
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  unit: string;
  source: string;
  updatedAt: string | null;
};

type OilResponse = {
  cards?: OilCard[];
  effectiveAt?: string | null;
  effectiveLabel?: string | null;
  updatedAt?: string | null;
  error?: string;
};

function formatNumber(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

function formatChange(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 'Không đổi';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value)}`;
}

function getChangeColor(value?: number | null) {
  if (!Number.isFinite(value as number) || value === 0) return 'var(--muted)';
  return (value as number) > 0 ? 'var(--green)' : 'var(--red)';
}

function formatTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function normalizeSource(source: string) {
  if (!source) return 'Nguồn: không rõ';
  if (source.toLowerCase() === 'petrolimex') return 'Nguồn: Petrolimex';
  return `Nguồn: ${source}`;
}

export default function OilLivePage() {
  const [email, setEmail] = useState('');
  const [cards, setCards] = useState<OilCard[]>([]);
  const [effectiveLabel, setEffectiveLabel] = useState<string | null>(null);
  const [effectiveAt, setEffectiveAt] = useState<string | null>(null);
  const [providerUpdatedAt, setProviderUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ''));
  }, []);

  useEffect(() => {
    const loadOil = async () => {
      setLoading(true);
      setMessage('');

      try {
        const response = await fetch('/api/oil-live', { cache: 'no-store' });
        const data: OilResponse = await response.json();

        if (!response.ok) {
          setMessage(data.error || 'Không lấy được dữ liệu giá xăng');
          setCards([]);
          return;
        }

        setCards(data.cards || []);
        setEffectiveLabel(data.effectiveLabel || null);
        setEffectiveAt(data.effectiveAt || null);
        setProviderUpdatedAt(data.updatedAt || null);
      } catch {
        setMessage('Lỗi kết nối dữ liệu giá xăng');
        setCards([]);
      } finally {
        setLoading(false);
      }
    };

    void loadOil();
  }, []);

  const fallbackUpdatedLabel = useMemo(() => {
    return formatTime(effectiveAt) || formatTime(providerUpdatedAt) || null;
  }, [effectiveAt, providerUpdatedAt]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader
          title="Giá xăng"
          isLoggedIn={Boolean(email)}
          email={email}
          currentTab="oil"
          onLogout={handleLogout}
        />

        {message ? (
          <section className="ab-premium-card">
            <div className="ab-error">{message}</div>
          </section>
        ) : null}

        <section className="ab-position-grid">
          {(loading ? Array.from({ length: 7 }).map((_, idx) => ({ code: String(idx) })) : cards).map((card: OilCard | { code: string }) => {
            if (loading) {
              return (
                <article key={card.code} className="ab-premium-card ab-position-card ab-skeleton-card">
                  <div className="ab-skeleton skeleton-title" />
                  <div className="ab-skeleton skeleton-price" />
                  <div className="ab-skeleton skeleton-line short" />
                </article>
              );
            }

            const item = card as OilCard;
            const updatedLabel = effectiveLabel || formatTime(item.updatedAt) || fallbackUpdatedLabel || 'Đang cập nhật';

            return (
              <article key={item.code} className="ab-premium-card ab-position-card">
                <div className="ab-row-between align-start">
                  <div>
                    <div className="ab-symbol premium">{item.name}</div>
                    <div className="ab-soft-label" style={{ marginTop: 8 }}>
                      {normalizeSource(item.source)}
                    </div>
                  </div>
                  <div className="ab-stat-chip">
                    <Droplets size={16} />
                  </div>
                </div>

                <div className="ab-price premium" style={{ fontSize: 34 }}>
                  {formatNumber(item.price)}
                </div>
                <div className="ab-soft-label" style={{ marginTop: 10 }}>
                  {item.unit}
                </div>
                <div className="ab-soft-change under-price" style={{ color: getChangeColor(item.change) }}>
                  {formatChange(item.change)}
                </div>
                <div className="ab-soft-label" style={{ marginTop: 10 }}>
                  Thời điểm đổi giá: {updatedLabel}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
      }
