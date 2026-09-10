import { clamp } from './utils';
import { sanitizeExternalText } from '@/lib/server/ai-sanitize'; // ✨ Phase 0.1
import type { NewsHeadline } from './types';

const NEWS_RECENT_DAYS = 30;
const NEWS_MAX_ITEMS = 10;
const NEWS_CACHE_SECS = 600; // 10 min

// ── helpers ──
function normalizeDate(input: string): number {
  const t = new Date(input).getTime();
  return isNaN(t) ? 0 : t;
}
function filterRecent(news: NewsHeadline[], days = NEWS_RECENT_DAYS) {
  const cutoff = Date.now() - days * 86_400_000;
  return news.filter(n => normalizeDate(n.pubDate) >= cutoff);
}
function dedupe(news: NewsHeadline[]): NewsHeadline[] {
  const seen = new Map<string, NewsHeadline>();
  for (const n of news) {
    const key = n.title.toLowerCase().trim();
    if (key && !seen.has(key)) seen.set(key, n);
  }
  return Array.from(seen.values());
}

const NOISE_KEYWORDS = ['cw', 'chứng quyền', 'cmw'];
function isValidNews(title: string): boolean {
  const t = title.toLowerCase();
  return !NOISE_KEYWORDS.some(k => t.includes(k));
}

// ── sentiment (xử lý phủ định tiếng Việt) ──
const NEGATION_WORDS = ['không', 'chưa', 'chẳng', 'chớ', 'đừng', 'thay vì', 'ngoại trừ'];
const POS_WORDS = ['tăng', 'lãi', 'mua', 'tích cực', 'kỷ lục', 'phục hồi', 'tăng trưởng', 'bứt phá', 'vượt', 'khởi sắc'];
const NEG_WORDS = ['giảm', 'lỗ', 'bán', 'rủi ro', 'phạt', 'vi phạm', 'sụt', 'bán tháo', 'tụt', 'hạ', 'yếu'];

function hasNegationBefore(words: string[], keywordIdx: number): boolean {
  const window = words.slice(Math.max(0, keywordIdx - 2), keywordIdx).join(' ');
  return NEGATION_WORDS.some(neg => window.includes(neg));
}

export function sentimentScore(title: string): number {
  const t = title.toLowerCase();
  const words = t.split(/\s+/);
  let score = 0;
  for (const pos of POS_WORDS) {
    const idx = words.findIndex((_, i) => words.slice(i).join(' ').startsWith(pos));
    if (idx === -1) continue;
    score += hasNegationBefore(words, idx) ? -1 : 1;
  }
  for (const neg of NEG_WORDS) {
    const idx = words.findIndex((_, i) => words.slice(i).join(' ').startsWith(neg));
    if (idx === -1) continue;
    score += hasNegationBefore(words, idx) ? 1 : -1;
  }
  return clamp(score / 3, -1, 1);
}

export function calcNewsImpact(news: NewsHeadline[]): number {
  if (!news.length) return 0;
  const avg = news.reduce((s, n) => s + (n.sentiment ?? 0), 0) / news.length;
  return clamp(avg * Math.log(news.length + 1), -2, 2);
}

// ── fetch (Google News RSS) ──
async function fetchGoogleNewsRSS(symbol: string): Promise<NewsHeadline[]> {
  const query = encodeURIComponent(`${symbol} cổ phiếu`);
  const url =
    'https://' + 'news.google.com/rss/search?q=' + query + '&hl=vi&gl=VN&ceid=VN:vi';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: NEWS_CACHE_SECS },
    });
    if (!res.ok) {
      console.warn(`[fetchGoogleNewsRSS] ${symbol}: HTTP ${res.status}`);
      return [];
    }
    const text = await res.text();
    const extractTag = (xml: string, tag: string): string => {
      const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      if (!m) return '';
      return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    };
    const items = text.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
    if (items.length === 0) {
      console.warn(`[fetchGoogleNewsRSS] ${symbol}: 0 items — possible datacenter block or empty feed`);
      return [];
    }
    const news: NewsHeadline[] = [];
    for (const item of items.slice(0, NEWS_MAX_ITEMS)) {
      const rawTitle = extractTag(item, 'title');
      const title = rawTitle.split(' - ')[0].trim();
      const source = extractTag(item, 'source') || rawTitle.split(' - ').at(-1)?.trim() || '';
      const pubDate = extractTag(item, 'pubDate');
      const link = extractTag(item, 'link');
      if (title) news.push({ title, source, pubDate, url: link });
    }
    return news;
  } catch (err) {
    console.error(`[fetchGoogleNewsRSS] ${symbol}:`, err);
    return [];
  }
}

export async function fetchAllNews(symbol: string): Promise<NewsHeadline[]> {
  const raw = await fetchGoogleNewsRSS(symbol);
  const news = dedupe(
    filterRecent(
      raw.filter(n => isValidNews(n.title) && n.title.length > 5),
      NEWS_RECENT_DAYS,
    ),
  );
  // ✨ Phase 0.1 — sanitize title tại nguồn trước khi tính sentiment & gửi LLM.
  return news.map(n => {
    const title = sanitizeExternalText(n.title, 200);
    return { ...n, title, sentiment: sentimentScore(title) };
  });
      }
