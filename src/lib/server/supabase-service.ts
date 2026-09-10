// src/lib/server/supabase-service.ts
//
// Singleton Supabase SERVICE-ROLE client cho mọi thao tác ghi server-side.
// KHÔNG bao giờ import file này vào code chạy ở client.
//
// Dùng SUPABASE_SERVER_KEY (service role) → bypass RLS một cách CÓ CHỦ ĐÍCH,
// chỉ cho các bảng server-only (ai_cache, price_history, ...).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { envServer } from '@/lib/env-server';

const g = globalThis as typeof globalThis & {
	__supabaseServiceClient__?: SupabaseClient;
};

export function getServiceClient(): SupabaseClient {
	if (!g.__supabaseServiceClient__) {
		g.__supabaseServiceClient__ = createClient(
			envServer.NEXT_PUBLIC_SUPABASE_URL,
			envServer.SUPABASE_SERVER_KEY,
			{ auth: { autoRefreshToken: false, persistSession: false } },
		);
	}
	return g.__supabaseServiceClient__;
}
