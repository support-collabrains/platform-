import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '';

export async function GET() {
  const hdrs = await headers();
  const res = await fetch(`${API}/admin/tickets`, {
    headers: {
      'x-internal-secret': INTERNAL_SECRET,
      'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
      'x-authentik-groups': hdrs.get('x-authentik-groups') ?? '',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({ tickets: [] }));
  return NextResponse.json(data, { status: res.status });
}
