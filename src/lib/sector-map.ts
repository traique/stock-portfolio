// src/lib/sector-map.ts
//
// Bản đồ phân ngành DÙNG CHUNG cho cả client (dashboard) và server (sector-analyzer).
// Tách riêng để client import an toàn (không kéo theo code server), và tránh lặp
// danh sách mã ở nhiều nơi.
//
// Lưu ý: DNSE securities API KHÔNG trả ngành (chỉ có issuer/tên), nên phân ngành
// vẫn phải tự maintain ở đây.

export type SectorKey =
  | 'banking'
  | 'steel'
  | 'realestate'
  | 'oilgas'
  | 'technology'
  | 'securities'
  | 'retail'
  | 'food'
  | 'industrial'
  | 'utilities'
  | 'logistics';

export type SectorMeta = {
  label:   string;
  symbols: string[];
};

export const SECTOR_MAP: Record<SectorKey, SectorMeta> = {
  banking:    { label: 'Ngân hàng',                 symbols: ['VCB','BID','CTG','TCB','MBB','ACB','VPB','HDB','STB','EIB','TPB','SHB'] },
  steel:      { label: 'Thép',                       symbols: ['HPG','HSG','NKG','GEX'] },
  realestate: { label: 'Bất động sản',               symbols: ['VIC','VHM','NVL','KDH','DXG','PDR','NLG','DIG','VRE','KBC','BCM','HDC'] },
  oilgas:     { label: 'Dầu khí',                    symbols: ['GAS','PLX','PVD','PVT','PVS','BSR','OIL','PLC'] },
  technology: { label: 'Công nghệ',                  symbols: ['FPT','CMG','VGI','CTR'] },
  securities: { label: 'Chứng khoán',                symbols: ['SSI','VCI','HCM','VND','VIX','SHS','MBS','BVS'] },
  retail:     { label: 'Bán lẻ',                     symbols: ['MWG','FRT','PNJ','DGW'] },
  food:       { label: 'Thực phẩm & Đồ uống',        symbols: ['VNM','SAB','MSN','DBC','HAG','QNS','MCH'] },
  industrial: { label: 'Khu công nghiệp & Xây dựng', symbols: ['GEX','CTD','VCG','REE','CII','KBC','BCM','SIP'] },
  utilities:  { label: 'Điện & Tiện ích',            symbols: ['POW','REE','GAS','PLC'] },
  logistics:  { label: 'Vận tải & Logistics',        symbols: ['GMD','PVT','ACV','VJC'] },
};

// symbol -> các sector chứa nó (1 mã có thể thuộc nhiều ngành)
export function getSymbolSectors(symbol: string): SectorKey[] {
  const s = (symbol ?? '').trim().toUpperCase();
  return (Object.entries(SECTOR_MAP) as [SectorKey, SectorMeta][])
    .filter(([, meta]) => meta.symbols.includes(s))
    .map(([key]) => key);
}

// symbol -> nhãn ngành chính (theo thứ tự khai báo) để gom nhóm hiển thị
export function getPrimarySectorLabel(symbol: string): string {
  const keys = getSymbolSectors(symbol);
  return keys.length ? SECTOR_MAP[keys[0]].label : 'Khác';
}
