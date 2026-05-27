import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

export async function GET(req: NextRequest) {
  const hdrs = await headers();
  const { searchParams } = req.nextUrl;
  const params = new URLSearchParams({
    folder: searchParams.get('folder') ?? 'INBOX',
    page: searchParams.get('page') ?? '1',
    limit: searchParams.get('limit') ?? '25',
  });
  try {
    const res = await fetch(`${INTERNAL_API_URL}/mail/messages?${params}`, {
      headers: {
        'x-internal-secret': INTERNAL_API_SECRET,
        'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
      },
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ messages: [], total: 0 }, { status: 200 });
  }
}
