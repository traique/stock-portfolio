// src/lib/server/ai-models.ts
//
// Danh sách model được fetch live từ /api/ai/models (Gemini + Groq API).
// File này chỉ giữ: fallback tĩnh, default key, và helper functions.
// Không hardcode model key ở đây nữa — tránh nhầm tên model đã deprecated.

export type AiProvider = 'gemini' | 'groq';

export type AiModelMeta = {
  key:      string;
  label:    string;
  provider: AiProvider;
  badge:    string;
  desc:     string;
};

// Fallback dùng khi /api/ai/models không gọi được (offline, key chưa set...)
export const FALLBACK_MODELS: AiModelMeta[] = [
  { key: 'gemini-2.0-flash',        label: 'Gemini 2.0 Flash',     provider: 'gemini', badge: '⚡ Nhanh',      desc: 'Google · Free tier · Quota cao' },
  { key: 'gemini-1.5-flash',        label: 'Gemini 1.5 Flash',     provider: 'gemini', badge: 'Ổn định',       desc: 'Google · Ổn định · Context 1M token' },
  { key: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B',        provider: 'groq',   badge: '🏆 Mạnh nhất',  desc: 'Groq · Meta · Đa năng' },
  { key: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B Instant', provider: 'groq',   badge: '⚡ Nhanh nhất', desc: 'Groq · Cực nhanh' },
  { key: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B',         provider: 'groq',   badge: 'Context lớn',   desc: 'Groq · Mistral · Context 32K' },
];

export type AiModelKey = string;

export const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
export const FALLBACK_MODEL = 'llama-3.3-70b-versatile';

export function getModelMeta(key: string, models: AiModelMeta[] = FALLBACK_MODELS): AiModelMeta {
  return models.find(m => m.key === key) ?? models.find(m => m.key === FALLBACK_MODEL) ?? models[0];
}

export function isValidModelKey(key: string, models: AiModelMeta[] = FALLBACK_MODELS): boolean {
  // First check against the known static list
  if (models.some(m => m.key === key)) return true;
  // Accept any key that matches a known provider prefix — handles live model keys
  // returned from /api/ai/models that may not be in the static FALLBACK_MODELS list
  // (e.g. "gemini-2.5-flash", "llama-3.1-70b-specdec", etc.)
  return (
    /^gemini-/.test(key) ||
    /^llama-/.test(key) ||
    /^mixtral-/.test(key) ||
    /^gemma/.test(key) ||
    /^deepseek/.test(key) ||
    /^qwen/.test(key)
  );
}
