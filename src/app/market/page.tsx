// src/app/market/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { MarketOverview } from '@/lib/server/market-overview';

const REFRESH_MS = 30_000;

const GREEN = '#10b981';
const RED = '#ef4444';
const MUTED = '#9ca3af';
const TEXT = '#e5e7eb';

function fmt(n: number, digits = 2): string {
	return n.toLocaleString('vi-VN', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	});
}

function signColor(v: number): string {
	if (v > 0) return GREEN;
	if (v < 0) return RED;
	return MUTED;
}

function withSign(v: number, digits = 2): string {
	return `${v > 0 ? '+' : ''}${fmt(v, digits)}`;
}

// ─── Styles (inline — không phụ thuộc Tailwind) ─────────────────────────────
const pageStyle: CSSProperties = {
	maxWidth: 880,
	margin: '0 auto',
	padding: '24px 16px 56px',
	color: TEXT,
};
const headerRow: CSSProperties = {
	display: 'flex',
	alignItems: 'flex-end',
	justifyContent: 'space-between',
	gap: 16,
	flexWrap: 'wrap',
};
const h1Style: CSSProperties = {
	fontSize: 28,
	fontWeight: 800,
	margin: 0,
	letterSpacing: -0.5,
};
const subtle: CSSProperties = { color: MUTED, fontSize: 13, marginTop: 6 };
const bigValueWrap: CSSProperties = { textAlign: 'right' };
const bigValue: CSSProperties = {
	fontSize: 34,
	fontWeight: 800,
	lineHeight: 1.1,
	fontVariantNumeric: 'tabular-nums',
};
const cardStyle: CSSProperties = {
	background: 'rgba(255,255,255,0.04)',
	border: '1px solid rgba(255,255,255,0.08)',
	borderRadius: 16,
	padding: '14px 16px',
};
const gridStyle: CSSProperties = {
	display: 'grid',
	gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
	gap: 12,
	marginTop: 20,
};
const cardLabel: CSSProperties = {
	color: MUTED,
	fontSize: 12,
	fontWeight: 600,
	textTransform: 'uppercase',
	letterSpacing: 0.4,
};
const cardValue: CSSProperties = {
	fontSize: 22,
	fontWeight: 700,
	marginTop: 6,
	fontVariantNumeric: 'tabular-nums',
};
const cardSub: CSSProperties = { fontSize: 12, color: MUTED, marginTop: 2 };
const chartCard: CSSProperties = { ...cardStyle, marginTop: 20, padding: 16 };
const warnBox: CSSProperties = {
	marginTop: 16,
	padding: '10px 14px',
	borderRadius: 12,
	background: 'rgba(245,158,11,0.12)',
	border: '1px solid rgba(245,158,11,0.3)',
	color: '#fbbf24',
	fontSize: 13,
};
const footer: CSSProperties = {
	marginTop: 24,
	color: MUTED,
	fontSize: 12,
	lineHeight: 1.6,
};
const centerBox: CSSProperties = {
	...pageStyle,
	textAlign: 'center',
	color: MUTED,
	paddingTop: 80,
};

// ─── Sparkline ─────────────────────────────────────────────────
function Sparkline({ closes }: { closes: number[] }) {
	if (closes.length < 2) return null;
	const w = 800, h = 160, pad = 6;
	const min = Math.min(...closes);
	const max = Math.max(...closes);
	const range = max - min || 1;
	const pts = closes
		.map((c, i) => {
			const x = pad + (i / (closes.length - 1)) * (w - pad * 2);
			const y = pad + (1 - (c - min) / range) * (h - pad * 2);
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(' ');
	const up = closes.at(-1)! >= closes[0];
	const stroke = up ? GREEN : RED;
	const areaPts = `${pad},${h - pad} ${pts} ${w - pad},${h - pad}`;
	const svgStyle: CSSProperties = { width: '100%', height: 160, display: 'block' };
	return (
		<svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={svgStyle}>
			<defs>
				<linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
					<stop offset="100%" stopColor={stroke} stopOpacity={0} />
				</linearGradient>
			</defs>
			<polygon points={areaPts} fill="url(#sparkFill)" />
			<polyline
				points={pts}
				fill="none"
				stroke={stroke}
				strokeWidth={2}
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}

// ─── Metric card ──────────────────────────────────────────────
function Card({
	label,
	value,
	sub,
	color,
}: {
	label: string;
	value: string;
	sub?: string;
	color?: string;
}) {
	const valueStyle: CSSProperties = color ? { ...cardValue, color } : cardValue;
	return (
		<div style={cardStyle}>
			<div style={cardLabel}>{label}</div>
			<div style={valueStyle}>{value}</div>
			{sub ? <div style={cardSub}>{sub}</div> : null}
		</div>
	);
}

export default function MarketPage() {
	const [data, setData] = useState<MarketOverview | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const timer = useRef<ReturnType<typeof setInterval> | null>(null);

	const load = useCallback(async () => {
		try {
			const res = await fetch('/api/market-overview', { cache: 'no-store' });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = (await res.json()) as MarketOverview;
			setData(json);
			setError(null);
		} catch {
			setError('Không tải được dữ liệu thị trường.');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
		if (!timer.current) {
			timer.current = setInterval(() => {
				if (document.visibilityState === 'visible') load();
			}, REFRESH_MS);
		}
		const onVis = () => {
			if (document.visibilityState === 'visible') load();
		};
		document.addEventListener('visibilitychange', onVis);
		return () => {
			if (timer.current) {
				clearInterval(timer.current);
				timer.current = null;
			}
			document.removeEventListener('visibilitychange', onVis);
		};
	}, [load]);

	if (loading && !data) {
		return <div style={centerBox}>Đang tải tổng quan thị trường…</div>;
	}
	if (error && !data) {
		const errStyle: CSSProperties = { ...centerBox, color: RED };
		return <div style={errStyle}>{error}</div>;
	}
	if (!data) return null;

	const {
		index, ma, trendScore, rsi14, volatilityPct, maxDrawdownPct,
		ytdPct, trend1mPct, trend3mPct, alignment, series, health,
	} = data;

	const alignmentLabel =
		alignment === 'bullish' ? 'Xu hướng tăng'
			: alignment === 'bearish' ? 'Xu hướng giảm'
				: alignment === 'mixed' ? 'Phân hoá' : 'Chưa rõ';
	const trendColor = trendScore >= 60 ? GREEN : trendScore <= 40 ? RED : TEXT;
	const rsiSub = rsi14 > 70 ? 'Quá mua' : rsi14 < 30 ? 'Quá bán' : 'Trung tính';
	const changeStyle: CSSProperties = {
		fontSize: 16,
		fontWeight: 700,
		color: signColor(index.changePct),
	};
	const chartInner: CSSProperties = { marginTop: 10 };

	return (
		<div style={pageStyle}>
			<div style={headerRow}>
				<div>
					<h1 style={h1Style}>Tổng quan thị trường</h1>
					<div style={subtle}>
						VN-Index · cập nhật{' '}
						{new Date(index.updatedAt).toLocaleString('vi-VN')} · nguồn{' '}
						{index.provider}
						{!index.isRealtime ? ' (close cuối phiên)' : ''}
					</div>
				</div>
				<div style={bigValueWrap}>
					<div style={bigValue}>{fmt(index.value)}</div>
					<div style={changeStyle}>{withSign(index.changePct)}%</div>
				</div>
			</div>

			{health.degraded ? (
				<div style={warnBox}>
					⚠️ Nguồn giá realtime đang suy giảm — số liệu có thể trễ, hãy xác minh trước khi giao dịch.
				</div>
			) : null}

			<div style={chartCard}>
				<div style={cardLabel}>VN-Index · 250 phiên</div>
				<div style={chartInner}>
					<Sparkline closes={series.closes} />
				</div>
			</div>

			<div style={gridStyle}>
				<Card label="Trend Score" value={`${trendScore}/100`} sub={alignmentLabel} color={trendColor} />
				<Card label="RSI 14" value={fmt(rsi14, 1)} sub={rsiSub} />
				<Card label="YTD" value={`${withSign(ytdPct)}%`} color={signColor(ytdPct)} />
				<Card label="1 tháng" value={`${withSign(trend1mPct)}%`} color={signColor(trend1mPct)} />
				<Card label="3 tháng" value={`${withSign(trend3mPct)}%`} color={signColor(trend3mPct)} />
				<Card label="Biến động (năm hoá)" value={`${fmt(volatilityPct)}%`} />
				<Card label="Drawdown tối đa (1N)" value={`${fmt(maxDrawdownPct)}%`} color={RED} />
				<Card label="MA20" value={fmt(ma.ma20)} color={index.value >= ma.ma20 ? GREEN : RED} />
				<Card label="MA50" value={fmt(ma.ma50)} color={index.value >= ma.ma50 ? GREEN : RED} />
				<Card label="MA200" value={fmt(ma.ma200)} color={index.value >= ma.ma200 ? GREEN : RED} />
			</div>

			<div style={footer}>
				Dữ liệu chỉ phục vụ tham khảo, không phải khuyến nghị đầu tư. Tự động làm mới mỗi 30 giây khi tab đang mở.
			</div>
		</div>
	);
				}
