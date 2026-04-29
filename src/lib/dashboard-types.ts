// src/lib/dashboard-types.ts
//
// Shared types, helpers và defaults cho dashboard.
// Tách ra khỏi page.tsx vì Next.js không cho phép export
// bất kỳ thứ gì ngoài default component từ page.tsx.

import type { PriceMap } from '@/lib/calculations';

// =========================================================
// TYPES
// =========================================================

export type QuoteItem = {
  symbol: string; price: number; change: number; pct: number;
};

export type PricesResponse = {
  prices?: PriceMap; debug?: QuoteItem[]; error?: string; cached?: boolean;
};

export type TelegramSettings = {
  chat_id: string; is_enabled: boolean; notify_daily: boolean; daily_hour_vn: number;
};

export type NewsItem = {
  title: string; source: string; pubDate: string; url?: string;
};

export type AiAction = {
  symbol:     string;
  action:     'BUY' | 'HOLD' | 'REDUCE' | 'SELL' | 'WATCH';
  reason:     string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  tp?:        number;
  sl?:        number;
};

export type AiPortfolioResponse = {
  summary:      string;
  actions:      AiAction[];
  risks:        string[];
  newsContext?: Record<string, NewsItem[]>;
  cached?:      boolean;
  error?:       string;
};

export type RiskProfile = 'conservative' | 'balanced' | 'aggressive';

export type CashSummaryShape = {
  calculatedCash: number;
  cashAdjustment: number;
  actualCash:     number;
  netCapital:     number;
};

export type AllocationItem = {
  symbol: string; totalNow: number; percent: number;
};

// =========================================================
// HELPERS
// =========================================================

export async function getAccessToken(): Promise<string> {
  // Dynamic import to avoid issues in non-browser environments
  const { supabase } = await import('@/lib/supabase');
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

export const clampHour = (v: number) =>
  Math.min(23, Math.max(0, Math.floor(Number.isFinite(v) ? v : 15)));

export const vnToUtc = (vn: number)  => (clampHour(vn) - 7 + 24) % 24;
export const utcToVn = (utc: number) => (clampHour(utc) + 7) % 24;

// =========================================================
// DEFAULTS
// =========================================================

export const DEFAULT_TELEGRAM: TelegramSettings = {
  chat_id: '', is_enabled: false, notify_daily: true, daily_hour_vn: 15,
};

export const DEFAULT_TRADE_FORM = {
  symbol: '', price: '', quantity: '', trade_date: '', note: '',
};

export const DEFAULT_CASH_FORM = {
  transaction_type: 'DEPOSIT' as 'DEPOSIT' | 'WITHDRAW',
  amount: '', transaction_date: '', note: '',
};

export const AI_CACHE_KEY = 'lcta_ai_portfolio_result';
