import { NextRequest, NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

export async function GET(req: NextRequest) {
  const username = req.headers.get('x-authentik-username') ?? 'user';
  try {
    const res = await fetch(`${API}/contacts`, {
      headers: {
        'x-authentik-username': username,
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
      },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const username = req.headers.get('x-authentik-username') ?? 'user';
  const body = await req.json();
  try {
    const res = await fetch(`${API}/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-authentik-username': username,
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 503 });
  }
}
