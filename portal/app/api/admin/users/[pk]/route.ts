import { NextRequest, NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const TOKEN = `Bearer ${process.env.AUTHENTIK_WEBHOOK_SECRET ?? ''}`;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ pk: string }> },
) {
  const { pk } = await params;
  const res = await fetch(`${API}/admin/users/${pk}`, {
    method: 'DELETE',
    headers: { Authorization: TOKEN },
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
