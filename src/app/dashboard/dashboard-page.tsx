'use client';

import AppShellHeader from '@/components/app-shell-header';
import { PortfolioView }   from '@/components/dashboard/portfolio-view';
import { DashboardActions } from '@/components/dashboard/dashboard-actions';
import { AllocationAlerts } from '@/components/dashboard/allocation-alerts';
import { ErrorBoundary }   from '@/components/error-boundary';
import { usePortfolio }    from '@/lib/hooks/use-portfolio';
import { useAllocationAlerts, AllocationAlertSettings } from '@/lib/use-allocation-alerts';
import { useState, useCallback } from 'react';
import type { CashSummaryShape } from '@/lib/dashboard-types';

export default function DashboardPage() {
  const p = usePortfolio();

  const [alertSettings, setAlertSettings] = useState<AllocationAlertSettings>(
    { warningPct: 25, dangerPct: 40 },
  );
  const [exporting, setExporting] = useState(false);

  const allocationAlerts = useAllocationAlerts({
    positions:   p.positions,
    prices:      p.prices,
    totalAssets: p.totalAssets,
    settings:    alertSettings,
  });

  const handleExport = useCallback(async (format: 'xlsx' | 'csv') => {
    if (exporting || !p.accessToken) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/portfolio/export?format=${format}`, {
        headers: { Authorization: `Bearer ${p.accessToken}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? 'Xuất file thất bại');
        return;
      }
      const blob        = await res.blob();
      const disposition = res.headers.get('content-disposition') ?? '';
      const match       = disposition.match(/filename="?([^"]+)"?/);
      const filename    = match?.[1] ?? `portfolio.${format}`;
      const url         = URL.createObjectURL(blob);
      const a           = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Lỗi kết nối khi xuất file');
    } finally {
      setExporting(false);
    }
  }, [p.accessToken, exporting]);

  return (
    <main className="ab-page">
      <div className="ab-shell" style={{ gap: 12 }}>

        <AppShellHeader
          isLoggedIn={true}
          email={p.email}
          currentTab="dashboard"
          onLogout={p.handleLogout}
        />

        {p.message && (
          <div className="ab-error" style={{ borderRadius: 16, padding: '12px 16px' }}>
            {p.message}
          </div>
        )}

        <AllocationAlerts
          alerts={allocationAlerts}
          totalAssets={p.totalAssets}
          settings={alertSettings}
          onSettings={setAlertSettings}
        />

        {!p.loading && (p.positions.length > 0 || p.enrichedTxs.length > 0) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {(['xlsx', 'csv'] as const).map(fmt => (
              <button key={fmt} type="button" disabled={exporting}
                onClick={() => handleExport(fmt)}
                style={{
                  padding: '7px 16px', borderRadius: 999,
                  border: '1px solid var(--border)', background: 'var(--soft)',
                  color: 'var(--muted)', fontSize: 11, fontWeight: 800,
                  cursor: exporting ? 'wait' : 'pointer',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                  opacity: exporting ? 0.6 : 1, transition: 'opacity 0.2s',
                }}>
                {exporting ? '...' : `↓ ${fmt.toUpperCase()}`}
              </button>
            ))}
          </div>
        )}

        <ErrorBoundary sectionName="Danh mục">
          <PortfolioView
            loading={p.loading}
            refreshing={p.refreshing}
            positions={p.positions}
            prices={p.prices}
            quoteMap={p.quoteMap}
            vnIndex={p.vnIndex}
            allocations={p.allocations}
            totalAssets={p.totalAssets}
            totalPnl={p.totalPnl}
            totalPnlPct={p.totalPnlPct}
            actualNav={p.actualNav}
            marketValue={p.marketValue}
            unrealizedPnl={p.unrealizedPnl}
            realizedPnl={p.realizedSummary.totalRealizedPnl}
            totalSellOrders={p.realizedSummary.totalSellOrders}
            dayPnl={p.dayPnl}
            cashSummary={p.cashSummary as CashSummaryShape}
            aiNewsContext={p.aiResult?.newsContext}
            accessToken={p.accessToken}
            onRefreshPrices={p.handleRefreshPrices}
          />
        </ErrorBoundary>

        <ErrorBoundary sectionName="Bảng điều khiển">
          <DashboardActions
            userId={p.userId}
            email={p.email}
            accessToken={p.accessToken}
            transactions={p.transactions}
            cashTransactions={p.cashTransactions}
            enrichedTxs={p.enrichedTxs}
            portfolioSettings={p.portfolioSettings}
            positions={p.positions}
            cashSummary={p.cashSummary as CashSummaryShape}
            aiResult={p.aiResult}
            onAiResult={p.setAiResult}
            onReload={p.handleReload}
            onMessage={p.setMessage}
          />
        </ErrorBoundary>

      </div>
    </main>
  );
}
