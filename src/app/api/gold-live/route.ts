import { NextResponse } from 'next/server';

type GoldCode = 'SJL1L10' | 'SJ9999' | 'XAUUSD';

type GoldCard = {
  code: GoldCode;
  name: string;
  symbol: string;
  buy: number | null;
  sell: number | null;
  changeBuy: number | null;
  changeSell: number | null;
  updatedAt: string | null;
  unit: string;
};

const GOLD_TYPES: Array<{ code: GoldCode; name: string; symbol: string; unit: string }> = [
  { code: 'SJL1L10', name: 'SJC 9999', symbol: 'SJL1L10', unit: 'VND/lượng' },
  { code: 'SJ9999', name: 'Nhẫn SJC', symbol: 'SJ9999', unit: 'VND/lượng' },
  { code: 'XAUUSD', name: 'Vàng thế giới', symbol: 'XAU/USD', unit: 'USD/oz' },
];

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asIsoFromUnix(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

async function fetchGoldType(code: GoldCode) {
  const response = await fetch(`https://www.vang.today/api/prices?type=${code}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Gold API failed for ${code}: ${response.status}`);
  }

  const payload = await response.json();
  const fromArray = Array.isArray(payload?.data)
    ? payload.data.find((item: { type_code?: string }) => item?.type_code === code) || payload.data[0]
    : null;
  const fromObject = payload?.data && !Array.isArray(payload.data) ? payload.data : null;
  const row = fromArray || fromObject || payload;

  return {
    buy: asNumber(row?.buy),
    sell: asNumber(row?.sell),
    changeBuy: asNumber(row?.change_buy),
    changeSell: asNumber(row?.change_sell),
    updatedAt: asIsoFromUnix(row?.update_time) || asIsoFromUnix(payload?.current_time),
  };
}

export async function GET() {
  try {
    const settled = await Promise.allSettled(GOLD_TYPES.map(async (config) => ({ config, row: await fetchGoldType(config.code) })));

    const cards: GoldCard[] = GOLD_TYPES.map((config, index) => {
      const result = settled[index];
      const row = result.status === 'fulfilled' ? result.value.row : null;
      return {
        code: config.code,
        name: config.name,
        symbol: config.symbol,
        buy: row?.buy ?? null,
        sell: row?.sell ?? null,
        changeBuy: row?.changeBuy ?? null,
        changeSell: row?.changeSell ?? null,
        updatedAt: row?.updatedAt ?? null,
        unit: config.unit,
      };
    });

    return NextResponse.json({ provider: 'vang.today', updatedAt: new Date().toISOString(), cards });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message, provider: 'vang.today' }, { status: 500 });
  }
}
