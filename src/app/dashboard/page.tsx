'use client';

import AppShellHeader from '@/components/app-shell-header';
import { PortfolioView, type OptPanelData } from '@/components/dashboard/portfolio-view';
import { DashboardActions } from '@/components/dashboard/dashboard-actions';
import { AllocationAlerts } from '@/components/dashboard/allocation-alerts';
import { ErrorBoundary } from '@/components/error-boundary';
import { usePortfolio } from '@/lib/hooks/use-portfolio';
import { useSymbolCloses } from '@/lib/hooks/use-symbol-closes';
import { useAllocationAlerts, AllocationAlertSettings } from '@/lib/use-allocation-alerts';
import { useState, useCallback, useMemo, type CSSProperties } from 'react';
import type { CashSummaryShape } from '@/lib/dashboard-types';
import { buildOptimizationResult } from '@/lib/server/portfolio-optimizer';

// ─── Styles (module-level: tạo 1 lần, không re-alloc mỗi render) ──────
const SHELL_STYLE: CSSProperties = { gap: 12 };
const MESSAGE_STYLE: CSSProperties = { borderRadius: 16, padding: '12px 16px' };
const EXPORT_ROW_STYLE: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8 };

// Chỉ có 2 biến thể (idle/busy) → tạo sẵn, không build object mỗi render.
const EXPORT_BTN_BASE: CSSProperties = {
  padding: '7px 16px', borderRadius: 999, border: '1px solid var(--border)',
  background: 'var(--soft)', color: 'var(--muted)', fontSize: 11, fontWeight: 800,
  letterSpacing: '0.04em', textTransform: 'uppercase', transition: 'opacity 0.2s',
};
const EXPORT_BTN_IDLE: CSSProperties = { ...EXPORT_BTN_BASE, cursor: 'pointer', opacity: 1 };
const EXPORT_BTN_BUSY: CSSProperties = { ...EXPORT_BTN_BASE, cursor: 'wait', opacity: 0.6 };

export default function DashboardPage() {
  const p = usePortfolio();

  // ✨ Danh sách symbol ổn định — chỉ đổi reference khi *tập* mã đổi.
  const symbolsKey = p.positions.map((pos) => pos.symbol).join(',');
  const symbols = useMemo(
    () => (symbolsKey ? symbolsKey.split(',') : []),
    [symbolsKey],
  );

  // ✨ closesMap: hook chuyên trách — batch, cache theo phiên, tự abort.
  const closesMap = useSymbolCloses(symbols, 90);

  // ✨ Chữ ký nội dung ổn định cho optResult: chỉ tính lại khi DỮ LIỆU đổi,
  //    không phải khi reference đổi (usePortfolio có thể trả ref mới mỗi render).
  const optSignature = useMemo(() => {
    if (!p.positions.length || !p.totalAssets) return '';
    const pos = p.positions
      .map((x) => `${x.symbol}:${x.quantity}:${p.prices[x.symbol] ?? x.avgBuyPrice}`)
      .join('|');
    const closes = Object.keys(closesMap).sort().join(',');
    return `${pos}#${closes}`;
  }, [p.positions, p.prices, p.totalAssets, closesMap]);

  const optResult = useMemo<OptPanelData | undefined>(() => {
    if (!optSignature) return undefined;

    const positions = p.positions.map((pos) => ({
      symbol: pos.symbol,
      value: pos.quantity * (p.prices[pos.symbol] ?? pos.avgBuyPrice),
    }));
    const totalValue = positions.reduce((s, x) => s + x.value, 0);
    if (totalValue === 0) return undefined;

    const result = buildOptimizationResult(positions, closesMap);
    const levelBySymbol = new Map(
      result.concentration.bySymbol.map((s) => [s.symbol, s.level]),
    );

    return {
      portfolioVolatility: result.concentration.portfolioVolatility,
      diversificationScore: result.concentration.diversificationScore,
      bySymbol: result.weights.map((w) => ({
        symbol: w.symbol,
        currentPct: w.currentPct,
        suggestedPct: w.suggestedPct,
        delta: w.delta,
        volatility: w.volatility,
        level: levelBySymbol.get(w.symbol) ?? 'ok',
      })),
      bySector: result.concentration.bySector,
      highCorrelations: result.highCorrelations.map((c) => ({
        symbolA: c.symbolA, symbolB: c.symbolB, corr: c.corr,
      })),
    };
    // Tính lại CHỈ khi chữ ký đổi → tránh chạy lại thuật toán O(n²) vô ích.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optSignature]);

  const [alertSettings, setAlertSettings] = useState<AllocationAlertSettings>({
    warningPct: 25, dangerPct: 40,
  });
  const [exporting, setExporting] = useState(false);

  const allocationAlerts = useAllocationAlerts({
    positions: p.positions,
    prices: p.prices,
    totalAssets: p.totalAssets,
    settings: alertSettings,
  });

  const handleExport = useCallback(
    async (format: 'xlsx' | 'csv') => {
      if (exporting || !p.accessToken) return;
      setExporting(true);
      try {
        const res = await fetch(`/api/portfolio/export?format=${format}`, {
          headers: { Authorization: `Bearer ${p.accessToken}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          p.setMessage(err.error ?? 'Xuất file thất bại');
          return;
        }
        const blob = await res.blob();
        const disposition = res.headers.get('content-disposition') ?? '';
        const match = disposition.match(/filename="?([^"]+)"?/);
        const filename = match?.[1] ?? `portfolio.${format}`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        p.setMessage('Lỗi kết nối khi xuất file');
      } finally {
        setExporting(false);
      }
    },
    [p.accessToken, p.setMessage, exporting],
  );

  return (
    <main className="ab-page">
      <div className="ab-shell" style={SHELL_STYLE}>
        <AppShellHeader
          isLoggedIn
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
            {(['xlsx', 'csv'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                disabled={exporting}
                onClick={() => handleExport(fmt)}
                style={exporting ? EXPORT_BTN_BUSY : EXPORT_BTN_IDLE}
              >
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
