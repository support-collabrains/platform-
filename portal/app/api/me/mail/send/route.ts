import { NextRequest, NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

export async function POST(req: NextRequest) {
  const username = req.headers.get('x-authentik-username') ?? 'user';
  const body = await req.json() as { to: string; subject: string; body: string };

  try {
    const res = await fetch(`${API}/mail/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-authentik-username': username,
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}
