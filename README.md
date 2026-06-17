# 📈 LCTA — Ứng dụng Quản lý Danh mục Cổ phiếu Việt Nam

Ứng dụng web theo dõi danh mục đầu tư cổ phiếu Việt Nam, tích hợp AI phân tích đa chiều (kỹ thuật, ngành, dòng tiền, KQKD, tối ưu danh mục), cảnh báo phân bổ vốn, quét cổ tức tự động và thông báo Telegram hàng ngày — toàn bộ vận hành trên hạ tầng **free tier** (Vercel + Supabase).

---

## ✨ Tính năng chính

### 📋 Trang Chủ — Watchlist
- Theo dõi danh sách mã cổ phiếu yêu thích, giá/thay đổi %/khối lượng theo thời gian thực.
- Chỉ số **VNINDEX** cập nhật liên tục.
- **AI Scan** toàn bộ watchlist — chấm điểm từng mã, gợi ý giá vào/TP/SL, có ngữ cảnh tin tức kèm theo. Phân tích được làm giàu bởi 4 lớp dữ liệu:
  - Chỉ báo kỹ thuật nâng cao: SMA/EMA, MACD, Bollinger Bands, đa khung thời gian (1W/1M/3M), golden/death cross, ADX, hỗ trợ/kháng cự.
  - Phân tích xoay vòng ngành (sector rotation) so với VNINDEX.
  - Dòng tiền: foreign flow (số liệu thật từ SSI khi khả dụng, hoặc tín hiệu tích lũy/phân phối từ volume khi không có số liệu thật — **không** suy diễn số liệu khối ngoại giả).
  - Lịch công bố kết quả kinh doanh (KQKD) theo mùa BCTC Việt Nam.
- Người dùng chọn model AI (Gemini / Groq), danh sách model fetch live từ API, có cache + fallback tĩnh.

### 📊 Danh mục (Dashboard)
- Quản lý giao dịch mua/bán với lịch sử đầy đủ, tính lãi/lỗ từng vị thế và tổng danh mục.
- Theo dõi dòng tiền (tiền mặt, đã đầu tư, giá trị hiện tại).
- Biểu đồ hiệu suất danh mục theo thời gian, dựng từ snapshot lưu hàng ngày.
- **AI Insights** phân tích danh mục theo 3 mức rủi ro (Thận trọng / Cân bằng / Tích cực), kèm đánh giá rủi ro tổng danh mục: correlation matrix, mức độ tập trung theo ngành/mã, gợi ý tỷ trọng theo Risk Parity, ước lượng biến động.
- **Cảnh báo phân bổ vốn quá ngưỡng** — banner cảnh báo ngay trên dashboard khi 1 mã vượt ngưỡng cảnh báo (mặc định 25%) hoặc nguy hiểm (mặc định 40%) trên tổng tài sản, ngưỡng tùy chỉnh được.
- **Quét cổ tức tự động** (bán tự động): gợi ý sự kiện chia cổ tức tiền/cổ phiếu cho các mã đang nắm giữ từ nguồn cotuc.vn, người dùng xác nhận trước khi ghi nhận — không tự ghi giao dịch.
- **Xuất báo cáo** Excel (.xlsx) hoặc CSV — gồm vị thế hiện tại, lịch sử giao dịch và tổng quan, giá lấy live tại thời điểm xuất.

### 📉 Backtest
- Kiểm tra chiến lược giao dịch trên dữ liệu lịch sử, khung thời gian 1D.
- Thống kê win rate, tổng P&L, số lệnh.

### 🌐 Tổng quan thị trường (Market Overview)
- Trang `/market`: VN-Index realtime + lịch sử, MA/MACD, MA alignment, điểm xu hướng (trend score) tổng hợp toàn thị trường.

### 🥇 Giá Vàng & 🛢️ Giá Dầu
- Giá vàng SJC (1 lượng, 1 chỉ), vàng 9999, giá vàng thế giới (XAU/USD), cập nhật mua/bán theo thời gian thực.
- Theo dõi giá dầu thô trong nước và quốc tế.

### 📡 Tín hiệu Sống (System Live)
- Hiển thị tín hiệu MUA/BÁN realtime, lọc theo loại tín hiệu.

### 🔔 Thông báo Telegram
- Báo cáo danh mục **hàng ngày** (sau khi đóng phiên) qua Telegram.
- Cảnh báo khi mã vượt ngưỡng % thay đổi tùy chỉnh.
- Cài đặt giờ nhận thông báo theo từng user.

### 🧭 Tiện ích khác
- Thanh header hiển thị ngày dương + ngày âm lịch + nhiệt độ TP.HCM (Open-Meteo, không cần API key).
- Theo dõi lỗi runtime bằng **Sentry** (client/server/edge) và log tập trung bằng **Logtail**, được tối ưu để không vượt hạn mức free tier (chỉ gửi warn/error thật sự).
- Xác thực qua Supabase Auth: đăng nhập, quên/đặt lại mật khẩu.

---

## 🏗️ Kiến trúc

### Nguồn giá — chuỗi fallback 4 tầng
Mỗi lượt lấy giá đi qua tối đa 4 nguồn theo thứ tự ưu tiên, mã nào lấy được ở tầng trước thì dừng, mã còn thiếu mới rơi xuống tầng sau:

```
1. DNSE Entrade (realtime, trễ ~1 phút)   ── nguồn CHÍNH, đủ HOSE/HNX/UPCOM + VNINDEX
2. Yahoo Finance (trễ ~5 phút)             ── fallback 1
3. VCI/Vietcap qua Supabase Edge Function  ── fallback 2 (Edge Function chạy ở Singapore)
4. Bảng price_snapshots trên Supabase      ── fallback cuối, do cron bơm sẵn
```

Hệ thống tự theo dõi "sức khỏe" của mỗi lượt lấy giá (bao nhiêu mã lấy được ở tầng nào, bao nhiêu mã fail) và bắn cảnh báo lên Sentry khi tỷ lệ fail vượt 50% (coi là suy giảm diện rộng).

### Hai lịch chạy nền (cron) tách biệt

```
Vercel Cron (free plan: 1 cron/ngày)
  └── 15:20 giờ VN, Thứ 2–Thứ 6 (sau khi VCI có đủ OHLCV cuối ngày)
        ├── Mỗi user: tính danh mục 1 lần → lưu snapshot + gửi báo cáo Telegram (nếu bật)
        └── Backfill EOD price_history + dọn dữ liệu cũ

Supabase pg_cron (chạy độc lập trong Postgres)
  └── Mỗi 30 phút, tự kiểm tra trong giờ giao dịch (9:00–12:00, 13:00–16:00, T2–T6)
        └── Gọi Edge Function vci-prices → upsert bảng price_snapshots
```

### AI — đa nhà cung cấp, có cache & rate limit
- Nhà cung cấp: **Gemini** (Google AI Studio) và **Groq** (Llama, Mixtral), có thể bổ sung **OpenRouter** làm fallback. Danh sách model fetch live từ API tương ứng, cache 1 giờ.
- Cache 2 lớp tối ưu cho free tier: lớp in-memory (L1, ấm trong vài phút) + lớp Supabase DB (TTL dài hơn), kèm rate limit theo user để tránh vượt quota AI miễn phí.
- Toàn bộ output AI là gợi ý — không tự động đặt lệnh hay tự ghi giao dịch.

---

## 🛠️ Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Frontend + API | Next.js 15.5, React 19, TypeScript |
| Database & Auth | Supabase (PostgreSQL + Auth + pg_cron + pg_net) |
| Edge Function | Supabase Edge Functions (Deno) — `vci-prices` |
| Hosting | Vercel (free tier) |
| Nguồn giá realtime | DNSE (Entrade) → Yahoo Finance → VCI (Vietcap) → Supabase snapshot |
| AI | Gemini (Google), Groq (Llama/Mixtral), OpenRouter (fallback tùy chọn) |
| Thông báo | Telegram Bot API |
| Theo dõi lỗi / log | Sentry, Logtail (Better Stack) |
| Biểu đồ | Recharts |
| Xuất file | xlsx (SheetJS) |
| Scraping/parse | cheerio (cổ tức từ cotuc.vn) |
| Validate | Zod 4 |
| Test | Vitest (+ coverage v8) |

---

## 🚀 Hướng dẫn cài đặt

### Yêu cầu
- Tài khoản [Supabase](https://supabase.com), [Vercel](https://vercel.com), [GitHub](https://github.com).
- Ít nhất 1 API key AI: [Google AI Studio](https://aistudio.google.com) (Gemini) hoặc [Groq](https://console.groq.com).
- Bot Telegram (tùy chọn, nếu muốn nhận báo cáo hàng ngày).

### Bước 1 — Clone repo
```bash
git clone https://github.com/traique/stock-portfolio.git
cd stock-portfolio
npm install
```

### Bước 2 — Tạo file `.env.local`
```env
# Bắt buộc
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVER_KEY=eyJ...                 # service_role key — KHÔNG public

# Site / cron
NEXT_PUBLIC_SITE_URL=https://your-domain.vercel.app
CRON_SECRET=your_random_secret

# AI — cần ít nhất 1 trong 2
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key

# AI fallback (tùy chọn)
OPENROUTER_API_KEY=
OPENROUTER_MODEL=

# Telegram (tùy chọn)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Monitoring (tùy chọn)
NEXT_PUBLIC_SENTRY_DSN=
LOGTAIL_TOKEN=
```

> ⚠️ `SUPABASE_SERVER_KEY` là service-role key, có toàn quyền trên database (bỏ qua RLS). **Không** commit giá trị thật vào Git, không log ra console, chỉ set trong biến môi trường của Vercel/local.

### Bước 3 — Chạy SQL migrations trên Supabase
Chạy lần lượt trong SQL Editor của Supabase:
1. `supabase.sql` — schema chính
2. `supabase-transactions.sql` — bảng giao dịch
3. `supabase-portfolio-v2.sql` — danh mục v2
4. `supabase-portfolio-settings.sql` — cài đặt
5. `supabase-telegram.sql` — thông báo Telegram
6. `supabase-ai-cache.sql` — cache kết quả AI
7. `supabase-price-snapshots.sql` — bảng giá + đăng ký pg_cron mỗi 30 phút
8. `portfolio_snapshots.sql` — lịch sử snapshot danh mục cho biểu đồ hiệu suất

> ⚠️ Trong `supabase-price-snapshots.sql`, thay `edge_url` và `service_key` bằng project ref + service-role key **của chính bạn** trước khi chạy. **Tuyệt đối không** để lại key thật của người khác trong file này nếu bạn fork/copy từ nơi khác — đây là service-role key, lộ ra là lộ toàn quyền database.

### Bước 4 — Deploy Edge Function
Supabase Dashboard → Edge Functions → tạo function tên `vci-prices` → paste nội dung `supabase/functions/vci-prices/index.ts` → Deploy (tắt **Verify JWT**, vì pg_net gọi bằng service key riêng).

### Bước 5 — Deploy lên Vercel
Kết nối repo GitHub với Vercel, thêm toàn bộ biến môi trường ở Bước 2. File `vercel.json` đã khai báo cron `/api/cron/daily` chạy 15:20 giờ VN (08:20 UTC), Thứ 2–Thứ 6 — đúng giới hạn 1 cron/ngày của Vercel free plan.

### Chạy test
```bash
npm test            # vitest run
npm run test:watch  # chế độ watch
npm run test:coverage
```

---

## 📁 Cấu trúc thư mục

```
src/
├── app/
│   ├── page.tsx                  # Watchlist + AI Scan
│   ├── dashboard/                # Danh mục đầu tư (giao dịch, AI Insights, export)
│   ├── backtest/                 # Backtest chiến lược
│   ├── market/                   # Tổng quan thị trường (VN-Index)
│   ├── gold-live/                # Giá vàng
│   ├── oil-live/                 # Giá dầu
│   ├── system-live/              # Tín hiệu sống
│   ├── auth/                     # Login / quên / đặt lại mật khẩu
│   └── api/
│       ├── ai/                   # models, portfolio-insights, watchlist-scan
│       ├── cron/daily/           # Cron duy nhất: snapshot + Telegram + EOD backfill
│       ├── dividends/scan/       # Quét gợi ý cổ tức
│       ├── portfolio/            # export (xlsx/csv), snapshots (lịch sử)
│       ├── prices/, history/, company/[symbol]/
│       ├── telegram/             # settings, test
│       ├── gold-live/, oil-live/, system-live/, market-overview/, backtest/
│       └── debug/datasources/    # endpoint debug nguồn giá — bảo vệ bằng CRON_SECRET
├── components/
│   └── dashboard/                # dashboard-actions, portfolio-view, performance-chart, allocation-alerts
├── lib/
│   ├── calculations.ts           # Tính toán danh mục, P&L, rủi ro
│   ├── telegram.ts                # Build & gửi message Telegram
│   ├── use-allocation-alerts.ts  # Hook cảnh báo tỷ trọng
│   ├── sector-map.ts              # Phân loại mã theo ngành
│   └── server/
│       ├── market.ts              # Điều phối nguồn giá (DNSE → Yahoo → VCI → snapshot)
│       ├── providers/             # dnse-realtime, yahoo, vci-edge, vci-chart, ssi
│       ├── exchanges/             # Mapping sàn (HOSE/HNX/UPCOM)
│       ├── technical-indicators.ts # SMA/EMA/MACD/Bollinger/ADX...
│       ├── sector-analyzer.ts     # Xoay vòng ngành
│       ├── money-flow.ts          # Dòng tiền / foreign flow
│       ├── earnings-analyzer.ts   # KQKD theo mùa BCTC
│       ├── portfolio-optimizer.ts # Risk parity, correlation matrix
│       ├── ai-insights.ts         # Tổng hợp prompt + gọi AI
│       ├── ai-cache.ts            # Cache 2 lớp + rate limit AI
│       ├── ai-models.ts           # Danh sách model AI
│       ├── history-store.ts       # Lazy backfill lịch sử giá
│       └── logger.ts              # Logger Sentry + Logtail
└── __tests__/                    # Vitest: calculations, ai-insights

supabase/
└── functions/vci-prices/         # Edge Function lấy giá VCI (Deno)
```

---

## 📝 Lưu ý

- **HOSE/HNX/UPCOM realtime** lấy từ DNSE (Entrade), trễ khoảng 1 phút; Yahoo Finance và VCI chỉ là fallback khi DNSE thiếu dữ liệu.
- **VNINDEX** cũng đi qua chuỗi fallback trên, không còn cố định một nguồn duy nhất.
- Mọi gợi ý từ AI (điểm số, TP/SL, gợi ý tỷ trọng, gợi ý cổ tức) **chỉ là tham khảo**, không phải lời khuyên đầu tư và không tự động thực thi giao dịch.
- Ứng dụng chỉ theo dõi **cổ phiếu Việt Nam**.
