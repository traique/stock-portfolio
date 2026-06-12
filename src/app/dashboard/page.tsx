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
import { getPrimarySectorLabel } from '@/lib/sector-map';

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

  // ✨ optResult — tính portfolio optimization từ closesMap
  const optResult = useMemo<OptPanelData | undefined>(() => {
    if (!p.positions.length || !p.totalAssets) return undefined;
    const positions = p.positions.map(pos => {
      const price = p.prices[pos.symbol] ?? pos.avgBuyPrice;
      return { symbol: pos.symbol, value: pos.quantity * price };
    });
    const totalValue = positions.reduce((s, x) => s + x.value, 0);
    if (totalValue === 0) return undefined;

    // Tính vol từ closes nếu có, không thì default 25%
    const vols: Record<string, number> = {};
    positions.forEach(({ symbol }) => {
      const closes = closesMap[symbol];
      if (closes && closes.length > 10) {
        const rets = closes.slice(1).map((v, i) => closes[i] > 0 ? (v - closes[i]) / closes[i] : 0);
        const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
        const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / rets.length;
        vols[symbol] = Number((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(1));
      } else {
        vols[symbol] = 25;
      }
    });

    // Risk parity weights
    const invVols = positions.map(({ symbol }) => vols[symbol] > 0 ? 1 / vols[symbol] : 0);
    const sumInv  = invVols.reduce((a, b) => a + b, 0);

    const bySymbol = positions.map(({ symbol, value }, i) => {
      const currentPct   = Math.round(value / totalValue * 100 * 10) / 10;
      const suggestedPct = sumInv > 0 ? Math.round(invVols[i] / sumInv * 100 * 10) / 10 : currentPct;
      const level        = currentPct > 20 ? 'danger' : currentPct > 15 ? 'watch' : 'ok';
      return { symbol, currentPct, suggestedPct, delta: Math.round((suggestedPct - currentPct) * 10) / 10, volatility: vols[symbol], level };
    }).sort((a, b) => b.currentPct - a.currentPct);

    // Sector grouping — dùng bản đồ ngành dùng chung (đồng bộ với sector-analyzer)
    const sectorGroups: Record<string, number> = {};
    positions.forEach(({ symbol, value }) => {
      const sector = getPrimarySectorLabel(symbol);
      sectorGroups[sector] = (sectorGroups[sector] ?? 0) + value;
    });
    const bySector = Object.entries(sectorGroups).map(([sector, val]) => {
      const pct   = Math.round(val / totalValue * 100 * 10) / 10;
      const level = pct > 30 ? 'danger' : pct > 20 ? 'watch' : 'ok';
      return { sector, pct, level };
    }).sort((a, b) => b.pct - a.pct);

    // Correlation pairs (simplified — chỉ tính nếu có closes)
    const highCorrelations: OptPanelData['highCorrelations'] = [];
    const syms = positions.map(x => x.symbol).filter(s => (closesMap[s]?.length ?? 0) > 10);
    for (let i = 0; i < syms.length; i++) {
      for (let j = i + 1; j < syms.length; j++) {
        const a = closesMap[syms[i]], b = closesMap[syms[j]];
        const len = Math.min(a.length, b.length);
        const ra  = a.slice(-len).map((v, k) => k > 0 ? (v - a.slice(-len)[k-1]) / a.slice(-len)[k-1] : 0);
        const rb  = b.slice(-len).map((v, k) => k > 0 ? (v - b.slice(-len)[k-1]) / b.slice(-len)[k-1] : 0);
        const ma  = ra.reduce((s, v) => s + v, 0) / ra.length;
        const mb  = rb.reduce((s, v) => s + v, 0) / rb.length;
        let num = 0, da = 0, db = 0;
        ra.forEach((v, k) => { num += (v-ma)*(rb[k]-mb); da += (v-ma)**2; db += (rb[k]-mb)**2; });
        const corr = Math.sqrt(da*db) > 0 ? num / Math.sqrt(da*db) : 0;
        if (Math.abs(corr) > 0.6) highCorrelations.push({ symbolA: syms[i], symbolB: syms[j], corr: Math.round(corr*100)/100 });
      }
    }

    const hhi       = bySymbol.reduce((s, x) => s + (x.currentPct/100)**2, 0);
    const weightedV = bySymbol.reduce((s, x) => s + (x.currentPct/100) * x.volatility, 0);

    return {
      portfolioVolatility:  Math.round(weightedV * 10) / 10,
      diversificationScore: Math.round((1 - hhi) * 100),
      bySymbol,
      bySector,
      highCorrelations: highCorrelations.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr)).slice(0, 5),
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
