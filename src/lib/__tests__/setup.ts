// src/lib/__tests__/setup.ts
// Sets up environment variables needed by server-side modules during testing.
// This file runs before every test suite via vitest.config.ts `setupFiles`.

process.env.NEXT_PUBLIC_SUPABASE_URL  = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVER_KEY       = 'test-server-key';
process.env.GEMINI_API_KEY            = 'test-gemini-key';
process.env.GROQ_API_KEY              = 'test-groq-key';
