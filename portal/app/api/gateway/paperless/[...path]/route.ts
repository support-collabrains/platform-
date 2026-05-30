import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

async function forwardHeaders(req: NextRequest) {
  const hdrs = await headers();
  const out: Record<string, string> = {
    'x-internal-secret': INTERNAL_API_SECRET,
    'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
    'x-authentik-username': hdrs.get('x-authentik-username') ?? '',
  };
  const contentType = req.headers.get('content-type');
  if (contentType) out['content-type'] = contentType;
  return out;
}

async function proxy(req: NextRequest, pathSegments: string[]) {
  const upstream = `${INTERNAL_API_URL}/gateway/paperless/${pathSegments.join('/')}`;
  const fwd = await forwardHeaders(req);

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const res = await fetch(upstream, {
    method: req.method,
    headers: fwd,
    body: body ? Buffer.from(body) : undefined,
    cache: 'no-store',
  });

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return NextResponse.json(await res.json(), { status: res.status });
  }
  const data = await res.arrayBuffer();
  return new NextResponse(data, {
    status: res.status,
    headers: { 'content-type': contentType },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(req, path);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(req, path);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(req, path);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(req, path);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(req, path);
}
