import { NextRequest, NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

function hdrs(req: NextRequest) {
  return {
    'Content-Type': 'application/json',
    'x-authentik-username': req.headers.get('x-authentik-username') ?? '',
    'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${API}/proactive/hints/${id}/accept`, {
    method: 'POST',
    headers: hdrs(req),
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json());
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${API}/proactive/hints/${id}`, { method: 'DELETE', headers: hdrs(req) });
  return NextResponse.json(await res.json());
}
