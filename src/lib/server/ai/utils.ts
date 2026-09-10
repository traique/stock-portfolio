// Tiện ích thuần (không phụ thuộc domain): toán + điều phối bất đồng bộ.

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export const roundPrice = (v: number) => Math.round(v / 10) * 10;

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Chạy map với giới hạn số request đồng thời (tránh 429/block khi fetch nhiều mã).
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = { status: 'fulfilled', value: await fn(items[idx], idx) };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}
