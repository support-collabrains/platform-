import { NextRequest, NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

export async function POST(req: NextRequest) {
  const username = req.headers.get('x-authentik-username') ?? 'user';
  const body = await req.json() as { messages: {role: string; content: string}[]; context?: string };

  try {
    const res = await fetch(`${API}/ai/chat`, {
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
    return NextResponse.json({ reply: 'Service niet beschikbaar.', model: '' }, { status: 503 });
  }
}
