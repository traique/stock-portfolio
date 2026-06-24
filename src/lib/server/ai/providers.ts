import { getModelMeta, isValidModelKey, FALLBACK_MODEL } from '@/lib/server/ai-models';
import { envServer } from '@/lib/env-server';
import { wrapUntrustedPayload, INJECTION_GUARD_INSTRUCTION } from '@/lib/server/ai-sanitize'; // ✨ Phase 0.1
import type { ZodType } from 'zod'; // ✨ Phase 0.2
import type { AiCallResult } from './types';

// ── Groq (OpenAI-compatible) ──

async function callGroq<T>(
  model: string,
  system: string,
  user: string,
  fallback: T,
  _isRetry = false, // cờ chống lặp vô hạn
): Promise<T> {
  const apiKey = envServer.GROQ_API_KEY ?? envServer.OPENROUTER_API_KEY;
  if (!apiKey) return fallback;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || FALLBACK_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
    }),
  });

  // 429 → retry theo retry-after
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after')) || 2;
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    if (!_isRetry) return callGroq(model, system, user, fallback, true);
    return fallback;
  }

  if (!res.ok) {
    // 🔁 404 = model_not_found → thử lại 1 lần với model an toàn (FALLBACK_MODEL)
    if (res.status === 404 && model !== FALLBACK_MODEL && !_isRetry) {
      console.warn(`[callGroq] HTTP 404 cho model "${model}" → retry với ${FALLBACK_MODEL}`);
      return callGroq(FALLBACK_MODEL, system, user, fallback, true);
    }
    // Log đầy đủ để debug (model + status + body)
    const body = await res.text().catch(() => '');
    console.error(`[callGroq] HTTP ${res.status} model="${model}" body="${body.slice(0, 300)}"`);
    return fallback;
  }

  // response_format: json_object đảm bảo Groq trả JSON sạch (không kèm code fences).
  try {
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '{}';
    return JSON.parse(content) as T;
  } catch (e) {
    console.error('[callGroq] JSON parse error:', e);
    return fallback;
  }
}

// ── Gemini ──
async function callGemini<T>(model: string, systemPrompt: string, userPrompt: string, fallback: T): Promise<T> {
  const apiKey = envServer.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured — set it in Vercel env vars');
  const url =
    'https://' + 'generativelanguage.googleapis.com/v1beta/models/' +
    model + ':generateContent?key=' + apiKey;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
    cache: 'no-store',
  });
  if (res.status === 429) throw new Error('GEMINI_QUOTA_EXCEEDED');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GEMINI_HTTP_${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('GEMINI_EMPTY_RESPONSE');
  const clean = text.replace(/```(?:json)?|```/g, '').trim();
  return JSON.parse(clean) as T;
}

// ── Unified call with fallback + guard (0.1) + validate (0.2) ──
export async function callAiWithFallback<T>(
  modelKey: string,
  systemPrompt: string,
  userPrompt: string,
  fallback: T,
  schema?: ZodType<T>, // ✨ 0.2 — optional, backward-compatible
): Promise<AiCallResult<T>> {
  const key = isValidModelKey(modelKey) ? modelKey : FALLBACK_MODEL;
  const meta = getModelMeta(key);
  // ✨ 0.1 — guard + bọc dữ liệu ngoài (mọi provider)
  const guardedSystem = `${systemPrompt}\n${INJECTION_GUARD_INSTRUCTION}`;
  const guardedUser = wrapUntrustedPayload(userPrompt);
  if (meta.provider === 'gemini') {
    try {
      const data = await callGemini<T>(key, guardedSystem, guardedUser, fallback);
      if (schema) {
        const check = schema.safeParse(data);
        if (!check.success) {
          // ✨ Log lý do CHÍNH XÁC + dữ liệu thô để debug (trước đây fail âm thầm, không biết vì sao)
          console.error('[callAiWithFallback] Gemini SCHEMA_VALIDATION_FAILED:', JSON.stringify(check.error.issues).slice(0, 500));
          console.error('[callAiWithFallback] Gemini raw data:', JSON.stringify(data).slice(0, 800));
          throw new Error('SCHEMA_VALIDATION_FAILED');
        }
      }
      return { data, modelUsed: key, providerUsed: 'gemini', fallbackUsed: false };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      const isQuota = reason.includes('QUOTA_EXCEEDED');
      const isSchema = reason.includes('SCHEMA_VALIDATION_FAILED');
      console.warn(`[callAiWithFallback] Gemini failed (${reason}), falling back to Groq`);
      const groqData = await callGroq<T>(FALLBACK_MODEL, guardedSystem, guardedUser, fallback);
      let valid = true;
      if (schema) {
        const check = schema.safeParse(groqData);
        valid = check.success;
        if (!check.success) {
          console.error('[callAiWithFallback] Groq (fallback) SCHEMA_VALIDATION_FAILED:', JSON.stringify(check.error.issues).slice(0, 500));
          console.error('[callAiWithFallback] Groq (fallback) raw data:', JSON.stringify(groqData).slice(0, 800));
        }
      }
      return {
        data: valid ? groqData : fallback,
        modelUsed: FALLBACK_MODEL,
        providerUsed: 'groq',
        fallbackUsed: true,
        fallbackReason: isSchema
          ? 'Gemini trả dữ liệu sai định dạng, đã chuyển sang Groq.'
          : isQuota
            ? 'Gemini hết quota, đã chuyển sang Groq tự động.'
            : `Gemini lỗi, đã chuyển sang Groq. (${reason.slice(0, 80)})`,
      };
    }
  }
  const data = await callGroq<T>(key, guardedSystem, guardedUser, fallback);
  let valid = true;
  if (schema) {
    const check = schema.safeParse(data);
    valid = check.success;
    if (!check.success) {
      // ✨ Log lý do CHÍNH XÁC + dữ liệu thô — đây chính là log đã thiếu khi user gặp
      // "Groq trả dữ liệu sai định dạng" mà không biết field nào sai.
      console.error('[callAiWithFallback] Groq SCHEMA_VALIDATION_FAILED:', JSON.stringify(check.error.issues).slice(0, 500));
      console.error('[callAiWithFallback] Groq raw data:', JSON.stringify(data).slice(0, 800));
    }
  }
  return {
    data: valid ? data : fallback,
    modelUsed: key,
    providerUsed: 'groq',
    fallbackUsed: !valid,
    fallbackReason: valid ? undefined : 'Groq trả dữ liệu sai định dạng, dùng kết quả dự phòng.',
  };
}

// ── Backward compat ──
export async function callOpenRouterJson<T>(
  apiKey: string | undefined,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  fallback: T,
): Promise<T> {
  if (!apiKey) return fallback;
  return callGroq<T>(model || FALLBACK_MODEL, systemPrompt, userPrompt, fallback);
    }
