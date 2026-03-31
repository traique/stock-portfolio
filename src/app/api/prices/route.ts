import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      error: 'Please use /api/vnstock_prices directly.',
      provider: 'disabled-next-fallback',
    },
    { status: 500 }
  );
}
