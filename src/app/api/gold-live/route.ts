import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

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

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function toIsoFromUnix(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function pickFirstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = toNumber(value);
    if (n !== null) return n;
  }
  return null;
}

async function fetchGoldApiType(code: GoldCode) {
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

  return {
    row,
    payload,
  };
}

async function fetchWorldGoldFallback() {
  const response = await fetch('https://vang.today/vi/chi-tiet/XAUUSD', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    cache: 'no-store',
  });

  if (!response.ok) return { price: null, change: null };

  const html = await response.text();
  const $ = cheerio.load(html);
  const text = $.text().replace(/\s+/g, ' ');

  // Bắt kiểu: "$4,634.30" và "+13.40" / "-152.80"
  const priceMatch = text.match(/\$ ?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
  const changeMatch = text.match(/([+-]\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);

  const price = priceMatch ? toNumber(priceMatch[1]) : null;
  const change = changeMatch ? toNumber(changeMatch[1]) : null;

  return { price, change };
}

async function fetchGoldType(code: GoldCode) {
  const { row, payload } = await fetchGoldApiType(code);

  if (code === 'XAUUSD') {
    let worldPrice = pickFirstNumber(
      row?.price,
      row?.value,
      row?.sell,
      row?.buy,
      row?.last_price,
      row?.lastPrice,
      payload?.price,
      payload?.value,
      payload?.sell,
      payload?.buy,
      payload?.last_price,
      payload?.lastPrice
    );

    let worldChange = pickFirstNumber(
      row?.change,
      row?.change_value,
      row?.change_sell,
      row?.change_buy,
      payload?.change,
      payload?.change_value,
      payload?.change_sell,
      payload?.change_buy
    );

    if (worldPrice === null) {
      const fallback = await fetchWorldGoldFallback();
      worldPrice = fallback.price;
      worldChange = worldChange ?? fallback.change;
    }

    return {
      buy: worldPrice,
      sell: worldPrice,
      changeBuy: worldChange,
      changeSell: worldChange,
      updatedAt:
        toIsoFromUnix(row?.update_time) ||
        toIsoFromUnix(payload?.current_time) ||
        new Date().toISOString(),
    };
  }

  const buy = pickFirstNumber(row?.buy, row?.price, row?.value);
  const sell = pickFirstNumber(row?.sell, row?.buy, row?.price, row?.value);

  const changeBuy = pickFirstNumber(
    row?.change_buy,
    row?.change,
    row?.change_value
  );

  const changeSell = pickFirstNumber(
    row?.change_sell,
    row?.change,
    row?.change_value
  );

  return {
    buy,
    sell,
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
