// src/app/dashboard/page.tsx
//
// Server Component (RSC) — prefetch dữ liệu dashboard NGAY TRÊN SERVER:
//   1. Auth từ cookie (@supabase/ssr) — không còn chặng auth.getUser() ở client
//   2. 3 bảng (transactions, cash_transactions, portfolio_settings) song song
//
// Nhờ vậy client component nhận dữ liệu ngay từ render đầu tiên: trước đây
// dashboard phải chạy waterfall 3 chặng (session → DB → giá) sau khi JS tải
// xong, giờ chỉ còn chặng giá chạy song song với first paint.
//
// Phần tương tác nằm ở ./dashboard-client.tsx (client component).

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase-server-client';
import { derivePortfolio, type CashTransaction, type PortfolioSettings, type Transaction } from '@/lib/calculations';
import type { DashboardInitialData } from '@/lib/dashboard-types';
import DashboardClient from './dashboard-client';

export const metadata: Metadata = {
  title: 'Danh mục',
  description: 'Theo dõi danh mục chứng khoán: NAV, P&L, phân bổ, cảnh báo rủi ro.',
};

export default async function DashboardPage() {
  // ── 1. Auth từ cookie — middleware đã guard nhưng đây là phòng thủ kép ──
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/?redirect=/dashboard');

  // ── 2. Nạp dữ liệu danh mục song song (RLS áp dụng qua cookie client) ──
  const [txRes, cashRes, settingsRes] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', user.id)
      .order('trade_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase.from('cash_transactions').select('*').eq('user_id', user.id)
      .order('transaction_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase.from('portfolio_settings').select('*')
      .eq('user_id', user.id).maybeSingle(),
  ]);

  const loadError = [txRes, cashRes, settingsRes]
    .map(r => r.error?.message)
    .filter(Boolean)
    .join('; ') || undefined;

  const initial: DashboardInitialData = {
    userId: user.id,
    email: user.email ?? '',
    transactions: (txRes.data ?? []) as Transaction[],
    cashTransactions: (cashRes.data ?? []) as CashTransaction[],
    portfolioSettings: (settingsRes.data ?? null) as PortfolioSettings | null,
    loadError,
  };

  return <DashboardClient initial={initial} />;
}
