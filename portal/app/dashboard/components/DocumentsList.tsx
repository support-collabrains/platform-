import { FileText } from 'lucide-react';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

interface PaperlessDoc {
  id: number;
  title: string;
  created: string;
}

export default async function DocumentsList({ uid }: { uid: string }) {
  let docs: PaperlessDoc[] = [];
  try {
    const res = await fetch(`${INTERNAL_API_URL}/users/me/documents`, {
      headers: { 'x-internal-secret': INTERNAL_API_SECRET, 'x-authentik-uid': uid },
      cache: 'no-store',
    });
    if (res.ok) ({ docs } = await res.json() as { docs: PaperlessDoc[] });
  } catch { /* empty fallback */ }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <FileText size={15} className="text-slate-400" /> Recente documenten
      </h2>
      {docs.length === 0 ? (
        <p className="text-sm text-slate-400">Geen documenten gevonden.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700 truncate max-w-xs">{doc.title}</span>
              <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">
                {new Date(doc.created).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
