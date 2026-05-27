import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '';
const WEBHOOK_TOKEN = `Bearer ${process.env.AUTHENTIK_WEBHOOK_SECRET ?? ''}`;

export async function GET() {
  const hdrs = await headers();
  const res = await fetch(`${API}/admin/users`, {
    headers: {
      'x-internal-secret': INTERNAL_SECRET,
      'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
      'x-authentik-groups': hdrs.get('x-authentik-groups') ?? '',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${API}/admin/users`, {
    method: 'POST',
    headers: { Authorization: WEBHOOK_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
