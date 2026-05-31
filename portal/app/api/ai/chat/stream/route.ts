import { NextRequest } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

export async function POST(req: NextRequest) {
  const username = req.headers.get('x-authentik-username') ?? 'user';
  const body = await req.json() as { messages: { role: string; content: string }[]; context?: string };

  try {
    const upstream = await fetch(`${API}/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-authentik-username': username,
        'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
      },
      body: JSON.stringify(body),
    });

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch {
    const fallback = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"token":"Service niet beschikbaar."}\n\ndata: [DONE]\n\n'));
        controller.close();
      },
    });
    return new Response(fallback, { headers: { 'Content-Type': 'text/event-stream' } });
  }
}
