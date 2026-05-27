import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

export async function GET() {
  const hdrs = await headers();
  try {
    const res = await fetch(`${INTERNAL_API_URL}/mail/vacation`, {
      headers: {
        'x-internal-secret': INTERNAL_API_SECRET,
        'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
        'x-authentik-username': hdrs.get('x-authentik-username') ?? '',
      },
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ active: false, subject: '', body: '' });
  }
}

export async function PUT(req: NextRequest) {
  const hdrs = await headers();
  const body = await req.json();
  try {
    const res = await fetch(`${INTERNAL_API_URL}/mail/vacation`, {
      method: 'PUT',
      headers: {
        'x-internal-secret': INTERNAL_API_SECRET,
        'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
        'x-authentik-username': hdrs.get('x-authentik-username') ?? '',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to update vacation' }, { status: 500 });
  }
}
