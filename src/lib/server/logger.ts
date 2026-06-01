// src/lib/server/logger.ts
//
// Structured logger tối ưu cho free tier:
// - Sentry Free: 5000 errors/tháng → chỉ gửi error thật sự, không gửi warn
// - Logtail Free: 1GB/tháng → chỉ gửi warn + error, không gửi info
// - Dev: console với màu sắc đầy đủ

type LogLevel = 'info' | 'warn' | 'error';
type LogContext = Record<string, unknown>;

// ── Logtail (Better Stack) ────────────────────────────────────────────────────
// Free: 1GB/tháng log ingestion
// Chỉ gửi warn + error để tiết kiệm quota

function sendToLogtail(level: 'warn' | 'error', message: string, ctx: LogContext) {
  const token = process.env.LOGTAIL_TOKEN;
  if (!token) return;

  // Fire-and-forget — không await để không block response
  fetch('https://in.logtail.com', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      dt:      new Date().toISOString(),
      level,
      message,
      service: 'lcta',
      ...ctx,
    }),
  }).catch(() => { /* logging failure không crash app */ });
}

// ── Sentry ────────────────────────────────────────────────────────────────────
// Free: 5000 errors/tháng
// Chỉ gửi Error objects thật sự — không gửi warn hay string messages
// để tránh tốn quota vào những thứ không cần action

function sendToSentry(error: Error, ctx: LogContext) {
  if (process.env.NODE_ENV !== 'production') return;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN)   return;

  // Dynamic import để không làm nặng bundle nếu Sentry chưa cần
  import('@sentry/nextjs').then(Sentry => {
    Sentry.captureException(error, { extra: ctx });
  }).catch(() => {});
}

// ── Dev formatter ─────────────────────────────────────────────────────────────

function formatDev(level: LogLevel, message: string, ctx: LogContext) {
  const colors: Record<LogLevel, string> = {
    info:  '\x1b[36m',
    warn:  '\x1b[33m',
    error: '\x1b[31m',
  };
  const reset  = '\x1b[0m';
  const label  = `${colors[level]}[${level.toUpperCase()}]${reset}`;
  const ctxStr = Object.keys(ctx).length ? `\n  ${JSON.stringify(ctx, null, 2)}` : '';
  console[level === 'info' ? 'log' : level](`${label} ${message}${ctxStr}`);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const logger = {
  // info: dev only — không gửi lên bất kỳ service nào ở production
  // Dùng cho debug, flow tracking
  info(message: string, ctx: LogContext = {}) {
    if (process.env.NODE_ENV !== 'production') formatDev('info', message, ctx);
  },

  // warn: Logtail only — không gửi Sentry (tiết kiệm 5k quota)
  // Dùng cho: rate limit hit, cache miss, retry, business logic edge cases
  warn(message: string, ctx: LogContext = {}) {
    if (process.env.NODE_ENV !== 'production') { formatDev('warn', message, ctx); return; }
    sendToLogtail('warn', message, ctx);
  },

  // error: Logtail + Sentry — chỉ dùng khi có lỗi thật cần fix
  // Dùng cho: uncaught exception, DB failure, AI API failure, auth failure
  error(message: string, error?: unknown, ctx: LogContext = {}) {
    const errCtx: LogContext = {
      ...ctx,
      ...(error instanceof Error
        ? { error_message: error.message, error_stack: error.stack?.split('\n').slice(0, 5).join('\n') }
        : error !== undefined ? { error_raw: String(error) } : {}),
    };

    if (process.env.NODE_ENV !== 'production') { formatDev('error', message, errCtx); return; }

    sendToLogtail('error', message, errCtx);
    if (error instanceof Error) sendToSentry(error, ctx);
  },
};
