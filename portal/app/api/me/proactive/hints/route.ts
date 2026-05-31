import { NextRequest, NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

function headers(req: NextRequest) {
  return {
    'Content-Type': 'application/json',
    'x-authentik-username': req.headers.get('x-authentik-username') ?? '',
    'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
  };
}

export async function GET(req: NextRequest) {
  const res = await fetch(`${API}/proactive/hints`, { headers: headers(req) });
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  // trigger scan
  const res = await fetch(`${API}/proactive/scan`, { method: 'POST', headers: headers(req) });
  return NextResponse.json(await res.json());
}
