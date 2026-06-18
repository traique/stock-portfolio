// src/app/api/ai/models/route.ts
//
// Trả về danh sách model AI khả dụng, fetch live từ Gemini + Groq.
// Cache 1 giờ — danh sách model hiếm khi thay đổi, không cần gọi lại liên tục.
//
// GET /api/ai/models
// Response: { models: AiModelMeta[], cached: boolean, fetchedAt: string }

import { NextResponse } from 'next/server';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AiProvider = 'gemini' | 'groq';

export type AiModelMeta = {
  key:      string;
  label:    string;
  provider: AiProvider;
  badge:    string;
  desc:     string;
};

type CacheEntry = {
  models:    AiModelMeta[];
  fetchedAt: string;
  expiresAt: number;
};

// ─── In-memory cache (1 giờ) ─────────────────────────────────────────────────

const globalForModels = globalThis as typeof globalThis & {
  __aiModelsCache__?: CacheEntry;
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 giờ

// ─── Fetch từ Gemini ──────────────────────────────────────────────────────────

async function fetchGeminiModels(): Promise<AiModelMeta[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  try {
    // Lưu ý: ghép URL bằng chuỗi để tránh lỗi copy — endpoint thật là
    // https://generativelanguage.googleapis.com/v1beta/models?key=<API_KEY>&pageSize=100
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models'
      + '?key=' + apiKey + '&pageSize=100';
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];

    const data = await res.json();
    const rawModels: Array<{
      name: string;
      displayName: string;
      supportedGenerationMethods: string[];
      description?: string;
    }> = data.models ?? [];

    return rawModels
      .filter(m =>
        m.supportedGenerationMethods?.includes('generateContent') &&
        !m.name.includes('embedding') &&
        !m.name.includes('aqa') &&
        !m.name.includes('legacy') &&
        !m.name.includes('tts') &&
        !m.name.includes('tuned') &&
        !m.name.includes('vision') &&
        !m.name.includes('preview'),
      )
      .map(m => {
        const key = m.name.replace('models/', '');
        const isFlash    = key.includes('flash');
        const isThinking = key.includes('thinking') || key.includes('exp');
        const isPro      = key.includes('pro');
        const isGemma    = key.includes('gemma');

        const badge = isThinking ? '🧠 Suy luận'
          : isPro              ? '💎 Pro'
          : isFlash            ? '⚡ Nhanh'
          : isGemma            ? '🔓 Open'
          : '✨ Mới';

        const desc = isThinking
          ? 'Google · Phân tích sâu · Chậm hơn'
          : isPro
          ? 'Google · Chất lượng cao · Free tier giới hạn'
          : 'Google · Free tier · Quota cao';

        return { key, label: m.displayName ?? key, provider: 'gemini' as const, badge, desc };
      });
  } catch {
    return [];
  }
}

// ─── Fetch từ Groq ────────────────────────────────────────────────────────────

async function fetchGroqModels(): Promise<AiModelMeta[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    // ❌ ĐÃ BỎ mixtral-8x7b-32768 (deprecated → 404). Chỉ giữ model còn sống.
    return [
      { key: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B',        provider: 'groq' as const, badge: '🏆 Mạnh nhất',  desc: 'Groq · Meta · Đa năng · 128K' },
      { key: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B Instant', provider: 'groq' as const, badge: '⚡ Nhanh nhất', desc: 'Groq · Meta · Cực nhanh · 128K' },
    ];
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const rawModels: Array<{
      id: string;
      active?: boolean;
      context_window?: number;
    }> = data.data ?? [];

    return rawModels
      .filter(m =>
        m.active !== false &&
        !m.id.includes('whisper') &&
        !m.id.includes('vision') &&
        !m.id.includes('tts'),
      )
      .map(m => {
        const key = m.id;
        const ctx = m.context_window;

        const isLlama   = key.includes('llama');
        const isMixtral = key.includes('mixtral');
        const isGemma   = key.includes('gemma');
        const is70b     = key.includes('70b');
        const is8b      = key.includes('8b');

        const badge = is70b   ? '🏆 Mạnh nhất'
          : isMixtral         ? 'Context lớn'
          : is8b              ? '⚡ Nhanh nhất'
          : isGemma           ? '🔓 Open'
          : 'Mặc định';

        const ctxLabel = ctx ? ` · Context ${ctx >= 1_000_000 ? `${ctx / 1_000_000}M` : `${ctx / 1000}K`}` : '';

        const desc = isLlama ? `Groq · Meta${ctxLabel}`
          : isMixtral        ? `Groq · Mistral${ctxLabel}`
          : isGemma          ? `Groq · Google Open${ctxLabel}`
          : `Groq${ctxLabel}`;

        const label = key
          .split('-')
          .map(w => /^\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
          .replace(/\b(\d+)B\b/g, '$1B');

        return { key, label, provider: 'groq' as const, badge, desc };
      });
  } catch {
    return [];
  }
}

// ─── Fallback nếu cả 2 API đều fail ──────────────────────────────────────────
// ❌ ĐÃ BỎ mixtral-8x7b-32768.

const FALLBACK_MODELS: AiModelMeta[] = [
  { key: 'gemini-2.0-flash',        label: 'Gemini 2.0 Flash',     provider: 'gemini', badge: '⚡ Nhanh',      desc: 'Google · Free tier · Quota cao' },
  { key: 'gemini-1.5-flash',        label: 'Gemini 1.5 Flash',     provider: 'gemini', badge: 'Ổn định',       desc: 'Google · Ổn định · Context 1M token' },
  { key: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B',        provider: 'groq',   badge: '🏆 Mạnh nhất',  desc: 'Groq · Meta · Đa năng' },
  { key: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B Instant', provider: 'groq',   badge: '⚡ Nhanh nhất', desc: 'Groq · Cực nhanh' },
];

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET() {
  // Trả cache nếu còn hạn
  const cached = globalForModels.__aiModelsCache__;
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json({ models: cached.models, cached: true, fetchedAt: cached.fetchedAt });
  }

  // Fetch song song từ 2 provider
  const [geminiModels, groqModels] = await Promise.all([
    fetchGeminiModels(),
    fetchGroqModels(),
  ]);

  const models = geminiModels.length || groqModels.length
    ? [...geminiModels, ...groqModels]
    : FALLBACK_MODELS;

  const fetchedAt = new Date().toISOString();

  globalForModels.__aiModelsCache__ = {
    models,
    fetchedAt,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return NextResponse.json({ models, cached: false, fetchedAt });
}
