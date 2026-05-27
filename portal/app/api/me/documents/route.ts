import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

export async function GET() {
  const hdrs = await headers();
  try {
    const res = await fetch(`${INTERNAL_API_URL}/users/me/documents`, {
      headers: {
        'x-internal-secret': INTERNAL_API_SECRET,
        'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
        'x-authentik-username': hdrs.get('x-authentik-username') ?? '',
      },
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ docs: [] });
  }
}
