import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Chỉ bật tracing ở production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

  // Chỉ gửi lỗi ở production
  enabled: process.env.NODE_ENV === 'production',

  // Ẩn dữ liệu nhạy cảm
  beforeSend(event) {
    // Xóa cookie và header khỏi error payload
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
    }
    return event;
  },
});
