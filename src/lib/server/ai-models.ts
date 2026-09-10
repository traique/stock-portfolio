// src/lib/server/ai-models.ts
//
// Danh sách model được fetch live từ /api/ai/models (Gemini + Groq API).
// File này chỉ giữ: fallback tĩnh, default key, helper, và DENYLIST model chết.
// Không hardcode model key sống ở đây — tránh nhầm tên model đã deprecated.

export type AiProvider = 'gemini' | 'groq';

export type AiModelMeta = {
  key:      string;
  label:    string;
  provider: AiProvider;
  badge:    string;
  desc:     string;
};

// Fallback dùng khi /api/ai/models không gọi được (offline, key chưa set...)
// ❌ ĐÃ BỎ mixtral-8x7b-32768 — Groq khai tử model này → callGroq trả HTTP 404.
export const FALLBACK_MODELS: AiModelMeta[] = [
  { key: 'gemini-2.0-flash',        label: 'Gemini 2.0 Flash',     provider: 'gemini', badge: '⚡ Nhanh',      desc: 'Google · Free tier · Quota cao' },
  { key: 'gemini-1.5-flash',        label: 'Gemini 1.5 Flash',     provider: 'gemini', badge: 'Ổn định',       desc: 'Google · Ổn định · Context 1M token' },
  { key: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B',        provider: 'groq',   badge: '🏆 Mạnh nhất',  desc: 'Groq · Meta · Đa năng' },
  { key: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B Instant', provider: 'groq',   badge: '⚡ Nhanh nhất', desc: 'Groq · Cực nhanh' },
];

export type AiModelKey = string;

export const DEFAULT_MODEL  = 'llama-3.3-70b-versatile';
export const FALLBACK_MODEL = 'llama-3.3-70b-versatile';

// 🚫 Model đã chết / deprecated — KHÔNG BAO GIỜ pass validation,
//    kể cả khi còn nằm trong localStorage cũ của user hay fallback list.
export const DEPRECATED_KEYS = new Set<string>([
  'mixtral-8x7b-32768',
  'gemma-7b-it',
  'llama-3.1-70b-versatile',
  'llama-3.3-70b-specdec',
  'llama3-groq-70b-8192-tool-use-preview',
]);

export function getModelMeta(
  key: string,
  models: AiModelMeta[] = FALLBACK_MODELS,
): AiModelMeta {
  return (
    models.find(m => m.key === key) ??
    models.find(m => m.key === FALLBACK_MODEL) ??
    models[0]
  );
}

export function isValidModelKey(key: string, liveModels?: AiModelMeta[]): boolean {
  if (!key || DEPRECATED_KEYS.has(key)) return false;

  // Có list live (fetch từ /api/ai/models) → chỉ chấp nhận key CÓ THẬT trong list.
  if (liveModels && liveModels.length > 0) {
    return liveModels.some(m => m.key === key);
  }

  // Không có list live → fallback tĩnh + prefix provider (đã bỏ mixtral).
  if (FALLBACK_MODELS.some(m => m.key === key)) return true;
  return /^(gemini-|llama-|gemma-|deepseek-|qwen-)/.test(key);
}
