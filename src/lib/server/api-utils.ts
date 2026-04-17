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

export function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  return authHeader.replace(/^Bearer\s+/i, '').trim();
}
