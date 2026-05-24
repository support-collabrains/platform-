import { NextRequest, NextResponse } from 'next/server';

// Internal URL: portal container → api container via Docker network
const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const TOKEN = `Bearer ${process.env.AUTHENTIK_WEBHOOK_SECRET ?? ''}`;

export async function GET() {
  const res = await fetch(`${API}/admin/users`, {
    headers: { Authorization: TOKEN },
    cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${API}/admin/users`, {
    method: 'POST',
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
