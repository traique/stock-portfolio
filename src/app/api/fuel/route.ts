import { NextResponse } from 'next/server';

type FuelCard = {
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  unit: string;
  source: string;
  updatedAt: string | null;
};

type FuelTarget = {
  code: string;
  name: string;
  aliases: string[];
  unit: string;
  preferredSource: 'petrolimex' | 'pvoil';
};

const TARGETS: FuelTarget[] = [
  { code: 'RON95V', name: 'RON95-V', aliases: ['RON 95-V', 'RON95-V'], unit: 'VND/lít', preferredSource: 'petrolimex' },
  { code: 'RON95III', name: 'RON95-III', aliases: ['RON 95-III', 'RON95-III'], unit: 'VND/lít', preferredSource: 'pvoil' },
  { code: 'E10RON95III', name: 'E10 RON95-III', aliases: ['E10 RON 95-III', 'E10RON95-III'], unit: 'VND/lít', preferredSource: 'pvoil' },
  { code: 'E5RON92II', name: 'E5 RON92-II', aliases: ['E5 RON 92-II', 'E5RON92-II'], unit: 'VND/lít', preferredSource: 'pvoil' },
  { code: 'DO0001SV', name: 'Diesel 0.001S-V', aliases: ['DO 0,001S-V', 'DO 0.001S-V', '0.001S-V'], unit: 'VND/lít', preferredSource: 'pvoil' },
  { code: 'DO005SII', name: 'Diesel 0.05S-II', aliases: ['DO 0,05S-II', 'DO 0.05S-II', '0.05S-II'], unit: 'VND/lít', preferredSource: 'pvoil' },
  { code: 'KO2K', name: 'Dầu hỏa 2-K', aliases: ['Dầu KO', 'Dầu hỏa 2-K', 'Dầu hỏa', 'KO'], unit: 'VND/lít', preferredSource: 'pvoil' },
];

function parseViNumber(raw: string | null | undefined) {
  if (!raw) return null;
  const cleaned = raw.replace(/\s|đ|VND|\(|\)/gi, '').replace(/,/g, '.').replace(/\.(?=\d{3}(\D|$))/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function cleanHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractValueNear(text: string, aliases: string[]) {
  for (const alias of aliases) {
    const regex = new RegExp(`${escapeRegExp(alias)}[^\d+\-]{0,80}(\
      \d{1,3}(?:[\.,]\d{3})+
    )(?:[^\d+\-]{0,40}([+\-]\d{1,3}(?:[\.,]\d{3})*))?`, 'ix');
    const match = text.match(regex);
    if (match) {
      return { price: parseViNumber(match[1]), change: parseViNumber(match[2]) };
    }
  }
  return null;
}

async function fetchPage(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Fetch failed: ' + url + ' ' + response.status);
  return response.text();
}

export async function GET() {
  try {
    const [pvoilHtml, petrolimexHtml] = await Promise.allSettled([
      fetchPage('https://www.pvoil.com.vn/bang-gia-xang-dau'),
      fetchPage('https://public.petrolimex.com.vn/details.html'),
    ]);

    const pvoilText = pvoilHtml.status === 'fulfilled' ? cleanHtml(pvoilHtml.value) : '';
    const petrolimexText = petrolimexHtml.status === 'fulfilled' ? cleanHtml(petrolimexHtml.value) : '';

    const cards: FuelCard[] = TARGETS.map((target) => {
      const primaryText = target.preferredSource === 'petrolimex' ? petrolimexText : pvoilText;
      const secondaryText = target.preferredSource === 'petrolimex' ? pvoilText : petrolimexText;
      const primary = extractValueNear(primaryText, target.aliases);
      const secondary = primary ? null : extractValueNear(secondaryText, target.aliases);
      const chosen = primary || secondary;
      const source = primary ? target.preferredSource : secondary ? (target.preferredSource === 'petrolimex' ? 'pvoil' : 'petrolimex') : target.preferredSource;
      return {
        code: target.code,
        name: target.name,
        price: chosen?.price ?? null,
        change: chosen?.change ?? null,
        unit: target.unit,
        source,
        updatedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({ provider: 'pvoil+petrolimex', updatedAt: new Date().toISOString(), cards, debug: { pvoilLoaded: Boolean(pvoilText), petrolimexLoaded: Boolean(petrolimexText) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message, provider: 'pvoil+petrolimex' }, { status: 500 });
  }
}
