import { NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const TOKEN = `Bearer ${process.env.AUTHENTIK_WEBHOOK_SECRET ?? ''}`;

export async function PATCH() {
  const res = await fetch(`${API}/admin/apply-branding`, {
    method: 'PATCH',
    headers: { Authorization: TOKEN },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
