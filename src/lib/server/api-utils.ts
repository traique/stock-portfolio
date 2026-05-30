import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export function validationErrorResponse(error: z.ZodError) {
  return NextResponse.json(
    {
      error: 'Invalid request',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
    { status: 400 }
  );
}

export function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return token || null;
}

// ---------------------------------------------------------------------------
// verifyCronSecret — dùng chung cho tất cả cron endpoints
//
// Vercel tự động gắn header "authorization: Bearer <CRON_SECRET>" khi gọi
// cron job. Nếu gọi thủ công từ bên ngoài mà không có đúng secret → 401.
//
// Cách dùng:
//   const err = verifyCronSecret(request);
//   if (err) return err;
// ---------------------------------------------------------------------------
export function verifyCronSecret(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  // Nếu không cấu hình CRON_SECRET thì chặn toàn bộ để tránh endpoint hở
  if (!cronSecret) {
    console.error('[cron] CRON_SECRET chưa được cấu hình — từ chối tất cả request');
    return NextResponse.json(
      { error: 'Server misconfigured: CRON_SECRET is not set' },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const provided   = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  // So sánh bằng timingSafeEqual để tránh timing attack
  if (!timingSafeEqual(provided, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null; // OK
}

/**
 * So sánh 2 string trong O(n) cố định để tránh timing side-channel.
 * Không dùng crypto.timingSafeEqual vì nó yêu cầu Buffer cùng length.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // vẫn phải chạy loop để tránh leak độ dài qua thời gian
    let diff = 0;
    for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i % a.length) ^ b.charCodeAt(i));
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}
