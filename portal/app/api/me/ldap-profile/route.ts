import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

async function forwardHeaders() {
  const hdrs = await headers();
  const out: Record<string, string> = {
    'x-internal-secret': INTERNAL_API_SECRET,
  };
  for (const key of ['x-authentik-username', 'x-authentik-groups', 'x-authentik-email', 'x-authentik-uid']) {
    const v = hdrs.get(key);
    if (v) out[key] = v;
  }
  return out;
}

export async function GET() {
  const fwd = await forwardHeaders();
  const res = await fetch(`${INTERNAL_API_URL}/users/me/ldap-profile`, {
    headers: fwd,
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function PATCH(request: NextRequest) {
  const fwd = await forwardHeaders();
  const body = await request.json() as unknown;
  const res = await fetch(`${INTERNAL_API_URL}/users/me/ldap-profile`, {
    method: 'PATCH',
    headers: { ...fwd, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
