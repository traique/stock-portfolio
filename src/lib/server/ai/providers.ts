import { getModelMeta, isValidModelKey, FALLBACK_MODEL } from '@/lib/server/ai-models';
import { envServer } from '@/lib/env-server';
import { wrapUntrustedPayload, INJECTION_GUARD_INSTRUCTION } from '@/lib/server/ai-sanitize'; // ✨ Phase 0.1
import type { ZodType } from 'zod'; // ✨ Phase 0.2
import type { AiCallResult } from './types';

// ── Groq (OpenAI-compatible) ──
async function callGroq<T>(model: string, systemPrompt: string, userPrompt: string, fallback: T): Promise<T> {
  const apiKey = envServer.GROQ_API_KEY ?? envServer.OPENROUTER_API_KEY;
  if (!apiKey) return fallback;
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://' + 'api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || FALLBACK_MODEL,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        cache: 'no-store',
      });
      if (res.status === 429) {
        const after = Number(res.headers.get('retry-after') ?? 2);
        await new Promise(r => setTimeout(r, after * 1000));
        continue;
      }
      if (!res.ok) { console.error(`[callGroq] HTTP ${res.status}`); return fallback; }
      const json = await res.json();
      const text: string | undefined = json?.choices?.[0]?.message?.content;
      if (!text) return fallback;
      const clean = text.replace(/```(?:json)?|```/g, '').trim();
      return JSON.parse(clean) as T;
    } catch (err) {
      if (attempt === MAX_RETRIES) { console.error('[callGroq] failed after retries:', err); return fallback; }
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return fallback;
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
  const isValidOutput = (data: T): boolean => (schema ? schema.safeParse(data).success : true);
  if (meta.provider === 'gemini') {
    try {
      const data = await callGemini<T>(key, guardedSystem, guardedUser, fallback);
      if (!isValidOutput(data)) throw new Error('SCHEMA_VALIDATION_FAILED');
      return { data, modelUsed: key, providerUsed: 'gemini', fallbackUsed: false };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      const isQuota = reason.includes('QUOTA_EXCEEDED');
      const isSchema = reason.includes('SCHEMA_VALIDATION_FAILED');
      console.warn(`[callAiWithFallback] Gemini failed (${reason}), falling back to Groq`);
      const groqData = await callGroq<T>(FALLBACK_MODEL, guardedSystem, guardedUser, fallback);
      const valid = isValidOutput(groqData);
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
  const valid = isValidOutput(data);
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
