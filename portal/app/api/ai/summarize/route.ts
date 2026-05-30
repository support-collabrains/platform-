import { NextRequest, NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

export async function POST(req: NextRequest) {
  const username = req.headers.get('x-authentik-username') ?? 'user';
  const { text } = await req.json() as { text: string };

  try {
    const res = await fetch(`${API}/ai/summarize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-authentik-username': username,
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
      },
      body: JSON.stringify({ text }),
    });
    const data = await res.json() as { summary: string };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ summary: '' }, { status: 503 });
  }
}
