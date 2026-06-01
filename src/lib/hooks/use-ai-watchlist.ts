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
  symbol: string;
  score:  number;
  reason: string;
  entry:  number;
  tp:     number;
  sl:     number;
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

  const runScan = useCallback(async () => {
    if (!watchlist.length) return;
    setAiLoading(true);
    setAiError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';
      const res = await fetch('/api/ai/watchlist-scan', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          symbols:       watchlist,
          risk_profile:  riskProfile,
          force_refresh: true,
          model:         aiModel,
        }),
      });
      const payload: AiWatchlistResponse = await res.json();
      if (!res.ok) setAiError(payload?.error ?? 'Không thể phân tích watchlist');
      else         setAiWatchlist(payload);
    } catch {
      setAiError('Không thể kết nối với dịch vụ AI.');
    } finally {
      setAiLoading(false);
    }
  }, [watchlist, riskProfile, aiModel]);

  return { aiWatchlist, aiLoading, aiError, riskProfile, aiModel, setRiskProfile, runScan };
}
