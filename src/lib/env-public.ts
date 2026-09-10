import { z } from 'zod';

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL:   z.string().url('NEXT_PUBLIC_SUPABASE_URL phải là URL hợp lệ'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY không được để trống'),
  NEXT_PUBLIC_SITE_URL:       z.string().url().optional(),
});

const parsedPublicEnv = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL:      process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL:          process.env.NEXT_PUBLIC_SITE_URL,
});

if (!parsedPublicEnv.success) {
  const message = parsedPublicEnv.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Thiếu hoặc sai biến môi trường public: ${message}`);
}

export const envPublic = parsedPublicEnv.data;
