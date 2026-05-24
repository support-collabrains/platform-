import { Bell } from 'lucide-react';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

interface NotificationRow {
  id: string;
  documentTitle: string;
  status: string;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: '⏳ Wacht op bevestiging',
  processing: '🔄 Bezig',
  done: '✅ Samenvatting verzonden',
  failed: '❌ Mislukt',
};

export default async function NotificationLog({ uid }: { uid: string }) {
  let notifications: NotificationRow[] = [];
  try {
    const res = await fetch(`${INTERNAL_API_URL}/users/me/notifications`, {
      headers: { 'x-internal-secret': INTERNAL_API_SECRET, 'x-authentik-uid': uid },
      cache: 'no-store',
    });
    if (res.ok) ({ notifications } = await res.json() as { notifications: NotificationRow[] });
  } catch { /* empty fallback */ }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <Bell size={15} className="text-slate-400" /> Notificatie log
      </h2>
      {notifications.length === 0 ? (
        <p className="text-sm text-slate-400">Nog geen notificaties.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {notifications.map((n) => (
            <li key={n.id} className="py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700 truncate max-w-xs">{n.documentTitle}</span>
                <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">
                  {new Date(n.createdAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{STATUS_LABEL[n.status] ?? n.status}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
