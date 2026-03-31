import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      error: 'Route /api/prices should be served by Vercel rewrite to /api/vnstock_prices',
      provider: 'disabled-next-fallback',
    },
    { status: 500 }
  );
}
