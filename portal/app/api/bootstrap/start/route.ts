import { NextRequest, NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${API}/bootstrap/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
