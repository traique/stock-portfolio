'use client';
// src/app/test-backend/page.tsx
//
// Trang test backend — truy cập tại https://lcta.vercel.app/test-backend
// Chạy trên cùng domain nên không bị CORS.
// XÓA FILE NÀY sau khi test xong (hoặc bảo vệ bằng auth).

import { useState, useCallback } from 'react';

type TestResult = {
  status: 'idle' | 'running' | 'ok' | 'fail';
  data?:  unknown;
  error?: string;
  latency?: number;
};

type Results = Record<string, TestResult>;

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const EDGE_URL      = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/vci-prices`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function edgePost(body: object) {
  const r = await fetch(EDGE_URL, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return d;
}

async function supabaseGet(path: string, headers: Record<string, string> = {}) {
  const r = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, ...headers },
  });
  if (!r.ok) {
    const e = await r.text();
    throw new Error(`HTTP ${r.status}: ${e.slice(0, 200)}`);
  }
  return { data: await r.json(), headers: r.headers };
}

// ─── Test definitions ─────────────────────────────────────────────────────────

const TESTS = [
  {
    id: 'edge-realtime',
    name: 'Edge — Realtime giá',
    desc: 'Mode mặc định: lấy giá hiện tại SHS',
    run: async (sym: string) => {
      const d = await edgePost({ symbols: [sym] });
      const price = d.prices?.[sym];
      if (!price) throw new Error(`Không có giá cho ${sym}`);
      return { price, exchange: d.detail?.[0]?.exchange, provider: d.provider };
    },
  },
  {
    id: 'edge-history',
    name: 'Edge — History mode (mới)',
    desc: 'VCI chart API: OHLCV 10 ngày cho HNX/UPCOM',
    run: async (sym: string) => {
      const d = await edgePost({ mode: 'history', symbols: [sym], days: 10 });
      const hist = d.history?.[0];
      if (!hist) throw new Error('Không có history');
      if (!hist.closes?.length) throw new Error(`closes rỗng — error: ${hist.error ?? 'unknown'}`);
      return { closes_count: hist.closes.length, last_close: hist.closes.at(-1), source: hist.source };
    },
  },
  {
    id: 'supabase-table',
    name: 'Supabase — Bảng price_history',
    desc: 'Kiểm tra bảng tồn tại và có data',
    run: async (sym: string) => {
      const { data } = await supabaseGet(
        `price_history?symbol=eq.${sym}&order=trade_date.desc&limit=5&select=trade_date,close,high,low,volume`
      );
      if (!Array.isArray(data)) throw new Error('Response không phải array');
      if (data.length === 0) return { rows: 0, note: '⚠️ Bảng trống — cần BACKFILL' };
      return { rows: data.length, latest: data[0].trade_date, close: data[0].close };
    },
  },
  {
    id: 'supabase-count',
    name: 'Supabase — Tổng rows',
    desc: 'Đếm tổng phiên đã lưu trong price_history',
    run: async (_sym: string) => {
      const { headers } = await supabaseGet(
        `price_history?select=symbol&limit=1`,
        { 'Prefer': 'count=exact' }
      );
      const total = parseInt(headers.get('content-range')?.split('/')[1] ?? '0');
      return { total_rows: total, note: total === 0 ? '⚠️ Chưa có data — chạy BACKFILL' : `✅ ${total} phiên đã lưu` };
    },
  },
  {
    id: 'yahoo-hose',
    name: 'Yahoo — BID.VN (HOSE)',
    desc: 'Kiểm tra Yahoo Finance còn hoạt động không',
    run: async (_sym: string) => {
      const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
      for (const host of hosts) {
        try {
          const r = await fetch(`https://${host}/v8/finance/chart/BID.VN?interval=1d&range=5d`);
          if (!r.ok) continue;
          const d = await r.json();
          const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean);
          if (closes?.length) return { host, closes_count: closes.length, last: closes.at(-1) };
        } catch { /* try next */ }
      }
      throw new Error('Cả 2 Yahoo hosts đều fail');
    },
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function TestBackendPage() {
  const [sym, setSym]         = useState('SHS');
  const [results, setResults] = useState<Results>({});
  const [logs, setLogs]       = useState<Array<{ msg: string; type: string }>>([]);
  const [running, setRunning] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const addLog = useCallback((msg: string, type = 'info') => {
    setLogs(l => [...l, { msg: `[${new Date().toTimeString().slice(0,8)}] ${msg}`, type }]);
  }, []);

  const runOne = useCallback(async (t: typeof TESTS[0]) => {
    setResults(r => ({ ...r, [t.id]: { status: 'running' } }));
    addLog(`Testing: ${t.name}`, 'info');
    const start = Date.now();
    try {
      const data    = await t.run(sym);
      const latency = Date.now() - start;
      setResults(r => ({ ...r, [t.id]: { status: 'ok', data, latency } }));
      addLog(`✅ ${t.name} — ${latency}ms`, 'ok');
    } catch (err) {
      const latency = Date.now() - start;
      const msg     = err instanceof Error ? err.message : String(err);
      setResults(r => ({ ...r, [t.id]: { status: 'fail', error: msg, latency } }));
      addLog(`❌ ${t.name} — ${msg}`, 'err');
    }
  }, [sym, addLog]);

  const runAll = useCallback(async () => {
    setRunning(true);
    setResults({});
    setLogs([]);
    for (const t of TESTS) {
      await runOne(t);
      await new Promise(r => setTimeout(r, 200));
    }
    setRunning(false);
    addLog('── Xong ──', 'info');
  }, [runOne, addLog]);

  const runBackfill = useCallback(async (days: number) => {
    setBackfilling(true);
    addLog(`Bắt đầu backfill ${days} ngày...`, 'info');
    try {
      const start = Date.now();
      const d = await edgePost({ mode: 'eod', days });
      const latency = Date.now() - start;
      addLog(`✅ EOD ${days}d — ${latency}ms | symbols:${d.symbols} ok:${d.success} fail:${d.failed}`, 'ok');
      if (d.errors?.length) {
        d.errors.forEach((e: { symbol: string; error: string }) =>
          addLog(`  ⚠️ ${e.symbol}: ${e.error}`, 'err')
        );
      }
      // Re-check supabase
      const tc = TESTS.find(t => t.id === 'supabase-count')!;
      const ts = TESTS.find(t => t.id === 'supabase-table')!;
      await runOne(tc);
      await runOne(ts);
    } catch (err) {
      addLog(`❌ Lỗi: ${err instanceof Error ? err.message : String(err)}`, 'err');
    }
    setBackfilling(false);
  }, [runOne, addLog]);

  const ok   = Object.values(results).filter(r => r.status === 'ok').length;
  const fail = Object.values(results).filter(r => r.status === 'fail').length;
  const supabaseEmpty = results['supabase-table']?.status === 'ok' &&
    (results['supabase-table'].data as { rows: number })?.rows === 0;
  const supabaseHasData = results['supabase-count']?.status === 'ok' &&
    ((results['supabase-count'].data as { total_rows: number })?.total_rows ?? 0) > 0;

  // ── Styles ──
  const S = {
    page:    { background: '#0a0e1a', minHeight: '100vh', padding: 16, color: '#e2e8f0', fontFamily: "'Be Vietnam Pro', sans-serif", fontSize: 14 } as React.CSSProperties,
    card:    { background: '#111827', border: '1px solid #1e2d45', borderRadius: 14, padding: 14, marginBottom: 12 } as React.CSSProperties,
    label:   { fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 6 },
    input:   { width: '100%', background: '#0a0e1a', border: '1px solid #1e2d45', borderRadius: 10, color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12, padding: '10px 12px', outline: 'none', marginBottom: 8 } as React.CSSProperties,
    btn:     (bg: string, color = '#fff') => ({ display: 'block', width: '100%', padding: 14, border: 'none', borderRadius: 12, background: bg, color, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10, fontFamily: "'Be Vietnam Pro', sans-serif" }) as React.CSSProperties,
    badgeOk: { background: 'rgba(16,185,129,.15)', color: '#10b981', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99 } as React.CSSProperties,
    badgeFail: { background: 'rgba(244,63,94,.15)', color: '#f43f5e', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99 } as React.CSSProperties,
    badgeIdle: { background: '#1e2d45', color: '#64748b', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99 } as React.CSSProperties,
    badgeRun:  { background: 'rgba(245,158,11,.15)', color: '#f59e0b', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99 } as React.CSSProperties,
    pre:     (ok: boolean) => ({ fontFamily: 'monospace', fontSize: 11, color: ok ? '#10b981' : '#f43f5e', background: '#0a0e1a', borderRadius: 8, padding: 10, overflowX: 'auto' as const, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const, maxHeight: 180, overflowY: 'auto' as const }) as React.CSSProperties,
  };

  const getBadgeStyle = (s: TestResult['status']) =>
    s === 'ok' ? S.badgeOk : s === 'fail' ? S.badgeFail : s === 'running' ? S.badgeRun : S.badgeIdle;
  const getBadgeText  = (s: TestResult['status']) =>
    s === 'ok' ? '✓ OK' : s === 'fail' ? '✗ FAIL' : s === 'running' ? '...' : 'IDLE';
  const getBorder     = (s: TestResult['status']) =>
    s === 'ok' ? '#10b981' : s === 'fail' ? '#f43f5e' : s === 'running' ? '#f59e0b' : '#1e2d45';

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700&display=swap" rel="stylesheet" />

      <div style={{ textAlign: 'center', paddingBottom: 20, marginBottom: 20, borderBottom: '1px solid #1e2d45' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '.15em', textTransform: 'uppercase' }}>LCTA · Backend Test</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Chạy tại lcta.vercel.app/test-backend</div>
      </div>

      {/* Config */}
      <div style={S.card}>
        <div style={S.label}>Symbol test</div>
        <input style={S.input} value={sym} onChange={e => setSym(e.target.value.toUpperCase())}
          placeholder="VD: SHS (HNX), BID (HOSE)" />
        <div style={{ fontSize: 11, color: '#64748b' }}>
          URL: {SUPABASE_URL ? '✅ ' + SUPABASE_URL.slice(8, 30) + '...' : '❌ Chưa có env'}
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Tests', value: Object.keys(results).length, color: '#e2e8f0' },
          { label: 'OK',    value: ok,   color: '#10b981' },
          { label: 'Fail',  value: fail, color: '#f43f5e' },
        ].map(s => (
          <div key={s.label} style={{ ...S.card, textAlign: 'center', marginBottom: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Test cards */}
      {TESTS.map(t => {
        const r = results[t.id] ?? { status: 'idle' as const };
        return (
          <div key={t.id} style={{ ...S.card, borderColor: getBorder(r.status), marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={getBadgeStyle(r.status)}>{getBadgeText(r.status)}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</span>
              </div>
              {r.latency && <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>{r.latency}ms</span>}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: r.status !== 'idle' ? 8 : 0 }}>{t.desc}</div>
            {r.status !== 'idle' && r.status !== 'running' && (
              <pre style={S.pre(r.status === 'ok')}>
                {JSON.stringify(r.status === 'ok' ? r.data : r.error, null, 2)}
              </pre>
            )}
          </div>
        );
      })}

      {/* Debug section */}
      <div style={S.card}>
        <div style={S.label}>🔍 Debug Edge Function</div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
          Edge URL: <span style={{ color: '#7dd3fc', fontFamily: 'monospace' }}>{EDGE_URL.slice(0, 50)}...</span>
        </div>
        <button style={{ ...S.btn('#6366f1'), marginBottom: 8 }} onClick={async () => {
          addLog('Ping Edge Function (GET)...', 'info');
          try {
            const r = await fetch(EDGE_URL, {
              method: 'GET',
              headers: { 'Authorization': `Bearer ${SUPABASE_ANON}` },
            });
            addLog(`GET response: HTTP ${r.status} ${r.statusText}`, r.ok ? 'ok' : 'err');
            const text = await r.text();
            addLog(`Body: ${text.slice(0, 200)}`, 'info');
          } catch(e) {
            addLog(`Fetch error: ${e instanceof Error ? e.message : String(e)}`, 'err');
          }
        }}>
          🏓 PING Edge (GET)
        </button>
        <button style={{ ...S.btn('#6366f1'), marginBottom: 8 }} onClick={async () => {
          addLog('Test Edge minimal POST...', 'info');
          try {
            const r = await fetch(EDGE_URL, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbols: ['VCB'] }),
            });
            addLog(`POST response: HTTP ${r.status}`, r.ok ? 'ok' : 'err');
            const text = await r.text();
            addLog(`Body preview: ${text.slice(0, 300)}`, 'info');
          } catch(e) {
            const msg = e instanceof Error ? e.message : String(e);
            addLog(`Failed to fetch — ${msg}`, 'err');
          }
        }}>
          📨 POST minimal (VCB)
        </button>
        <button style={{ ...S.btn('#8b5cf6'), marginBottom: 0 }} onClick={async () => {
          addLog('🔍 Probe chart endpoints — tìm URL đúng...', 'info');
          try {
            const r = await fetch(EDGE_URL, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: 'probe', symbol: sym }),
            });
            const d = await r.json();
            if (!r.ok) { addLog(`Probe error: ${JSON.stringify(d)}`, 'err'); return; }
            d.results?.forEach((ep: {name: string; status: number; ok: boolean; preview?: string; error?: string}) => {
              if (ep.ok) {
                addLog(`✅ ${ep.name} — HTTP ${ep.status} — ${ep.preview?.slice(0,100)}`, 'ok');
              } else {
                addLog(`❌ ${ep.name} — HTTP ${ep.status}${ep.error ? ' — ' + ep.error : ''}`, 'err');
              }
            });
          } catch(e) {
            addLog(`Probe failed: ${e instanceof Error ? e.message : String(e)}`, 'err');
          }
        }}>
          🔍 PROBE CHART ENDPOINTS
        </button>
      </div>

      {/* Buttons */}
      <button style={S.btn('#3b82f6')} onClick={runAll} disabled={running}>
        {running ? '⏳ Đang chạy...' : '▶ CHẠY TẤT CẢ TESTS'}
      </button>

      {(supabaseEmpty || !results['supabase-table']) && (
        <button style={S.btn('#10b981')} onClick={() => runBackfill(90)} disabled={backfilling}>
          {backfilling ? '⏳ Đang backfill...' : '📥 BACKFILL 90 NGÀY (lần đầu)'}
        </button>
      )}

      {supabaseHasData && (
        <button style={S.btn('#f59e0b', '#000')} onClick={() => runBackfill(5)} disabled={backfilling}>
          {backfilling ? '⏳ Đang chạy...' : '🔄 TEST EOD 5 NGÀY'}
        </button>
      )}

      {/* Log */}
      <div style={{ ...S.card, maxHeight: 280, overflowY: 'auto' }}>
        <div style={S.label}>📋 Log</div>
        {logs.length === 0 && <div style={{ fontSize: 11, color: '#64748b' }}>Nhấn CHẠY để bắt đầu...</div>}
        {logs.map((l, i) => (
          <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', marginBottom: 2,
            color: l.type === 'ok' ? '#10b981' : l.type === 'err' ? '#f43f5e' : '#f59e0b' }}>
            {l.msg}
          </div>
        ))}
      </div>

      {/* SQL */}
      <div style={S.card}>
        <div style={S.label}>📊 SQL kiểm tra trong Supabase</div>
        <pre style={{ fontFamily: 'monospace', fontSize: 11, color: '#7dd3fc', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
{`SELECT symbol, COUNT(*) as days,
  MIN(trade_date) as oldest,
  MAX(trade_date) as newest
FROM price_history
GROUP BY symbol
ORDER BY symbol;`}
        </pre>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: '#64748b', paddingBottom: 20 }}>
        Xóa file này sau khi test xong
      </div>
    </div>
  );
}
