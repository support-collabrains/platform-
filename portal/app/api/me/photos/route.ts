import { NextRequest, NextResponse } from 'next/server';

const IMMICH_URL = process.env.IMMICH_INTERNAL_URL || 'http://immich-server:2283';
const IMMICH_KEY = process.env.IMMICH_API_KEY ?? '';

// Immich v2 uses POST /api/search/metadata for asset listing (GET /api/assets was removed)
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = Number(searchParams.get('page') ?? '1');
  const size = Number(searchParams.get('size') ?? '20');

  try {
    const res = await fetch(`${IMMICH_URL}/api/search/metadata`, {
      method: 'POST',
      headers: { 'x-api-key': IMMICH_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, size }),
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ assets: [], total: 0 }, { status: 200 });
    const data = await res.json() as { assets?: { items?: unknown[]; total?: number } };
    return NextResponse.json({
      assets: data.assets?.items ?? [],
      total: data.assets?.total ?? 0,
    });
  } catch {
    return NextResponse.json({ assets: [], total: 0 });
  }
}
