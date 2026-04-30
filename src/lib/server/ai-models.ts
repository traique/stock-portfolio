// src/lib/server/ai-models.ts
// Danh sách model AI free tier được hỗ trợ.
// Thêm model mới vào đây — không cần sửa logic ở chỗ khác.

export const AI_MODELS = [
  {
    key:      'gemini-2.0-flash',
    label:    'Gemini 2.0 Flash',
    provider: 'gemini' as const,
    badge:    '⚡ Nhanh',
    desc:     'Google · Quota cao · Recommended',
  },
  {
    key:      'gemini-1.5-flash',
    label:    'Gemini 1.5 Flash',
    provider: 'gemini' as const,
    badge:    'Ổn định',
    desc:     'Google · Ổn định · Context 1M token',
  },
  {
    key:      'gemini-2.0-flash-thinking-exp',
    label:    'Gemini 2.0 Flash Thinking',
    provider: 'gemini' as const,
    badge:    '🧠 Suy luận',
    desc:     'Google · Phân tích sâu · Chậm hơn',
  },
  {
    key:      'llama-3.3-70b-versatile',
    label:    'Llama 3.3 70B',
    provider: 'groq' as const,
    badge:    'Mặc định',
    desc:     'Groq · Đa năng · Fallback mặc định',
  },
  {
    key:      'llama-3.1-8b-instant',
    label:    'Llama 3.1 8B Instant',
    provider: 'groq' as const,
    badge:    '⚡ Nhanh nhất',
    desc:     'Groq · Cực nhanh · Ít chính xác hơn',
  },
  {
    key:      'mixtral-8x7b-32768',
    label:    'Mixtral 8x7B',
    provider: 'groq' as const,
    badge:    'Context lớn',
    desc:     'Groq · Context 32K · Tốt cho nhiều mã',
  },
] as const;

export type AiModelKey = typeof AI_MODELS[number]['key'];
export type AiProvider = 'gemini' | 'groq';

export const DEFAULT_MODEL: AiModelKey = 'llama-3.3-70b-versatile';
export const FALLBACK_MODEL: AiModelKey = 'llama-3.3-70b-versatile';

export function getModelMeta(key: string) {
  return AI_MODELS.find(m => m.key === key) ?? AI_MODELS.find(m => m.key === FALLBACK_MODEL)!;
}

export function isValidModelKey(key: string): key is AiModelKey {
  return AI_MODELS.some(m => m.key === key);
}
