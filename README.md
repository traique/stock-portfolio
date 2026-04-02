# LCTA – Danh mục đầu tư cổ phiếu

LCTA là ứng dụng theo dõi danh mục cổ phiếu Việt Nam, tối ưu cho mobile và triển khai tốt trên Vercel.

## Tính năng chính

- Đăng nhập bằng Supabase Auth
- Theo dõi danh mục riêng theo từng tài khoản
- Thêm mã, giá mua, số lượng, ngày mua và ghi chú
- Tự tính:
  - Tổng vốn
  - NAV
  - Lãi/lỗ ngày
  - Lãi/lỗ danh mục
  - Hiệu suất từng vị thế
- Watchlist riêng theo từng user
- Giá thị trường lấy từ Yahoo Finance chart API
- Hiển thị thêm:
  - Giá hiện tại
  - Mức thay đổi
  - % thay đổi
  - Giá tham chiếu
  - Trần/Sàn ước tính
- Giao diện sáng/tối
- Header gọn, tối ưu mobile
- Hiển thị ngày dương, ngày âm và thời tiết hiện tại

## Công nghệ sử dụng

- Next.js
- React
- TypeScript
- Supabase
- lucide-react
- lunar-javascript
- Vercel

## Cấu trúc dữ liệu

### Bảng `holdings`
Lưu danh mục cổ phiếu của người dùng.

Các cột chính:
- `user_id`
- `symbol`
- `buy_price`
- `quantity`
- `buy_date`
- `note`

### Bảng `watchlists`
Lưu watchlist riêng cho từng người dùng.

Các cột chính:
- `user_id`
- `symbol`

## Cài đặt môi trường

Tạo file `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_supabase_anon_key
```

## Chạy SQL trên Supabase

Mở **Supabase Dashboard** → **SQL Editor** → **New query** → dán toàn bộ nội dung file `supabase.sql` → bấm **Run**.

Sau khi chạy xong, kiểm tra trong **Table Editor** phải có:
- `holdings`
- `watchlists`

## Chạy local

```bash
npm install
npm run dev
```

## Deploy Vercel

1. Push code lên GitHub
2. Import repo vào Vercel
3. Thêm biến môi trường:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
4. Redeploy

## API giá cổ phiếu

App dùng route nội bộ:

- `GET /api/prices?symbols=FPT,HPG,VCB`

Response gồm:
- `prices`
- `debug`
- `updatedAt`
- `provider`

## Ghi chú

- Giá trần và giá sàn hiện là **ước tính theo biên độ 7%** từ giá tham chiếu
- Watchlist sẽ ưu tiên lưu trên Supabase; nếu chưa sẵn sàng thì fallback sang localStorage
- Dữ liệu giá phụ thuộc vào nguồn thị trường từ Yahoo

## Gợi ý nâng cấp tiếp

- Đồng bộ thứ tự watchlist bằng kéo thả
- Thêm cảnh báo giá mục tiêu
- Thêm biểu đồ hiệu suất danh mục
- Thêm lịch sử giao dịch mua/bán

## License

Dùng cho mục đích cá nhân hoặc tùy biến nội bộ.
