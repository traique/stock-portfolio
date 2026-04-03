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

const GOLD_TYPES: Array<{
  code: GoldCode;
  name: string;
  symbol: string;
  unit: string;
}> = [
  { code: 'SJL1L10', name: 'SJC 9999', symbol: 'SJL1L10', unit: 'VND/lượng' },
  { code: 'SJ9999', name: 'Nhẫn SJC', symbol: 'SJ9999', unit: 'VND/lượng' },
  { code: 'XAUUSD', name: 'Vàng thế giới', symbol: 'XAU/USD', unit: 'USD/oz' },
];

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIsoFromUnix(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
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

  const rowFromArray = Array.isArray(payload?.data)
    ? payload.data.find((item: { type_code?: string }) => item?.type_code === code) ?? payload.data[0]
    : null;

  const rowFromObject =
    payload?.data && !Array.isArray(payload.data) ? payload.data : null;

  const row = rowFromArray || rowFromObject || payload || {};

  const buy = toNumber(row?.buy);
  const sell = toNumber(row?.sell);
  const value = toNumber(row?.value);
  const price = toNumber(row?.price);

  const resolvedBuy = buy ?? value ?? price;
  const resolvedSell = sell ?? buy ?? value ?? price;

  const changeBuy =
    toNumber(row?.change_buy) ??
    toNumber(row?.change) ??
    toNumber(row?.change_value);

  const changeSell =
    toNumber(row?.change_sell) ??
    toNumber(row?.change) ??
    toNumber(row?.change_value);

  return {
    buy: resolvedBuy,
    sell: resolvedSell,
    changeBuy,
    changeSell,
    updatedAt:
      toIsoFromUnix(row?.update_time) ||
      toIsoFromUnix(payload?.current_time) ||
      null,
  };
}

export async function GET() {
  try {
    const settled = await Promise.allSettled(
      GOLD_TYPES.map(async (config) => ({
        config,
        row: await fetchGoldType(config.code),
      }))
    );

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

    return NextResponse.json({
      provider: 'vang.today',
      updatedAt: new Date().toISOString(),
      cards,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message, provider: 'vang.today' },
      { status: 500 }
    );
  }
    }
