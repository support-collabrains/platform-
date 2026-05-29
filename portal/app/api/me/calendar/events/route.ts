import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

function forwardHeaders(hdrs: Awaited<ReturnType<typeof headers>>) {
  return {
    'x-internal-secret': INTERNAL_API_SECRET,
    'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
    'x-authentik-username': hdrs.get('x-authentik-username') ?? '',
  };
}

export async function GET(request: NextRequest) {
  const hdrs = await headers();
  const { searchParams } = request.nextUrl;
  const qs = searchParams.toString();
  try {
    const res = await fetch(`${INTERNAL_API_URL}/users/me/calendar/events${qs ? `?${qs}` : ''}`, {
      headers: forwardHeaders(hdrs),
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ events: [] });
  }
}

export async function POST(request: NextRequest) {
  const hdrs = await headers();
  try {
    const body = await request.json() as unknown;
    const res = await fetch(`${INTERNAL_API_URL}/users/me/calendar/events`, {
      method: 'POST',
      headers: { ...forwardHeaders(hdrs), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
