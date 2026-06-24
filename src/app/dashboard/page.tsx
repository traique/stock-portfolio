'use client';

import AppShellHeader from '@/components/app-shell-header';
import { PortfolioView, type SectorHeatmapData, type OptPanelData } from '@/components/dashboard/portfolio-view';
import { DashboardActions } from '@/components/dashboard/dashboard-actions';
import { AllocationAlerts } from '@/components/dashboard/allocation-alerts';
import { ErrorBoundary }   from '@/components/error-boundary';
import { usePortfolio }    from '@/lib/hooks/use-portfolio';
import { useAllocationAlerts, AllocationAlertSettings } from '@/lib/use-allocation-alerts';
import { useState, useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import type { CashSummaryShape } from '@/lib/dashboard-types';
// ✨ FIX: dùng CHUNG hàm tính risk-parity/correlation/HHI với server (portfolio-optimizer.ts,
// cũng là module AI dùng) — trước đây trang này tự viết lại 1 bản khác, rủi ro lệch kết quả
// giữa số hiển thị cho người dùng và số AI dùng để tư vấn.
import { buildOptimizationResult } from '@/lib/server/portfolio-optimizer';

// ─── Styles (tách const để tránh inline style trong JSX, code dán vào sạch) ──────
const SHELL_STYLE: CSSProperties = { gap: 12 };
const MESSAGE_STYLE: CSSProperties = { borderRadius: 16, padding: '12px 16px' };
const EXPORT_ROW_STYLE: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8 };
const exportBtnStyle = (exporting: boolean): CSSProperties => ({
  padding: '7px 16px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--soft)',
  color: 'var(--muted)',
  fontSize: 11,
  fontWeight: 800,
  cursor: exporting ? 'wait' : 'pointer',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  opacity: exporting ? 0.6 : 1,
  transition: 'opacity 0.2s',
});

export default function DashboardPage() {
  const p = usePortfolio();

  // ✨ closesMap — lấy ~90 phiên giá đóng cửa (nguồn DNSE qua /api/history) cho từng mã đang nắm
  const [closesMap, setClosesMap] = useState<Record<string, number[]>>({});
  useEffect(() => {
    if (!p.positions.length) return;
    const symbols = p.positions.map(pos => pos.symbol);

    // Nguồn DNSE qua endpoint nội bộ /api/history (đồng bộ giá realtime, đơn vị VND thô mọi sàn)
    Promise.allSettled(
      symbols.map(async sym => {
        try {
          const res = await fetch(`/api/history/${encodeURIComponent(sym)}?days=90`);
          if (!res.ok) return null;
          const json = await res.json();
          const closes: number[] = (json?.closes ?? [])
            .map(Number)
            .filter((v: number) => Number.isFinite(v) && v > 0);
          if (closes.length > 5) return { sym, closes };
        } catch { /* bỏ qua mã lỗi */ }
        return null;
      })
    ).then(results => {
      const map: Record<string, number[]> = {};
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value) map[r.value.sym] = r.value.closes;
      });
      setClosesMap(map);
    });
  }, [p.positions.map(x => x.symbol).join(',')]);

  // ✨ optResult — dùng CHUNG buildOptimizationResult() với server/AI (portfolio-optimizer.ts).
  // Trước đây trang này tự viết lại volatility/correlation/risk-parity bằng tay → 2 nơi tính
  // cùng 1 khái niệm "rủi ro danh mục" dễ lệch nhau theo thời gian. Giờ chỉ map sang shape
  // OptPanelData mà UI cần, không tính toán lại.
  const optResult = useMemo<OptPanelData | undefined>(() => {
    if (!p.positions.length || !p.totalAssets) return undefined;
    const positions = p.positions.map(pos => {
      const price = p.prices[pos.symbol] ?? pos.avgBuyPrice;
      return { symbol: pos.symbol, value: pos.quantity * price };
    });
    const totalValue = positions.reduce((s, x) => s + x.value, 0);
    if (totalValue === 0) return undefined;

    const result = buildOptimizationResult(positions, closesMap);
    const levelBySymbol = new Map(result.concentration.bySymbol.map(s => [s.symbol, s.level]));

    return {
      portfolioVolatility:  result.concentration.portfolioVolatility,
      diversificationScore: result.concentration.diversificationScore,
      bySymbol: result.weights.map(w => ({
        symbol:       w.symbol,
        currentPct:   w.currentPct,
        suggestedPct: w.suggestedPct,
        delta:        w.delta,
        volatility:   w.volatility,
        level:        levelBySymbol.get(w.symbol) ?? 'ok',
      })),
      bySector: result.concentration.bySector,
      highCorrelations: result.highCorrelations.map(c => ({
        symbolA: c.symbolA, symbolB: c.symbolB, corr: c.corr,
      })),
    };
  }, [p.positions, p.prices, p.totalAssets, closesMap]);

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
        // ✨ FIX: dùng khung message sẵn có của app (giống lỗi giá/giao dịch) thay vì
        // alert() — tránh popup giật cục, không khớp giao diện Liquid Glass của app.
        p.setMessage(err.error ?? 'Xuất file thất bại');
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
      p.setMessage('Lỗi kết nối khi xuất file');
    } finally {
      setExporting(false);
    }
  }, [p.accessToken, p.setMessage, exporting]);

  return (
    <main className="ab-page">
      <div className="ab-shell" style={SHELL_STYLE}>

        <AppShellHeader
          isLoggedIn={true}
          email={p.email}
          currentTab="dashboard"
          onLogout={p.handleLogout}
        />

        {p.message && (
          <div className="ab-error" style={MESSAGE_STYLE}>
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
          <div style={EXPORT_ROW_STYLE}>
            {(['xlsx', 'csv'] as const).map(fmt => (
              <button key={fmt} type="button" disabled={exporting}
                onClick={() => handleExport(fmt)}
                style={exportBtnStyle(exporting)}>
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
            closesMap={closesMap}
            optResult={optResult}
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
