import { z } from 'zod';

const serverEnvSchema = z.object({
  // 1. BỎ .optional() ở các biến quan trọng. 
  // TypeScript sẽ tự động hiểu kiểu của chúng là 'string' thay vì 'string | undefined'
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({ message: "Thiếu URL hoặc sai định dạng" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, { message: "Thiếu Anon Key" }),
  SUPABASE_SERVER_KEY: z.string().min(1, { message: "Thiếu Server Key" }),
  
  // 2. Các biến không bắt buộc thì giữ lại .optional()
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().min(1).optional(),
});

const parsedServerEnv = serverEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVER_KEY: process.env.SUPABASE_SERVER_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  CRON_SECRET: process.env.CRON_SECRET,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
});

if (!parsedServerEnv.success) {
  const message = parsedServerEnv.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // In ra lỗi rõ ràng lúc build/start nếu quên set biến môi trường
  throw new Error(`❌ Biến môi trường server không hợp lệ:\n${message}`);
}

export const envServer = parsedServerEnv.data;

export function getRequiredServerEnv<K extends keyof typeof envServer>(key: K): string {
  const value = envServer[key];
  if (!value) {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${String(key)}`);
  }
  // Cần ép kiểu thành string vì các trường optional có thể trả về undefined
  return value as string; 
}

export function getOptionalServerEnv(key: string): string | undefined {
  const value = process.env[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}
