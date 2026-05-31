import { NextRequest, NextResponse } from 'next/server';

const PAPERLESS = process.env.INTERNAL_API_URL
  ? `${process.env.INTERNAL_API_URL}/gateway/paperless`
  : 'http://api:3001/gateway/paperless';

export async function POST(req: NextRequest) {
  const username = req.headers.get('x-authentik-username') ?? 'user';
  try {
    const formData = await req.formData();
    // Relay multipart form to NestJS paperless gateway upload endpoint
    const res = await fetch(`${PAPERLESS}/upload`, {
      method: 'POST',
      headers: {
        'x-authentik-username': username,
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
      },
      body: formData,
    });
    const text = await res.text();
    return new NextResponse(text, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
