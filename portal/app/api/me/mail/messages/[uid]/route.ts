import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  const hdrs = await headers();
  const folder = req.nextUrl.searchParams.get('folder') ?? 'INBOX';
  try {
    const res = await fetch(
      `${INTERNAL_API_URL}/mail/messages/${uid}?folder=${encodeURIComponent(folder)}`,
      {
        headers: {
          'x-internal-secret': INTERNAL_API_SECRET,
          'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
        },
        cache: 'no-store',
      },
    );
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch message' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  const hdrs = await headers();
  const folder = req.nextUrl.searchParams.get('folder') ?? 'INBOX';
  try {
    await fetch(
      `${INTERNAL_API_URL}/mail/messages/${uid}?folder=${encodeURIComponent(folder)}`,
      {
        method: 'DELETE',
        headers: {
          'x-internal-secret': INTERNAL_API_SECRET,
          'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
        },
      },
    );
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
  }
}
