import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

async function forwardHeaders() {
  const hdrs = await headers();
  return {
    'x-internal-secret': INTERNAL_API_SECRET,
    'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
    'x-authentik-username': hdrs.get('x-authentik-username') ?? '',
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json() as unknown;
  const fwd = await forwardHeaders();
  const res = await fetch(`${INTERNAL_API_URL}/push/subscribe`, {
    method: 'POST',
    headers: { ...fwd, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
