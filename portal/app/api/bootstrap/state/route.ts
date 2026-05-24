import { NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

export async function GET() {
  const res = await fetch(`${API}/bootstrap/state`, { cache: 'no-store' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
