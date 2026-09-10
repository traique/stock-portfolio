import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// fetchMarketPrices — chuỗi fallback 4 tầng: DNSE → Yahoo → VCI Edge → snapshot DB
//
// Mock toàn bộ nguồn ngoài + Sentry để test thuần logic ưu tiên & health.
// ─────────────────────────────────────────────────────────────────────────────

// Mock providers (vi.mock hoisted — dùng factory, không tham chiếu biến ngoài)
vi.mock('../providers/dnse-realtime', () => ({
  getDnseEdgeBatch: vi.fn(),
}))
vi.mock('../providers/yahoo', () => ({
  getYahooMarketData: vi.fn(),
}))
vi.mock('../providers/vci-edge', () => ({
  getVciEdgeBatch: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        in: async () => ({ data: snapshotRows, error: null }),
      }),
    }),
  })),
}))
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { getDnseEdgeBatch } from '../providers/dnse-realtime'
import { getYahooMarketData } from '../providers/yahoo'
import { getVciEdgeBatch } from '../providers/vci-edge'
import { fetchMarketPrices, normalizeSymbols } from '../market'

const mockDnse = vi.mocked(getDnseEdgeBatch)
const mockYahoo = vi.mocked(getYahooMarketData)
const mockVci = vi.mocked(getVciEdgeBatch)
const mockCreateClient = vi.mocked(createClient)
const mockCaptureMessage = vi.mocked(Sentry.captureMessage)
const mockCaptureException = vi.mocked(Sentry.captureException)

// Dữ liệu snapshot do mock Supabase trả về — mỗi test tự set
let snapshotRows: Array<Record<string, unknown>> = []

type ProviderRow = {
  symbol: string; price: number; previousClose?: number;
  change?: number; pct?: number; volume?: number;
}

function md(row: ProviderRow) {
  return {
    symbol: row.symbol, ticker: row.symbol, provider: 'test',
    price: row.price, previousClose: row.previousClose ?? row.price,
    change: row.change ?? 0, pct: row.pct ?? 0,
    ceilingPriceEstimate: 0, floorPriceEstimate: 0,
    dayHigh: 0, dayLow: 0, marketTime: null, currency: 'VND',
    volume: row.volume ?? 0,
  } as const
}

beforeEach(() => {
  vi.clearAllMocks()
  snapshotRows = []
  // Env tối thiểu cho getSupabase() trong market.ts
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co'
  process.env.SUPABASE_SERVER_KEY ??= 'test-key'
  // Silencer cho log test
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('normalizeSymbols', () => {
  it('tách theo dấu phẩy, chuẩn hoá, bỏ rỗng và trùng', () => {
    expect(normalizeSymbols(' hpg , VCB,vcb,, FPT ')).toEqual(['HPG', 'VCB', 'FPT'])
  })
  it('chuỗi rỗng → mảng rỗng', () => {
    expect(normalizeSymbols('')).toEqual([])
  })
})

describe('fetchMarketPrices — thứ tự fallback', () => {
  it('DNSE đủ hết → KHÔNG gọi Yahoo/VCI/snapshot (tầng sau không tốn request)', async () => {
    mockDnse.mockResolvedValue(new Map([
      ['HPG', md({ symbol: 'HPG', price: 22_050 })],
      ['VCB', md({ symbol: 'VCB', price: 58_700 })],
    ]))

    const r = await fetchMarketPrices(['HPG', 'VCB'])

    expect(mockYahoo).not.toHaveBeenCalled()
    expect(mockVci).not.toHaveBeenCalled()
    // getSupabase chỉ tạo khi cần snapshot — không gọi → không tạo client
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(r.prices).toEqual({ HPG: 22_050, VCB: 58_700 })
    expect(r.health).toMatchObject({ requested: 2, dnseOk: 2, failed: 0, degraded: false })
    expect(r.debug[0].provider).toBe('test')
  })

  it('DNSE thiếu 1 mã → chỉ mã thiếu được hỏi Yahoo (không hỏi lại mã đã có)', async () => {
    mockDnse.mockResolvedValue(new Map([['HPG', md({ symbol: 'HPG', price: 22_050 })]]))
    mockYahoo.mockResolvedValue(md({ symbol: 'VCB', price: 58_700 }))

    const r = await fetchMarketPrices(['HPG', 'VCB'])

    expect(mockYahoo).toHaveBeenCalledTimes(1)
    expect(mockYahoo).toHaveBeenCalledWith('VCB')
    expect(mockVci).not.toHaveBeenCalled()
    expect(r.prices).toEqual({ HPG: 22_050, VCB: 58_700 })
    expect(r.health).toMatchObject({ dnseOk: 1, yahooOk: 1, failed: 0 })
  })

  it('DNSE + Yahoo fail → VCI Edge gánh, Yahoo throw không làm vỡ request', async () => {
    mockDnse.mockRejectedValue(new Error('DNSE down'))
    mockYahoo.mockRejectedValue(new Error('Yahoo blocked'))
    mockVci.mockResolvedValue(new Map([['HPG', md({ symbol: 'HPG', price: 22_000 })]]))

    const r = await fetchMarketPrices(['HPG'])

    expect(mockVci).toHaveBeenCalledWith(['HPG'])
    expect(mockCaptureException).toHaveBeenCalled()
    expect(r.prices).toEqual({ HPG: 22_000 })
    expect(r.health).toMatchObject({ dnseOk: 0, yahooOk: 0, vciOk: 1, failed: 0 })
  })

  it('3 tầng realtime fail → dùng snapshot DB; snapshot giá 0 bị bỏ qua', async () => {
    mockDnse.mockRejectedValue(new Error('down'))
    mockYahoo.mockRejectedValue(new Error('down'))
    mockVci.mockRejectedValue(new Error('down'))
    snapshotRows = [
      { symbol: 'HPG', price: 21_800, ref: 22_000, change: -200, pct: -0.9, volume: 1_000 },
      { symbol: 'VCB', price: 0, ref: 0 }, // giá rác → phải bỏ, không dùng làm giá
    ]

    const r = await fetchMarketPrices(['HPG', 'VCB'])

    expect(r.prices).toEqual({ HPG: 21_800 }) // VCB không có snapshot hợp lệ
    expect(r.debug[0]).toMatchObject({ provider: 'snapshot', price: 21_800 })
    expect(r.health).toMatchObject({ snapshotOk: 1, failed: 1 })
    expect(r.health.failedSymbols).toEqual(['VCB'])
    // 1/2 fail = 50% → KHÔNG vượt ngưỡng >50% → chưa degraded
    expect(r.health.degraded).toBe(false)
  })

  it('toàn bộ tầng fail → price 0, degraded=true khi >50% mã chết, Sentry bắn message', async () => {
    mockDnse.mockRejectedValue(new Error('down'))
    mockYahoo.mockRejectedValue(new Error('down'))
    mockVci.mockRejectedValue(new Error('down'))
    snapshotRows = []

    const r = await fetchMarketPrices(['HPG', 'VCB', 'FPT'])

    expect(r.prices).toEqual({})
    expect(r.health.failed).toBe(3)
    expect(r.health.degraded).toBe(true)
    expect(r.debug.every(d => d.provider === 'error' && d.price === 0)).toBe(true)
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
  })

  it('giá DNSE trả về 0/NaN bị coi là MISS → fallback xuống Yahoo', async () => {
    mockDnse.mockResolvedValue(new Map([
      ['HPG', md({ symbol: 'HPG', price: 0 })],           // 0 → không hợp lệ
      ['VCB', md({ symbol: 'VCB', price: Number.NaN })],  // NaN → không hợp lệ
    ]))
    mockYahoo.mockImplementation(async (s) => md({ symbol: s, price: s === 'HPG' ? 22_000 : 58_000 }))

    const r = await fetchMarketPrices(['HPG', 'VCB'])

    expect(mockYahoo).toHaveBeenCalledTimes(2)
    expect(r.health).toMatchObject({ dnseOk: 0, yahooOk: 2 })
    expect(r.prices).toEqual({ HPG: 22_000, VCB: 58_000 })
  })

  it('ưu tiên DNSE cho mã có ở nhiều tầng (KHÔNG để tầng dưới ghi đè)', async () => {
    mockDnse.mockResolvedValue(new Map([['HPG', md({ symbol: 'HPG', price: 22_050 })]]))
    // Yahoo vẫn được gọi do mã khác thiếu, nhưng không được đè giá HPG của DNSE
    mockYahoo.mockResolvedValue(md({ symbol: 'HPG', price: 999_999 }))
    snapshotRows = []

    const r = await fetchMarketPrices(['HPG'])
    expect(r.prices.HPG).toBe(22_050)
  })

  it('danh sách rỗng → trả payload rỗng, không gọi tầng nào', async () => {
    const r = await fetchMarketPrices([])
    expect(r.prices).toEqual({})
    expect(r.health.requested).toBe(0)
    expect(r.health.degraded).toBe(false)
    expect(mockDnse).not.toHaveBeenCalled()
    expect(mockYahoo).not.toHaveBeenCalled()
    expect(mockVci).not.toHaveBeenCalled()
  })

  it('provider label mô tả đủ 4 tầng', async () => {
    mockDnse.mockResolvedValue(new Map())
    const r = await fetchMarketPrices(['HPG'])
    expect(r.provider).toBe('dnse+yahoo+vci+snapshot')
  })
})
