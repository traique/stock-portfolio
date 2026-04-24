// src/types/tradingview.d.ts
// Declaration file cho @mathieuc/tradingview
// Chi tiết đầy đủ các method chính từ thư viện (dựa trên source & examples)

declare module '@mathieuc/tradingview' {
  // ================= MAIN CLASS =================
  export default class TradingView {
    constructor(options?: TradingViewOptions);

    // Lấy một nến (bar) mới nhất
    getBar(symbol: string, timeframe: string): Promise<Bar>;

    // Lấy chuỗi dữ liệu nến (historical)
    getSeries(
      symbol: string,
      timeframe: string,
      from?: number | string,
      to?: number | string
    ): Promise<Bar[]>;

    // Lấy thông tin symbol
    getSymbol(symbol: string): Promise<SymbolInfo>;

    // Technical Analysis (tóm tắt khuyến nghị)
    getTA(symbol: string, timeframe?: string): Promise<TAResult>;

    // Lấy dữ liệu screener
    getScreener(query?: any): Promise<any>;

    // Các method khác thường dùng
    searchSymbol(query: string): Promise<any[]>;
    getQuotes(symbols: string[]): Promise<any>;
    getIndicator(symbol: string, indicator: string, options?: any): Promise<any>;
  }

  // ================= OPTIONS =================
  export interface TradingViewOptions {
    username?: string;
    password?: string;
    token?: string;
    debug?: boolean;
    timeout?: number;
  }

  // ================= BAR (nến) =================
  export interface Bar {
    time: number;      // timestamp (giây)
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    [key: string]: any; // cho các field thêm từ indicator
  }

  // ================= SYMBOL INFO =================
  export interface SymbolInfo {
    symbol: string;
    description?: string;
    exchange?: string;
    type?: string;
    currency?: string;
    [key: string]: any;
  }

  // ================= TECHNICAL ANALYSIS =================
  export interface TAResult {
    summary: {
      RECOMMENDATION: string; // BUY, SELL, NEUTRAL...
      BUY: number;
      SELL: number;
      NEUTRAL: number;
    };
    oscillators: any;
    moving_averages: any;
    [key: string]: any;
  }

  // ================= REALTIME CLIENT =================
  export class RealtimeClient {
    constructor(options?: any);

    connect(): Promise<void>;
    disconnect(): void;

    on(event: 'connect' | 'disconnect' | 'update' | 'error', callback: Function): void;

    subscribe(symbol: string, timeframe?: string): void;
    unsubscribe(symbol: string, timeframe?: string): void;

    getSubscribed(): string[];
  }

  // ================= CLIENT (cũ hơn) =================
  export class Client {
    constructor(options?: any);
    // Các method tương tự TradingView class
  }

  // ================= UTILS / TYPES KHÁC =================
  export interface IndicatorOptions {
    [key: string]: any;
  }

  // Export tất cả để dùng linh hoạt
  export * from '@mathieuc/tradingview';
}

// ================= GLOBAL DECLARATION (nếu cần) =================
declare global {
  // Nếu bạn muốn dùng global, có thể thêm ở đây
    }
