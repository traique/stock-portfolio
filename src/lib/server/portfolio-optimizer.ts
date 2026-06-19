// src/lib/server/portfolio-optimizer.ts
//
// Phase 3B — Portfolio Optimization
//
// Không cần API ngoài. Tính từ:
//   • Lịch sử giá (đã có trong project)
//   • Dữ liệu vị thế từ calculations.ts
//
// Cung cấp cho AI:
//   1. Correlation matrix — phát hiện tập trung rủi ro ngành
//   2. Concentration risk — cảnh báo vị thế/ngành quá lớn
//   3. Risk-adjusted weight suggestions — Risk Parity đơn giản
//   4. Portfolio volatility estimate — dự báo biến động tổng thể
//
// Không implement full Markowitz (cần solver) — dùng Risk Parity:
//   mỗi mã đóng góp rủi ro bằng nhau → intuitive, không cần optimizer.

import { getSymbolSectors, SECTOR_MAP } from './sector-analyzer';
import { calcPortfolioRisk } from '@/lib/calculations'; // ✨ 2.5: dùng chung vol covariance

// ─── Types ───

export type PositionWeight = {
  symbol:       string;
  currentValue: number;  // triệu VND
  currentPct:   number;  // % tổng portfolio
  suggestedPct: number;  // % Risk Parity đề xuất
  delta:        number;  // suggestedPct - currentPct (dương = nên tăng, âm = nên giảm)
  volatility:   number;  // annualized std dev %
};

export type CorrelationPair = {
  symbolA: string;
  symbolB: string;
  corr:    number;  // -1 to 1
  risk:    'high' | 'moderate' | 'low'; // |corr| > 0.7 = high
};

export type ConcentrationRisk = {
  bySymbol:  Array<{ symbol: string; pct: number; level: 'ok' | 'watch' | 'danger' }>;
  bySector:  Array<{ sector: string; pct: number; level: 'ok' | 'watch' | 'danger' }>;
  portfolioVolatility: number;  // % annualized estimate
  diversificationScore: number; // 0-100 (100 = perfectly diversified)
};

export type OptimizationResult = {
  weights:             PositionWeight[];
  highCorrelations:    CorrelationPair[];
  concentration:       ConcentrationRisk;
  summary:             string;  // mô tả ngắn cho AI
};

// ─── Math helpers ───

/** Daily returns từ close[] */
function dailyReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }
  return returns;
}

/** Mean */
function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/** Sample standard deviation */
function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m   = mean(arr);
  const sq  = arr.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(sq / (arr.length - 1));
}

/** Annualized volatility từ daily returns (×√252) */
function annualizedVol(returns: number[]): number {
  return stdDev(returns) * Math.sqrt(252) * 100; // %
}

/** Pearson correlation coefficient */
function pearsonCorr(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len < 10) return 0;

  const aSlice = a.slice(a.length - len);
  const bSlice = b.slice(b.length - len);

  const ma = mean(aSlice);
  const mb = mean(bSlice);

  let num = 0, da = 0, db = 0;
  for (let i = 0; i < len; i++) {
    const ra = aSlice[i] - ma;
    const rb = bSlice[i] - mb;
    num += ra * rb;
    da  += ra * ra;
    db  += rb * rb;
  }

  const denom = Math.sqrt(da * db);
  return denom > 0 ? Number((num / denom).toFixed(3)) : 0;
}

// ─── Correlation Matrix ───

export function buildCorrelationMatrix(
  returnsMap: Record<string, number[]>,
): CorrelationPair[] {
  const symbols = Object.keys(returnsMap);
  const pairs: CorrelationPair[] = [];

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const a = symbols[i];
      const b = symbols[j];
      const corr = pearsonCorr(returnsMap[a], returnsMap[b]);

      const absCorr = Math.abs(corr);
      const risk: CorrelationPair['risk'] =
        absCorr > 0.7 ? 'high' :
        absCorr > 0.4 ? 'moderate' : 'low';

      pairs.push({ symbolA: a, symbolB: b, corr, risk });
    }
  }

  return pairs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
}

// ─── Risk Parity Weights ───
//
// Risk Parity: w_i = (1/σ_i) / Σ(1/σ_j)
// Đơn giản nhất: chia đều rủi ro thay vì chia đều giá trị.
// Mã ít biến động hơn → weight lớn hơn.

export function calcRiskParityWeights(
  vols: Record<string, number>, // annualized vol %
): Record<string, number> {
  const symbols = Object.keys(vols);
  const invVols = symbols.map(s => vols[s] > 0 ? 1 / vols[s] : 0);
  const sumInv  = invVols.reduce((a, b) => a + b, 0);

  const weights: Record<string, number> = {};
  symbols.forEach((s, i) => {
    weights[s] = sumInv > 0 ? Number((invVols[i] / sumInv * 100).toFixed(1)) : 100 / symbols.length;
  });

  return weights;
}

// ─── Concentration Risk ───

function concentrationLevel(pct: number, isSector = false): 'ok' | 'watch' | 'danger' {
  if (isSector) {
    // Sector: >30% = danger, >20% = watch
    return pct > 30 ? 'danger' : pct > 20 ? 'watch' : 'ok';
  }
  // Symbol: >20% = danger, >15% = watch
  return pct > 20 ? 'danger' : pct > 15 ? 'watch' : 'ok';
}

export function calcConcentrationRisk(
  positions:  Array<{ symbol: string; value: number }>,
  vols:       Record<string, number>,
  closesMap:  Record<string, number[]>, // ✨ 2.5: closes để tính vol theo covariance
): ConcentrationRisk {
  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  if (totalValue === 0) {
    return {
      bySymbol: [], bySector: [],
      portfolioVolatility: 0, diversificationScore: 100,
    };
  }

  // By symbol
  const bySymbol = positions.map(p => ({
    symbol: p.symbol,
    pct:    Number((p.value / totalValue * 100).toFixed(1)),
    level:  concentrationLevel(p.value / totalValue * 100) as 'ok' | 'watch' | 'danger',
  })).sort((a, b) => b.pct - a.pct);

  // By sector — aggregate
  const sectorValues: Record<string, number> = {};
  for (const p of positions) {
    const sectors = getSymbolSectors(p.symbol);
    const primarySector = sectors[0];
    if (primarySector) {
      sectorValues[SECTOR_MAP[primarySector].label] =
        (sectorValues[SECTOR_MAP[primarySector].label] ?? 0) + p.value;
    } else {
      sectorValues['Khác'] = (sectorValues['Khác'] ?? 0) + p.value;
    }
  }

  const bySector = Object.entries(sectorValues).map(([sector, value]) => ({
    sector,
    pct:   Number((value / totalValue * 100).toFixed(1)),
    level: concentrationLevel(value / totalValue * 100, true) as 'ok' | 'watch' | 'danger',
  })).sort((a, b) => b.pct - a.pct);

  // ✨ 2.5: Portfolio volatility theo MA TRẬN HIỆP PHƯƠNG SAI — thống nhất với
  //   calcPortfolioRisk() trong calculations.ts (CÓ tính tương quan giữa các mã),
  //   thay cho trung bình có trọng số bỏ qua tương quan (overestimate).
  const riskHoldings = positions
    .filter(p => p.value > 0)
    .map(p => ({
      symbol: p.symbol,
      weight: p.value / totalValue,
      closes: closesMap[p.symbol] ?? [],
    }));
  const { annualVolatility } = calcPortfolioRisk(riskHoldings);
  // calcPortfolioRisk trả annualVolatility dạng PHÂN SỐ (vd 0.25) → đổi sang %.
  const portfolioVolatility = Number((annualVolatility * 100).toFixed(1));

  // Diversification score: giữ HHI (Herfindahl-Hirschman) như cũ.
  const weights  = positions.map(p => p.value / totalValue);
  const hhi      = weights.reduce((s, w) => s + w * w, 0);
  const divScore = Math.round((1 - hhi) * 100);

  return {
    bySymbol,
    bySector,
    portfolioVolatility,
    diversificationScore: divScore,
  };
}

// ─── Master builder ───

/**
 * Tính toàn bộ optimization metrics.
 *
 * @param positions  Danh sách vị thế đang mở
 * @param closesMap  Map symbol → close[] (để tính vol, correlation)
 */
export function buildOptimizationResult(
  positions:  Array<{ symbol: string; value: number }>,
  closesMap:  Record<string, number[]>,
): OptimizationResult {
  const totalValue = positions.reduce((s, p) => s + p.value, 0);

  // Returns và vol cho mỗi mã (dùng cho correlation + Risk Parity)
  const returnsMap: Record<string, number[]> = {};
  const vols:       Record<string, number>   = {};

  for (const p of positions) {
    const closes = closesMap[p.symbol];
    if (closes && closes.length > 10) {
      const rets      = dailyReturns(closes);
      returnsMap[p.symbol] = rets;
      vols[p.symbol]       = Number(annualizedVol(rets).toFixed(1));
    } else {
      returnsMap[p.symbol] = [];
      vols[p.symbol]       = 25; // default 25% vol nếu không có data
    }
  }

  // Risk parity weights
  const rpWeights = calcRiskParityWeights(vols);

  // Position weights với suggestions
  const weights: PositionWeight[] = positions.map(p => {
    const currentPct   = totalValue > 0 ? p.value / totalValue * 100 : 0;
    const suggestedPct = rpWeights[p.symbol] ?? currentPct;
    return {
      symbol:       p.symbol,
      currentValue: Number((p.value / 1_000_000).toFixed(0)), // đồng → triệu
      currentPct:   Number(currentPct.toFixed(1)),
      suggestedPct: suggestedPct,
      delta:        Number((suggestedPct - currentPct).toFixed(1)),
      volatility:   vols[p.symbol],
    };
  }).sort((a, b) => b.currentPct - a.currentPct);

  // High correlations
  const allCorrs        = buildCorrelationMatrix(returnsMap);
  const highCorrelations = allCorrs.filter(c => c.risk === 'high').slice(0, 5);

  // ✨ 2.5: Concentration — truyền closesMap (vol theo covariance), không còn returnsMap.
  const concentration = calcConcentrationRisk(positions, vols, closesMap);

  // Summary text cho AI
  const dangerPositions = concentration.bySymbol.filter(s => s.level === 'danger');
  const dangerSectors   = concentration.bySector.filter(s => s.level === 'danger');
  const highCorrPairs   = highCorrelations.slice(0, 2);

  const summaryParts: string[] = [
    `Portfolio gồm ${positions.length} mã, vol ước tính ${concentration.portfolioVolatility}%/năm, đa dạng hóa ${concentration.diversificationScore}/100.`,
  ];

  if (dangerPositions.length > 0) {
    summaryParts.push(
      `⚠️ Tập trung cao: ${dangerPositions.map(p => `${p.symbol}(${p.pct}%)`).join(', ')} — vượt 20% tổng danh mục.`
    );
  }

  if (dangerSectors.length > 0) {
    summaryParts.push(
      `⚠️ Rủi ro ngành: ${dangerSectors.map(s => `${s.sector}(${s.pct}%)`).join(', ')} — vượt 30%.`
    );
  }

  if (highCorrPairs.length > 0) {
    summaryParts.push(
      `📊 Tương quan cao: ${highCorrPairs.map(p => `${p.symbolA}-${p.symbolB}(${p.corr})`).join(', ')} — rủi ro cùng chiều.`
    );
  }

  // Risk parity suggestions — chỉ đề xuất nếu delta lớn
  const significantAdjustments = weights
    .filter(w => Math.abs(w.delta) > 5)
    .map(w => `${w.symbol}: ${w.delta > 0 ? 'tăng' : 'giảm'} ${Math.abs(w.delta).toFixed(0)}%`);

  if (significantAdjustments.length > 0) {
    summaryParts.push(
      `💡 Risk Parity gợi ý: ${significantAdjustments.join(', ')}.`
    );
  }

  return {
    weights,
    highCorrelations,
    concentration,
    summary: summaryParts.join(' '),
  };
}

// ─── Prompt builder ───

export function buildOptimizationPromptSection(
  result:  OptimizationResult,
  symbol?: string, // nếu có → focus vào 1 mã cụ thể
): string {
  const lines: string[] = ['[PORTFOLIO OPTIMIZATION]'];
  lines.push(result.summary);

  if (symbol) {
    const w = result.weights.find(x => x.symbol === symbol);
    if (w) {
      lines.push(
        `[${symbol}] Tỷ trọng hiện tại: ${w.currentPct}% | ` +
        `Risk Parity đề xuất: ${w.suggestedPct}% (${w.delta > 0 ? '+' : ''}${w.delta}%) | ` +
        `Vol: ${w.volatility}%/năm`
      );
    }

    // Correlation với các mã khác trong portfolio
    const relatedCorr = result.highCorrelations.filter(
      c => c.symbolA === symbol || c.symbolB === symbol
    );
    if (relatedCorr.length > 0) {
      const corrStr = relatedCorr.map(c => {
        const other = c.symbolA === symbol ? c.symbolB : c.symbolA;
        return `${other}(${c.corr})`;
      }).join(', ');
      lines.push(`Tương quan cao với: ${corrStr} — phân tán chưa tốt`);
    }
  }

  return lines.join('\n');
  }
