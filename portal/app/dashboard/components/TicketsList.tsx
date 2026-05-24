import { CheckSquare } from 'lucide-react';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

interface SignalTicket {
  id: string;
  title: string;
  seq: number;
  status: string;
  createdAt: string;
}

export default async function TicketsList({ uid }: { uid: string }) {
  let tickets: SignalTicket[] = [];
  try {
    const res = await fetch(`${INTERNAL_API_URL}/users/me/tickets`, {
      headers: { 'x-internal-secret': INTERNAL_API_SECRET, 'x-authentik-uid': uid },
      cache: 'no-store',
    });
    if (res.ok) ({ tickets } = await res.json() as { tickets: SignalTicket[] });
  } catch { /* empty fallback */ }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <CheckSquare size={15} className="text-slate-400" /> Signal taken
      </h2>
      {tickets.length === 0 ? (
        <p className="text-sm text-slate-400">Geen openstaande taken. Stuur /taak via Signal om er een aan te maken.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tickets.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <span className="text-xs font-mono text-slate-400 w-6 text-right">#{t.seq}</span>
              <span className="text-sm text-slate-700 flex-1 truncate">{t.title}</span>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {new Date(t.createdAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
