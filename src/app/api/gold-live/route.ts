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

function toIsoFromDateAndTime(dateRaw: unknown, timeRaw: unknown): string | null {
  const date = typeof dateRaw === 'string' ? dateRaw.trim() : '';
  const time = typeof timeRaw === 'string' ? timeRaw.trim() : '';
  if (!date || !time) return null;
  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
  const parsed = new Date(`${date}T${normalizedTime}+07:00`);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function pickFirstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = toNumber(value);
    if (n !== null && n !== 0) return n;
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

  return { row, payload };
}

function extractWorldGoldFromText(text: string) {
  const compact = text.replace(/\s+/g, ' ');

  const block =
    compact.match(/Vàng Thế Giới.{0,400}XAU\/USD.{0,800}/i)?.[0] ||
    compact.match(/Vàng thế giới.{0,400}XAU\/USD.{0,800}/i)?.[0] ||
    compact.match(/XAU\/USD.{0,800}/i)?.[0] ||
    compact;

  const priceMatch = block.match(/\$ ?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
  const price = priceMatch ? toNumber(priceMatch[1]) : null;

  if (price === null) {
    return { price: null, change: null };
  }

  const priceLiteral = priceMatch?.[0] ?? '';
  const afterPrice = priceLiteral ? block.slice(block.indexOf(priceLiteral) + priceLiteral.length, block.indexOf(priceLiteral) + priceLiteral.length + 160) : block;

  const nearChangeMatch =
    afterPrice.match(/[↑↗]?\s*([+-]\d{1,3}(?:,\d{3})*(?:\.\d+)?)/) ||
    afterPrice.match(/([+-]\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);

  const change = nearChangeMatch ? toNumber(nearChangeMatch[1]) : null;

  return { price, change };
}

async function scrapeWorldGoldFromDetailPage() {
  const response = await fetch('https://www.vang.today/vi/chi-tiet/XAUUSD', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    cache: 'no-store',
  });

  if (!response.ok) return { price: null, change: null };

  const html = await response.text();
  const $ = cheerio.load(html);
  return extractWorldGoldFromText($.text());
}

async function scrapeWorldGoldFromHomePage() {
  const response = await fetch('https://www.vang.today/', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    cache: 'no-store',
  });

  if (!response.ok) return { price: null, change: null };

  const html = await response.text();
  const $ = cheerio.load(html);
  return extractWorldGoldFromText($.text());
}

async function fetchGoldType(code: GoldCode) {
  const { row, payload } = await fetchGoldApiType(code);
  const sourceTime = typeof payload?.time === 'string' ? payload.time : null;
  const sourceDate = typeof payload?.date === 'string' ? payload.date : null;
  const sourceIso = toIsoFromDateAndTime(sourceDate, sourceTime);

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

    let worldChange: number | null = null;

    const detailFallback = await scrapeWorldGoldFromDetailPage();
    worldPrice = worldPrice ?? detailFallback.price;
    worldChange = detailFallback.change;

    if (worldPrice === null || worldChange === null) {
      const homeFallback = await scrapeWorldGoldFromHomePage();
      worldPrice = worldPrice ?? homeFallback.price;
      worldChange = worldChange ?? homeFallback.change;
    }

    worldChange =
      worldChange ??
      pickFirstNumber(
        row?.change,
        row?.change_value,
        row?.change_sell,
        row?.change_buy,
        payload?.change,
        payload?.change_value,
        payload?.change_sell,
        payload?.change_buy
      );

    return {
      buy: worldPrice,
      sell: worldPrice,
      changeBuy: worldChange,
      changeSell: worldChange,
      updatedAt: sourceIso || toIsoFromUnix(row?.update_time) || toIsoFromUnix(payload?.current_time) || new Date().toISOString(),
      sourceTime,
      sourceDate,
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
    updatedAt: sourceIso || toIsoFromUnix(row?.update_time) || toIsoFromUnix(payload?.current_time) || null,
    sourceTime,
    sourceDate,
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

    const firstMeta = settled.find((result) => result.status === 'fulfilled' && (result.value.row.sourceTime || result.value.row.sourceDate));
    const sourceTime = firstMeta && firstMeta.status === 'fulfilled' ? firstMeta.value.row.sourceTime : null;
    const sourceDate = firstMeta && firstMeta.status === 'fulfilled' ? firstMeta.value.row.sourceDate : null;

    return NextResponse.json({
      provider: 'vang.today',
      updatedAt: new Date().toISOString(),
      sourceTime,
      sourceDate,
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
