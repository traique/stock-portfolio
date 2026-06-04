'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

export type RiskProfile = 'conservative' | 'balanced' | 'aggressive';

export type NewsItem = {
  title:   string;
  source:  string;
  pubDate: string;
  url?:    string;
};

export type AiPick = {
  symbol:            string;
  score:             number;
  reason:            string;
  entry:             number;
  tp:                number;
  sl:                number;
  // ✨ mozy lesson 1 — richer decision schema
  time_sensitivity?:  string;
  position_advice?:   { no_position: string; has_position: string };
  action_checklist?:  string[];
  sniper_points?:     { ideal_buy: string; secondary_buy: string; stop_loss: string; take_profit: string };
  // ✨ mozy lesson 4+5 — technical context
  trend_score?:       number;
  bias_status?:       string;
  ma_alignment?:      string;
  support?:           number | null;
  resistance?:        number | null;
};

export type AiWatchlistResponse = {
  summary:             string;
  picks:               AiPick[];
  avoid:               string[];
  newsContext?:        Record<string, NewsItem[]>;
  cached?:             boolean;
  cache_ttl_seconds?:  number;
  cached_at?:          string;
  error?:              string;
  ai_fallback?:        boolean;
  ai_fallback_reason?: string;
  ai_model_used?:      string;
};

const getAiWatchlistKey = (userId?: string) =>
  `lcta_ai_watchlist_${userId ?? 'guest'}`;

// ── Hook ─────────────────────────────────────────────────────────────────────

export type UseAiWatchlistReturn = {
  aiWatchlist:  AiWatchlistResponse | null;
  aiLoading:    boolean;
  aiError:      string;
  riskProfile:  RiskProfile;
  aiModel:      string;
  setRiskProfile: (v: RiskProfile) => void;
  runScan:      () => Promise<void>;
};

export function useAiWatchlist(
  userId:    string,
  watchlist: string[],
): UseAiWatchlistReturn {
  const [aiWatchlist,  setAiWatchlist]  = useState<AiWatchlistResponse | null>(null);
  const [aiLoading,    setAiLoading]    = useState(false);
  const [aiError,      setAiError]      = useState('');
  const [riskProfile,  setRiskProfile]  = useState<RiskProfile>('balanced');
  const [aiModel,      setAiModel]      = useState('llama-3.3-70b-versatile');

  // Load AI model preference + listen for changes from header
  useEffect(() => {
    const saved = localStorage.getItem('lcta_ai_model');
    if (saved) setAiModel(saved);
    const handler = (e: Event) => {
      const model = (e as CustomEvent<{ model: string }>).detail.model;
      setAiModel(model);
    };
    window.addEventListener('lcta:ai-model-change', handler);
    return () => window.removeEventListener('lcta:ai-model-change', handler);
  }, []);

  // Restore from localStorage — only once userId is known
  useEffect(() => {
    if (!userId) return;
    const saved = localStorage.getItem(getAiWatchlistKey(userId));
    if (!saved) return;
    try { setAiWatchlist(JSON.parse(saved)); } catch {}
  }, [userId]);

  // Persist to localStorage on change
  useEffect(() => {
    if (!userId || !aiWatchlist) return;
    localStorage.setItem(getAiWatchlistKey(userId), JSON.stringify(aiWatchlist));
  }, [aiWatchlist, userId]);

  // ── Performance: stale-while-revalidate ───────────────────────────────────
  // Khi scan: hiển thị cache cũ ngay lập tức (không loading),
  // đồng thời gọi API eod ở background — khi xong mới replace.
  const fetchScan = useCallback(async (forceEod = false) => {
    if (!watchlist.length) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? '';

    // Nếu đã có cache → dùng intraday mode trước (instant, skip AI)
    const hasCache = !!aiWatchlist;
    const mode     = (!hasCache || forceEod) ? 'eod' : 'intraday';

    if (mode === 'eod') setAiLoading(true);

    try {
      const res = await fetch('/api/ai/watchlist-scan', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          symbols:        watchlist,
          risk_profile:   riskProfile,
          force_refresh:  forceEod,
          model:          aiModel,
          pipeline_mode:  mode,
        }),
      });
      const payload: AiWatchlistResponse = await res.json();
      if (!res.ok) setAiError(payload?.error ?? 'Không thể phân tích watchlist');
      else         setAiWatchlist(payload);
    } catch {
      if (mode === 'eod') setAiError('Không thể kết nối với dịch vụ AI.');
    } finally {
      if (mode === 'eod') setAiLoading(false);
    }
  }, [watchlist, riskProfile, aiModel, aiWatchlist]);

  // runScan: force EOD — gọi từ nút QUÉT
  const runScan = useCallback(() => fetchScan(true), [fetchScan]);

  // Auto-refresh intraday mỗi 5 phút khi đang có cache
  useEffect(() => {
    if (!aiWatchlist || !watchlist.length) return;
    const interval = setInterval(() => fetchScan(false), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [aiWatchlist, watchlist.length, fetchScan]);

  return { aiWatchlist, aiLoading, aiError, riskProfile, aiModel, setRiskProfile, runScan };
}
