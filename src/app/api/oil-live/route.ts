import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

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
  source: 'petrolimex';
};

const TARGETS: OilTarget[] = [
  {
    code: 'RON95V',
    name: 'RON95-V',
    aliases: ['xăng ron 95-v', 'ron 95-v', 'ron95-v'],
    source: 'petrolimex',
  },
  {
    code: 'RON95III',
    name: 'RON95-III',
    aliases: ['xăng ron 95-iii', 'ron 95-iii', 'ron95-iii'],
    source: 'petrolimex',
  },
  {
    code: 'E10RON95III',
    name: 'E10 RON95-III',
    aliases: ['xăng e10 ron 95-iii', 'e10 ron95-iii', 'e10 ron 95-iii'],
    source: 'petrolimex',
  },
  {
    code: 'E5RON92II',
    name: 'E5 RON92-II',
    aliases: ['xăng e5 ron 92-ii', 'e5 ron 92-ii', 'e5 ron92-ii'],
    source: 'petrolimex',
  },
  {
    code: 'DO005SII',
    name: 'Diesel 0.05S-II',
    aliases: ['do 0,05s-ii', 'do 0.05s-ii', '0,05s-ii', '0.05s-ii'],
    source: 'petrolimex',
  },
  {
    code: 'DO0001SV',
    name: 'Diesel 0.001S-V',
    aliases: ['do 0,001s-v', 'do 0.001s-v', '0,001s-v', '0.001s-v'],
    source: 'petrolimex',
  },
  {
    code: 'KO2K',
    name: 'Dầu hỏa 2-K',
    aliases: ['dầu hỏa 2-k', 'dầu ko', 'dau hoa 2-k'],
    source: 'petrolimex',
  },
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseViInt(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractCells(
  $: cheerio.CheerioAPI,
  row: AnyNode
): string[] {
  const cells: string[] = [];
  $(row)
    .find('td,th')
    .each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      cells.push(text);
    });
  return cells;
}

function findBestTable(
  $: cheerio.CheerioAPI
): cheerio.Cheerio<AnyNode> | null {
  let bestTable: cheerio.Cheerio<AnyNode> | null = null;
  let bestScore = -1;

  $('table').each((_, table) => {
    const $table = $(table);
    const text = normalizeText($table.text());

    let score = 0;
    if (text.includes('gia vung 1')) score += 2;
    if (text.includes('gia vung 2')) score += 2;
    if (text.includes('tang giam ky truoc')) score += 2;
    if (text.includes('xang ron 95-v')) score += 1;
    if (text.includes('do 0,001s-v') || text.includes('do 0.001s-v')) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestTable = $table;
    }
  });

  return bestTable;
}

function rowMatches(name: string, aliases: string[]) {
  const normalized = normalizeText(name);
  return aliases.some((alias) => normalized.includes(normalizeText(alias)));
}

// Hàm mới: Quét và bóc tách thời gian cập nhật bằng Regex
function extractUpdateTime($: cheerio.CheerioAPI): { time: string | null, date: string | null } {
  // Gộp toàn bộ text của trang và xóa bớt khoảng trắng thừa
  const text = $('body').text().replace(/\s+/g, ' ').toLowerCase();
  
  let time: string | null = null;
  let date: string | null = null;

  // Regex bắt các cụm từ "cập nhật (lúc) 15:00 ngày 21/04/2026" hoặc "điều chỉnh ngày 21/04/2026"
  const match = text.match(/(?:cập nhật|điều chỉnh|kỳ điều hành).*?(?:lúc\s*)?(\d{1,2}:\d{2})?\s*(?:ngày\s*)?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
  
  if (match) {
    if (match[1]) time = match[1];
    if (match[2]) {
      // Đảo ngược ngày từ DD/MM/YYYY sang YYYY-MM-DD
      const parts = match[2].split(/[\/\-]/);
      if (parts.length === 3) {
        date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }

  return { time, date };
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
      throw new Error(`Fuel source failed: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const $table = findBestTable($);
    if ($table === null || $table.length === 0) {
      throw new Error('Không tìm thấy bảng giá xăng phù hợp');
    }

    const rows = $table
      .find('tr')
      .toArray()
      .map((tr) => extractCells($, tr));

    // Gọi hàm bóc tách thời gian
    const updateInfo = extractUpdateTime($);

    const cards: OilCard[] = TARGETS.map((target) => {
      const matchedRow = rows.find((cells) => {
        if (!cells.length) return false;
        return rowMatches(cells[0], target.aliases);
      });

      // Cột 0: Tên | Cột 1: Thay đổi hiện tại | Cột 2: Thay đổi kỳ trước | Cột 3: Giá vùng 1 | Cột 4: Giá vùng 2
      const change = matchedRow?.[2] ? parseViInt(matchedRow[2]) : 0;
      const price = matchedRow?.[3] ? parseViInt(matchedRow[3]) : null;

      return {
        code: target.code,
        name: target.name,
        price,
        change,
        unit: 'VND/lít',
        source: target.source,
        updatedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({
      provider: 'giaxanghomnay',
      updatedAt: new Date().toISOString(),
      sourceTime: updateInfo.time, // Trả về giờ (VD: "17:00")
      sourceDate: updateInfo.date, // Trả về ngày (VD: "2026-04-18")
      cards,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message, provider: 'giaxanghomnay' },
      { status: 500 }
    );
  }
}
