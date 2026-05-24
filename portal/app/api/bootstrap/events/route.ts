const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

export async function GET() {
  const upstream = await fetch(`${API}/bootstrap/events`, {
    headers: { Accept: 'text/event-stream' },
    cache: 'no-store',
  });

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
