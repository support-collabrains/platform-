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

async function proxy(req: NextRequest, path: string): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const qs = searchParams.toString();
  const url = `${INTERNAL_API_URL}/me/finance/${path}${qs ? `?${qs}` : ''}`;
  const fwd = await forwardHeaders();

  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const res = await fetch(url, { method: req.method, headers: fwd, cache: 'no-store' });
      return NextResponse.json(await res.json(), { status: res.status });
    }
    const body = await req.json() as unknown;
    const res = await fetch(url, {
      method: req.method,
      headers: { ...fwd, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path.join('/'));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path.join('/'));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path.join('/'));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path.join('/'));
}
