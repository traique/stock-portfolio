# 📈 LCTA — Ứng dụng Quản lý Danh mục Cổ phiếu

Ứng dụng web theo dõi danh mục đầu tư cổ phiếu Việt Nam, tích hợp AI phân tích và thông báo Telegram.

---

## ✨ Tính năng chính

### 📋 Trang Chủ — Watchlist
- Theo dõi danh sách mã cổ phiếu yêu thích
- Hiển thị giá, thay đổi %, khối lượng theo thời gian thực
- Chỉ số **VNINDEX** cập nhật liên tục
- **AI Scan** phân tích toàn bộ watchlist, gợi ý mã tiềm năng với điểm số, giá vào, TP, SL
- Đọc tin tức theo từng mã

### 📊 Danh mục (Dashboard)
- Quản lý giao dịch mua/bán (lịch sử giao dịch đầy đủ)
- Tính toán lãi/lỗ từng vị thế, tổng danh mục
- Theo dõi dòng tiền (tiền mặt, đã đầu tư, giá trị hiện tại)
- **AI Insights** phân tích danh mục theo 3 mức độ rủi ro: Thận trọng / Cân bằng / Tích cực
- Cảnh báo phân bổ vốn quá mức (theo ngưỡng cài đặt)
- Xuất báo cáo danh mục

### 📉 Backtest
- Kiểm tra chiến lược giao dịch trên dữ liệu lịch sử
- Hỗ trợ khung thời gian 1D
- Thống kê win rate, tổng P&L, số lệnh

### 🥇 Giá Vàng
- Giá vàng SJC (1 lượng, 1 chỉ), vàng 9999
- Giá vàng thế giới (XAU/USD)
- Cập nhật giá mua/bán theo thời gian thực

### 🛢️ Giá Dầu
- Theo dõi giá dầu thô trong nước và quốc tế

### 📡 Tín hiệu Sống (System Live)
- Hiển thị tín hiệu MUA/BÁN realtime
- Lọc theo loại tín hiệu

### 🔔 Thông báo Telegram
- Nhận báo cáo danh mục hàng ngày qua Telegram
- Cảnh báo khi mã vượt ngưỡng % thay đổi tùy chỉnh
- Cài đặt giờ nhận thông báo

---

## 🏗️ Kiến trúc

```
Next.js 15 (Vercel)
    │
    ├── Giá cổ phiếu VN (HNX/UPCOM) ──→ Supabase Edge Function (Singapore)
    │       │                                      │
    │       │                              VCI API (Vietcap)
    │       │                              ↓ upsert mỗi 30 phút
    │       └── Đọc từ price_snapshots ←── Supabase Database
    │
    ├── Giá cổ phiếu HOSE + VNINDEX ────→ Yahoo Finance
    │
    └── Dữ liệu người dùng ─────────────→ Supabase (Auth + Database)
```

### Lịch lấy giá tự động
Cron job chạy **mỗi 30 phút**, chỉ trong giờ giao dịch:
- **Buổi sáng:** 9:00 – 12:00 (giờ VN)
- **Buổi chiều:** 13:00 – 16:00 (giờ VN)
- **Thứ 2 – Thứ 6** (nghỉ cuối tuần tự động)

---

## 🛠️ Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Frontend + API | Next.js 15, TypeScript, Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Edge Function | Supabase Edge Functions (Deno) |
| Hosting | Vercel (free tier) |
| Nguồn giá VN | VCI (Vietcap) qua Edge Function |
| Nguồn giá quốc tế | Yahoo Finance |
| AI | Claude (Anthropic) |
| Thông báo | Telegram Bot API |

---

## 🚀 Hướng dẫn cài đặt

### Yêu cầu
- Tài khoản [Supabase](https://supabase.com)
- Tài khoản [Vercel](https://vercel.com)
- Tài khoản [GitHub](https://github.com)

### Bước 1 — Clone repo
```bash
git clone https://github.com/traique/stock-portfolio.git
cd stock-portfolio
npm install
```

### Bước 2 — Tạo file `.env.local`
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVER_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=https://your-domain.vercel.app
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
CRON_SECRET=your_random_secret
```

### Bước 3 — Chạy SQL migrations trên Supabase
Chạy lần lượt các file SQL trong SQL Editor của Supabase:
1. `supabase.sql` — schema chính
2. `supabase-transactions.sql` — bảng giao dịch
3. `supabase-portfolio-v2.sql` — danh mục v2
4. `supabase-portfolio-settings.sql` — cài đặt
5. `supabase-telegram.sql` — thông báo Telegram
6. `supabase-price-snapshots.sql` — bảng giá + cron job

> ⚠️ Trong file `supabase-price-snapshots.sql`, thay `<PROJECT_REF>` và `<SERVICE_ROLE_KEY>` bằng thông tin thật trước khi chạy.

### Bước 4 — Deploy Edge Function
Vào Supabase Dashboard → Edge Functions → tạo function tên `vci-prices` → paste nội dung file `supabase/functions/vci-prices/index.ts` → Deploy (tắt Verify JWT).

### Bước 5 — Deploy lên Vercel
Kết nối repo GitHub với Vercel, thêm các biến môi trường như file `.env.local`.

---

## 📁 Cấu trúc thư mục

```
src/
├── app/
│   ├── page.tsx              # Trang chủ (Watchlist)
│   ├── dashboard/            # Danh mục đầu tư
│   ├── backtest/             # Backtest chiến lược
│   ├── gold-live/            # Giá vàng
│   ├── oil-live/             # Giá dầu
│   ├── system-live/          # Tín hiệu sống
│   └── api/                  # API routes
├── lib/
│   ├── calculations.ts       # Tính toán danh mục
│   └── server/
│       ├── market.ts         # Điều phối nguồn giá
│       ├── providers/
│       │   ├── yahoo.ts      # Yahoo Finance
│       │   └── vci-edge.ts   # VCI qua Edge Function
│       └── exchanges/
│           ├── exchange.ts   # Mapping sàn
│           └── exchange-map.ts
└── components/               # UI components

supabase/
└── functions/
    └── vci-prices/
        └── index.ts          # Edge Function lấy giá VCI
```

---

## 📝 Lưu ý

- Dữ liệu giá cổ phiếu **HOSE** lấy từ Yahoo Finance (realtime).
- Dữ liệu giá **HNX** và **UPCOM** lấy từ VCI qua Supabase Edge Function, cập nhật mỗi 30 phút trong giờ giao dịch.
- **VNINDEX** lấy từ Yahoo Finance với ticker `^VNINDEX.VN`.
- Ứng dụng chỉ theo dõi **cổ phiếu Việt Nam**.
