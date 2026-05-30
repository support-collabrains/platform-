import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const SECRET = process.env.INTERNAL_API_SECRET ?? '';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const hdrs = await headers();
  const res = await fetch(`${API}/users/me/documents/${id}/preview`, {
    headers: {
      'x-internal-secret': SECRET,
      'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
      'x-authentik-username': hdrs.get('x-authentik-username') ?? '',
    },
    cache: 'no-store',
  });

  if (!res.ok) return NextResponse.json({ error: 'Niet gevonden' }, { status: res.status });

  // Allowlist safe render types; force download for everything else to prevent XSS
  const SAFE_INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
  const rawCt = (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const safeCt = SAFE_INLINE.has(rawCt) ? rawCt : 'application/octet-stream';
  const disposition = SAFE_INLINE.has(rawCt) ? 'inline' : 'attachment';

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'content-type': safeCt,
      'content-disposition': disposition,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'",
    },
  });
}
