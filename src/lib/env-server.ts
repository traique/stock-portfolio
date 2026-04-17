import { z } from 'zod';

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL phải là URL hợp lệ'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY không được để trống'),
  SUPABASE_SERVER_KEY: z.string().min(1, 'SUPABASE_SERVER_KEY không được để trống'),
  NEXT_PUBLIC_SITE_URL: z.string().url('NEXT_PUBLIC_SITE_URL phải là URL hợp lệ').optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
});

const parsedServerEnv = serverEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVER_KEY: process.env.SUPABASE_SERVER_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  CRON_SECRET: process.env.CRON_SECRET,
});

if (!parsedServerEnv.success) {
  const message = parsedServerEnv.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Thiếu hoặc sai biến môi trường server: ${message}`);
}

export const envServer = parsedServerEnv.data;
