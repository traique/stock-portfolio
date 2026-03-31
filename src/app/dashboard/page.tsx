'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calcHolding, calcSummary, formatCurrency, formatDateTime, Holding, PriceMap } from '@/lib/calculations';

export default function DashboardPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [updatedAt, setUpdatedAt] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({ symbol: '', buy_price: '', quantity: '', buy_date: '', note: '' });

  const loadHoldings = useCallback(async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      window.location.href = '/auth/login';
      return;
    }

    setEmail(authData.user.email || '');

    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setHoldings([]);
    } else {
      setHoldings((data || []) as Holding[]);
    }

    setLoading(false);
  }, []);

  const loadPrices = useCallback(async (items: Holding[]) => {
    const symbols = [...new Set(items.map((item) => item.symbol.toUpperCase()))];

    if (!symbols.length) {
      setPrices({});
      setUpdatedAt('');
      return;
    }

    setRefreshing(true);
    const response = await fetch(`/api/prices?symbols=${symbols.join(',')}`, { cache: 'no-store' });
    const data = await response.json();
    setPrices(data.prices || {});
    setUpdatedAt(data.updatedAt || '');
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadHoldings();
  }, [loadHoldings]);

  useEffect(() => {
    if (holdings.length > 0) {
      loadPrices(holdings);
    } else {
      setPrices({});
      setUpdatedAt('');
    }
  }, [holdings, loadPrices]);

  const summary = useMemo(() => calcSummary(holdings, prices), [holdings, prices]);
  const summaryPct = summary.totalBuy > 0 ? (summary.totalPnl / summary.totalBuy) * 100 : 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      window.location.href = '/auth/login';
      return;
    }

    const { error } = await supabase.from('holdings').insert({
      user_id: authData.user.id,
      symbol: form.symbol.trim().toUpperCase(),
      buy_price: Number(form.buy_price),
      quantity: Number(form.quantity),
      buy_date: form.buy_date || null,
      note: form.note.trim() || null,
    });

    if (!error) {
      setForm({ symbol: '', buy_price: '', quantity: '', buy_date: '', note: '' });
      await loadHoldings();
    }
  }

  async function handleDelete(id: string, symbol: string) {
    if (!window.confirm(`Xóa ${symbol}?`)) return;
    const { error } = await supabase.from('holdings').delete().eq('id', id);
    if (!error) {
      await loadHoldings();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }

  return (
    <main className="container stack">
      <section className="hero">
        <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, opacity: 0.8 }}>Xin chào{email ? `, ${email}` : ''}</div>
            <h1 style={{ fontSize: 34, margin: '10px 0 0' }}>Danh mục cổ phiếu</h1>
            <p style={{ color: '#cbd5e1', marginTop: 8, lineHeight: 1.7 }}>
              Giá hiện tại được lấy khi mở trang hoặc khi bạn bấm làm mới.
            </p>
          </div>

          <div className="stack" style={{ gap: 10, minWidth: 220 }}>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: '10px 12px', fontSize: 14 }}>
              Cập nhật: {formatDateTime(updatedAt)}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-light" onClick={loadHoldings}>
                {refreshing || loading ? 'Đang tải...' : 'Làm mới'}
              </button>
              <button className="btn btn-outline" onClick={handleLogout}>
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: 20 }}>
        <h2 style={{ margin: 0 }}>Thêm cổ phiếu</h2>
        <p className="muted" style={{ marginTop: 8 }}>Nhập mã, giá mua, số lượng và ngày mua.</p>

        <form className="grid grid-2" style={{ marginTop: 16 }} onSubmit={handleSubmit}>
          <input className="input" placeholder="Mã cổ phiếu" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} required />
          <input className="input" type="number" placeholder="Giá mua" value={form.buy_price} onChange={(e) => setForm({ ...form, buy_price: e.target.value })} required />
          <input className="input" type="number" placeholder="Số lượng" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          <input className="input" type="date" value={form.buy_date} onChange={(e) => setForm({ ...form, buy_date: e.target.value })} />
          <input className="input" placeholder="Ghi chú" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button className="btn btn-primary" type="submit">Thêm mã</button>
        </form>
      </section>

      <section className="grid grid-4">
        <div className="card" style={{ padding: 18 }}>
          <div className="summary-label">Tổng vốn</div>
          <div className="summary-value">{formatCurrency(summary.totalBuy)}</div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="summary-label">Giá trị hiện tại</div>
          <div className="summary-value">{formatCurrency(summary.totalNow)}</div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="summary-label">Lời / Lỗ</div>
          <div className={`summary-value ${summary.totalPnl >= 0 ? 'positive' : 'negative'}`}>{formatCurrency(summary.totalPnl)}</div>
          <div className={summary.totalPnl >= 0 ? 'positive' : 'negative'} style={{ fontWeight: 600 }}>
            {summaryPct >= 0 ? '+' : ''}{summaryPct.toFixed(2)}%
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="summary-label">Số vị thế</div>
          <div className="summary-value">{holdings.length}</div>
        </div>
      </section>

      {loading ? (
        <section className="card" style={{ padding: 20 }}>Đang tải dữ liệu...</section>
      ) : holdings.length === 0 ? (
        <section className="card" style={{ padding: 20 }}>Chưa có mã nào. Hãy thêm mã đầu tiên của bạn.</section>
      ) : (
        <>
          <section className="mobile-list">
            {holdings.map((holding) => {
              const row = calcHolding(holding, prices);
              const positive = row.pnl >= 0;

              return (
                <div key={holding.id} className="card mobile-card">
                  <div className="row-between">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 20 }}>{holding.symbol}</div>
                      <div className="muted">SL: {holding.quantity}</div>
                    </div>
                    <button className="btn" style={{ border: '1px solid #fecaca', color: '#dc2626', background: 'white' }} onClick={() => handleDelete(holding.id, holding.symbol)}>
                      Xóa
                    </button>
                  </div>

                  <div className="mobile-card-grid" style={{ marginTop: 16 }}>
                    <div className="mobile-box"><div className="summary-label">Giá mua</div><div style={{ marginTop: 6, fontWeight: 700 }}>{formatCurrency(Number(holding.buy_price))}</div></div>
                    <div className="mobile-box"><div className="summary-label">Giá hiện tại</div><div style={{ marginTop: 6, fontWeight: 700 }}>{formatCurrency(row.currentPrice)}</div></div>
                    <div className="mobile-box"><div className="summary-label">Tổng mua</div><div style={{ marginTop: 6, fontWeight: 700 }}>{formatCurrency(row.totalBuy)}</div></div>
                    <div className="mobile-box"><div className="summary-label">Tổng hiện tại</div><div style={{ marginTop: 6, fontWeight: 700 }}>{formatCurrency(row.totalNow)}</div></div>
                  </div>

                  <div style={{ marginTop: 14, padding: 14, borderRadius: 16, background: '#f8fafc' }}>
                    <div className="summary-label">Lời / Lỗ</div>
                    <div className={positive ? 'positive' : 'negative'} style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                      {formatCurrency(row.pnl)}
                    </div>
                    <div className={positive ? 'positive' : 'negative'} style={{ fontWeight: 600 }}>
                      {row.pnlPct >= 0 ? '+' : ''}{row.pnlPct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="card desktop-table">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Giá mua</th>
                    <th>Giá hiện tại</th>
                    <th>Số lượng</th>
                    <th>Tổng mua</th>
                    <th>Tổng hiện tại</th>
                    <th>Lời / Lỗ</th>
                    <th>%</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => {
                    const row = calcHolding(holding, prices);
                    const positive = row.pnl >= 0;

                    return (
                      <tr key={holding.id}>
                        <td style={{ fontWeight: 700 }}>{holding.symbol}</td>
                        <td>{formatCurrency(Number(holding.buy_price))}</td>
                        <td>{formatCurrency(row.currentPrice)}</td>
                        <td>{holding.quantity}</td>
                        <td>{formatCurrency(row.totalBuy)}</td>
                        <td>{formatCurrency(row.totalNow)}</td>
                        <td className={positive ? 'positive' : 'negative'} style={{ fontWeight: 700 }}>{formatCurrency(row.pnl)}</td>
                        <td className={positive ? 'positive' : 'negative'} style={{ fontWeight: 700 }}>{row.pnlPct >= 0 ? '+' : ''}{row.pnlPct.toFixed(2)}%</td>
                        <td>
                          <button className="btn" style={{ border: '1px solid #fecaca', color: '#dc2626', background: 'white' }} onClick={() => handleDelete(holding.id, holding.symbol)}>
                            Xóa
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
