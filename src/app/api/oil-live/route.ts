import { NextResponse } from 'next/server';

type OilCard = {
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  unit: string;
  source: string;
  updatedAt: string | null;
};

type OilTarget = {
  code: string;
  name: string;
  aliases: string[];
  source: 'petrolimex' | 'pvoil';
};

const TARGETS: OilTarget[] = [
  { code: 'RON95V', name: 'RON95-V', aliases: ['Xăng RON 95-V', 'RON 95-V', 'RON95-V'], source: 'petrolimex' },
  { code: 'RON95III', name: 'RON95-III', aliases: ['Xăng RON 95-III', 'RON 95-III', 'RON95-III'], source: 'petrolimex' },
  { code: 'E10RON95III', name: 'E10 RON95-III', aliases: ['Xăng E10 RON 95-III', 'E10 RON95-III', 'E10 RON 95-III'], source: 'petrolimex' },
  { code: 'E5RON92II', name: 'E5 RON92-II', aliases: ['Xăng E5 RON 92-II', 'E5 RON 92-II', 'E5RON92-II'], source: 'petrolimex' },
  { code: 'DO005SII', name: 'Diesel 0.05S-II', aliases: ['DO 0,05S-II', 'DO 0.05S-II'], source: 'petrolimex' },
  { code: 'DO0001SV', name: 'Diesel 0.001S-V', aliases: ['DO 0,001S-V', 'DO 0.001S-V'], source: 'petrolimex' },
  { code: 'KO2K', name: 'Dầu hỏa 2-K', aliases: ['Dầu hỏa 2-K', 'Dầu KO'], source: 'petrolimex' },
];

function parseThousands(raw?: string | null) {
  if (!raw) return null;
  const normalized = raw.replace(/[.,\s]/g, '').replace(/[^\d-+]/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function cleanHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

function findTableSection(text: string, marker: string) {
  const start = text.indexOf(marker);
  if (start < 0) return text;
  return text.slice(start, start + 5000);
}

function pickPetrolimexValue(text: string, aliases: string[]) {
  for (const alias of aliases) {
    const index = text.toLowerCase().indexOf(alias.toLowerCase());
    if (index >= 0) {
      const snippet = text.slice(index, index + 260);
      const numbers = snippet.match(/[+\-]?\d{1,3}(?:[.,]\d{3})+/g) || [];

      // Bảng hiện tại:
      // [tăng giảm hiện tại, tăng giảm kỳ trước, giá vùng 1, giá vùng 2]
      // Ở ảnh bạn gửi thì tăng giảm hiện tại = 0, còn "so với kỳ trước" là +820, +760...
      if (numbers.length >= 4) {
        return {
          change: parseThousands(numbers[1]),
          price: parseThousands(numbers[2]),
        };
      }

      if (numbers.length >= 3) {
        return {
          change: parseThousands(numbers[0]),
          price: parseThousands(numbers[1]),
        };
      }

      if (numbers.length >= 2) {
        return {
          change: 0,
          price: parseThousands(numbers[0]),
        };
      }
    }
  }
  return null;
}

export async function GET() {
  try {
    const response = await fetch('https://giaxanghomnay.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('Fuel source failed: ' + response.status);
    }

    const html = await response.text();
    const text = cleanHtml(html);
    const petrolimexSection = findTableSection(text, 'Bảng giá theo Petrolimex');

    const cards: OilCard[] = TARGETS.map((target) => {
      const row = pickPetrolimexValue(petrolimexSection, target.aliases);

      return {
        code: target.code,
        name: target.name,
        price: row?.price ?? null,   // giá vùng 1
        change: row?.change ?? 0,    // tăng giảm so với kỳ trước
        unit: 'VND/lít',
        source: target.source,
        updatedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({
      provider: 'giaxanghomnay',
      updatedAt: new Date().toISOString(),
      cards,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message, provider: 'giaxanghomnay' }, { status: 500 });
  }
}
