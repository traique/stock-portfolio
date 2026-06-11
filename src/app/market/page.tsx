// src/app/market/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketOverview } from '@/lib/server/market-overview';

const REFRESH_MS = 30_000;

function fmt(n: number, digits = 2): string {
	return n.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function signColor(v: number): string {
	if (v > 0) return 'text-emerald-600';
	if (v < 0) return 'text-red-600';
	return 'text-gray-500';
}

function Sparkline({ closes }: { closes: number[] }) {
	if (closes.length < 2) return null;
	const w = 600, h = 140, pad = 4;
	const min = Math.min(...closes);
	const max = Math.max(...closes);
	const range = max - min || 1;
	const pts = closes.map((c, i) => {
		const x = pad + (i / (closes.length - 1)) * (w - pad * 2);
		const y = pad + (1 - (c - min) / range) * (h - pad * 2);
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	}).join(' ');
	const up = closes.at(-1)! >= closes[0];
	const stroke = up ? '#059669' : '#dc2626';
	return (
		<svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36">
			<polyline points={pts} fill="none" stroke={stroke} strokeWidth={2} />
		</svg>
	);
}

function Card({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
	return (
		<div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
			<div className={`mt-1 text-2xl font-semibold ${color ?? 'text-gray-900'}`}>{value}</div>
			{sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
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
		const start = () => {
			if (timer.current) return;
			timer.current = setInterval(() => {
				if (document.visibilityState === 'visible') load();
			}, REFRESH_MS);
		};
		const stop = () => {
			if (timer.current) { clearInterval(timer.current); timer.current = null; }
		};
		start();
		const onVis = () => { if (document.visibilityState === 'visible') load(); };
		document.addEventListener('visibilitychange', onVis);
		return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
	}, [load]);

	if (loading && !data) return <div className="p-6 text-gray-500">Đang tải tổng quan thị trường…</div>;
	if (error && !data) return <div className="p-6 text-red-600">{error}</div>;
	if (!data) return null;

	const { index, ma, trendScore, rsi14, volatilityPct, maxDrawdownPct, ytdPct, trend1mPct, trend3mPct, alignment, series, health } = data;

	return (
		<div className="mx-auto max-w-5xl p-6 space-y-6">
			<div className="flex items-baseline justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Tổng quan thị trường</h1>
					<p className="text-sm text-gray-500">
						VN-Index · cập nhật {new Date(index.updatedAt).toLocaleString('vi-VN')} · nguồn {index.provider}
						{!index.isRealtime && ' (close cuối phiên)'}
					</p>
				</div>
				<div className="text-right">
					<div className="text-3xl font-bold text-gray-900">{fmt(index.value)}</div>
					<div className={`text-sm font-medium ${signColor(index.changePct)}`}>
						{index.changePct > 0 ? '+' : ''}{fmt(index.changePct)}%
					</div>
				</div>
			</div>

			{health.degraded && (
				<div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
					⚠️ Nguồn giá realtime đang suy giảm — số liệu có thể trễ, hãy xác minh trước khi giao dịch.
				</div>
			)}

			<div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
				<div className="mb-2 text-sm font-medium text-gray-700">VN-Index 250 phiên</div>
				<Sparkline closes={series.closes} />
			</div>

			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<Card label="Trend Score" value={`${trendScore}/100`} sub={alignment.toUpperCase()} color={trendScore >= 60 ? 'text-emerald-600' : trendScore <= 40 ? 'text-red-600' : 'text-gray-900'} />
				<Card label="RSI 14" value={fmt(rsi14, 1)} sub={rsi14 > 70 ? 'Quá mua' : rsi14 < 30 ? 'Quá bán' : 'Trung tính'} />
				<Card label="YTD" value={`${ytdPct > 0 ? '+' : ''}${fmt(ytdPct)}%`} color={signColor(ytdPct)} />
				<Card label="Biến động (năm hoá)" value={`${fmt(volatilityPct)}%`} />
				<Card label="MA20" value={fmt(ma.ma20)} color={index.value >= ma.ma20 ? 'text-emerald-600' : 'text-red-600'} />
				<Card label="MA50" value={fmt(ma.ma50)} color={index.value >= ma.ma50 ? 'text-emerald-600' : 'text-red-600'} />
				<Card label="MA200" value={fmt(ma.ma200)} color={index.value >= ma.ma200 ? 'text-emerald-600' : 'text-red-600'} />
				<Card label="Drawdown tối đa (1N)" value={`${fmt(maxDrawdownPct)}%`} color="text-red-600" />
				<Card label="1 tháng" value={`${trend1mPct > 0 ? '+' : ''}${fmt(trend1mPct)}%`} color={signColor(trend1mPct)} />
				<Card label="3 tháng" value={`${trend3mPct > 0 ? '+' : ''}${fmt(trend3mPct)}%`} color={signColor(trend3mPct)} />
			</div>

			<p className="text-xs text-gray-400">
				Dữ liệu chỉ phục vụ tham khảo, không phải khuyến nghị đầu tư. Tự động làm mới mỗi 30 giây khi tab đang mở.
			</p>
		</div>
	);
}
