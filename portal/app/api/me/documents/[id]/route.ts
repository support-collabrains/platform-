import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const SECRET = process.env.INTERNAL_API_SECRET ?? '';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const hdrs = await headers();
  const res = await fetch(`${API}/users/me/documents/${id}`, {
    headers: {
      'x-internal-secret': SECRET,
      'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
      'x-authentik-username': hdrs.get('x-authentik-username') ?? '',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
