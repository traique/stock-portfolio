'use client';

import AppShellHeader from '@/components/app-shell-header';
import { PortfolioView, type SectorHeatmapData, type OptPanelData } from '@/components/dashboard/portfolio-view';
import { DashboardActions } from '@/components/dashboard/dashboard-actions';
import { AllocationAlerts } from '@/components/dashboard/allocation-alerts';
import { ErrorBoundary }   from '@/components/error-boundary';
import { usePortfolio }    from '@/lib/hooks/use-portfolio';
import { useAllocationAlerts, AllocationAlertSettings } from '@/lib/use-allocation-alerts';
import { useState, useCallback, useEffect, useMemo } from 'react';
import type { CashSummaryShape } from '@/lib/dashboard-types';

export default function DashboardPage() {
  const p = usePortfolio();

  // ✨ closesMap — fetch 3M closes cho từng mã đang nắm
  const [closesMap, setClosesMap] = useState<Record<string, number[]>>({});
  useEffect(() => {
    if (!p.positions.length || !p.accessToken) return;
    const symbols = p.positions.map(pos => pos.symbol);
    // Fetch song song từ Yahoo Finance qua API proxy
    Promise.allSettled(
      symbols.map(async sym => {
        try {
          const ticker = `${sym}.VN`;
          const hosts  = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
          for (const host of hosts) {
            const res = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=3mo`);
            if (!res.ok) continue;
            const json = await res.json();
            const closes: number[] = (json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [])
              .map(Number).filter((v: number) => Number.isFinite(v) && v > 0);
            if (closes.length > 5) return { sym, closes };
          }
        } catch { /* ignore */ }
        return null;
      })
    ).then(results => {
      const map: Record<string, number[]> = {};
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value) map[r.value.sym] = r.value.closes;
      });
      setClosesMap(map);
    });
  }, [p.positions.map(x => x.symbol).join(','), p.accessToken]);

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

    // Sector grouping đơn giản
    const sectorGroups: Record<string, number> = {};
    positions.forEach(({ symbol, value }) => {
      const bankings  = ['VCB','BID','CTG','TCB','MBB','ACB','VPB','HDB','STB','EIB','TPB','SHB'];
      const steels    = ['HPG','HSG','NKG'];
      const realestate= ['VIC','VHM','NVL','KDH','DXG','PDR','NLG','DIG','VRE','KBC','BCM'];
      const oilgas    = ['GAS','PLX','PVD','PVT','PVS'];
      const tech      = ['FPT','CMG'];
      const sector    = bankings.includes(symbol) ? 'Ngân hàng' :
                        steels.includes(symbol)    ? 'Thép' :
                        realestate.includes(symbol)? 'Bất động sản' :
                        oilgas.includes(symbol)    ? 'Dầu khí' :
                        tech.includes(symbol)      ? 'Công nghệ' : 'Khác';
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
