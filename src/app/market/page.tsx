// src/app/market/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';
import type { MarketOverview } from '@/lib/server/market-overview';

const REFRESH_MS = 30_000;

// Màu theo theme — dùng CSS variables để tự đổi sáng/tối
const GREEN = 'var(--green)';
const RED = 'var(--red)';
const MUTED = 'var(--muted)';
const TEXT = 'var(--text)';

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

// ─── Styles (inline + CSS variables — đồng bộ theme & các trang khác) ───
const pageWrap: CSSProperties = {
	minHeight: '100vh',
	color: 'var(--text)',
};
const container: CSSProperties = {
	maxWidth: 960,
	margin: '0 auto',
	padding: '12px 16px 56px',
};
const content: CSSProperties = { marginTop: 20 };
const headerRow: CSSProperties = {
	display: 'flex',
	alignItems: 'flex-end',
	justifyContent: 'space-between',
	gap: 16,
	flexWrap: 'wrap',
};
const h1Style: CSSProperties = {
	fontSize: 26,
	fontWeight: 800,
	margin: 0,
	letterSpacing: -0.5,
	color: 'var(--text)',
};
const subtle: CSSProperties = { color: 'var(--muted)', fontSize: 13, marginTop: 6 };
const bigValueWrap: CSSProperties = { textAlign: 'right' };
const bigValue: CSSProperties = {
	fontSize: 34,
	fontWeight: 800,
	lineHeight: 1.1,
	color: 'var(--text)',
	fontVariantNumeric: 'tabular-nums',
};
const cardStyle: CSSProperties = {
	background: 'var(--card)',
	backdropFilter: 'var(--glass-backdrop)',
	WebkitBackdropFilter: 'var(--glass-backdrop)',
	borderTop: '1px solid var(--glass-ring)',
	borderLeft: '1px solid var(--glass-ring)',
	borderRight: '1px solid var(--glass-ring-b)',
	borderBottom: '1px solid var(--glass-ring-b)',
	borderRadius: 18,
	boxShadow: 'var(--glass-shadow)',
	padding: '14px 16px',
};
const gridStyle: CSSProperties = {
	display: 'grid',
	gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
	gap: 12,
	marginTop: 16,
};
const cardLabel: CSSProperties = {
	color: 'var(--muted)',
	fontSize: 12,
	fontWeight: 700,
	textTransform: 'uppercase',
	letterSpacing: 0.4,
};
const cardValue: CSSProperties = {
	fontSize: 22,
	fontWeight: 700,
	marginTop: 6,
	color: 'var(--text)',
	fontVariantNumeric: 'tabular-nums',
};
const cardSub: CSSProperties = { fontSize: 12, color: 'var(--muted)', marginTop: 2 };
const chartCard: CSSProperties = { ...cardStyle, marginTop: 16, padding: 16 };
const warnBox: CSSProperties = {
	marginTop: 16,
	padding: '10px 14px',
	borderRadius: 14,
	background: 'rgba(245,158,11,0.12)',
	border: '1px solid var(--border-strong)',
	color: 'var(--yellow)',
	fontSize: 13,
};
const footer: CSSProperties = {
	marginTop: 24,
	color: 'var(--muted)',
	fontSize: 12,
	lineHeight: 1.6,
};
const centerBox: CSSProperties = {
	maxWidth: 960,
	margin: '0 auto',
	padding: '80px 16px',
	textAlign: 'center',
	color: 'var(--muted)',
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
	const strokeVar = up ? 'var(--green)' : 'var(--red)';
	const areaPts = `${pad},${h - pad} ${pts} ${w - pad},${h - pad}`;
	const svgStyle: CSSProperties = { width: '100%', height: 160, display: 'block' };
	const lineStyle: CSSProperties = { fill: 'none', stroke: strokeVar };
	const stop0: CSSProperties = { stopColor: strokeVar, stopOpacity: 0.28 };
	const stop1: CSSProperties = { stopColor: strokeVar, stopOpacity: 0 };
	return (
		<svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={svgStyle}>
			<defs>
				<linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" style={stop0} />
					<stop offset="100%" style={stop1} />
				</linearGradient>
			</defs>
			<polygon points={areaPts} fill="url(#sparkFill)" />
			<polyline
				points={pts}
				style={lineStyle}
				strokeWidth={2}
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}

// ─── Metric card ──────────────────────────────────────────────
function Card({ label, value, sub, color }: {
	label: string; value: string; sub?: string; color?: string;
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
	const [email, setEmail] = useState('');
	const [data, setData] = useState<MarketOverview | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const timer = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ''));
	}, []);

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

	const logout = () => supabase.auth.signOut().then(() => { window.location.href = '/'; });

	const header = (
		<AppShellHeader
			email={email}
			isLoggedIn={!!email}
			currentTab="market"
			onLogout={logout}
		/>
	);

	if (loading && !data) {
		return (
			<div className="ab-page" style={pageWrap}>
				<div style={container}>
					{header}
					<div style={centerBox}>Đang tải tổng quan thị trường…</div>
				</div>
			</div>
		);
	}
	if (error && !data) {
		const errStyle: CSSProperties = { ...centerBox, color: 'var(--red)' };
		return (
			<div className="ab-page" style={pageWrap}>
				<div style={container}>
					{header}
					<div style={errStyle}>{error}</div>
				</div>
			</div>
		);
	}
	if (!data) {
		return (
			<div className="ab-page" style={pageWrap}>
				<div style={container}>{header}</div>
			</div>
		);
	}

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
		fontSize: 16, fontWeight: 700, color: signColor(index.changePct),
	};
	const chartInner: CSSProperties = { marginTop: 10 };

	return (
		<div className="ab-page" style={pageWrap}>
			<div style={container}>
				{header}

				<div style={content}>
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
			</div>
		</div>
	);
	}
