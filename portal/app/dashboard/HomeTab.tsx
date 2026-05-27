'use client';

import { useEffect, useState } from 'react';
import { Bell, CheckCircle, Clock, XCircle } from 'lucide-react';
import Link from 'next/link';

interface Notification {
  id: string;
  documentTitle: string;
  status: string;
  createdAt: string;
}

const STATUS_CONFIG = {
  done:       { label: 'Samenvatting verzonden', color: 'text-green-400',  border: 'border-l-green-500',  Icon: CheckCircle },
  processing: { label: 'Bezig met verwerken',    color: 'text-yellow-400', border: 'border-l-yellow-500', Icon: Clock },
  pending:    { label: 'Wacht op verwerking',    color: 'text-slate-400',  border: 'border-l-slate-600',  Icon: Clock },
  failed:     { label: 'Mislukt',                color: 'text-red-400',    border: 'border-l-red-500',    Icon: XCircle },
} as const;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return 'zojuist';
  if (m < 60) return `${m}m geleden`;
  if (h < 24) return `${h}u geleden`;
  if (d < 7) return `${d}d geleden`;
  return new Date(dateStr).toLocaleDateString('nl-NL');
}

export default function HomeTab({ username }: { username: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [unreadMail, setUnreadMail] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/me/notifications').then(r => r.ok ? r.json() : { notifications: [] }),
      fetch('/api/me/documents').then(r => r.ok ? r.json() : { docs: [] }),
      fetch('/api/me/mail/stats').then(r => r.ok ? r.json() : { unread: 0 }),
    ]).then(([notifData, docsData, mailData]) => {
      setNotifications((notifData as { notifications?: Notification[] }).notifications ?? []);
      setDocCount(((docsData as { docs?: unknown[] }).docs ?? []).length);
      setUnreadMail((mailData as { unread?: number }).unread ?? 0);
    }).finally(() => setLoading(false));
  }, []);

  const pending = notifications.filter(n => n.status !== 'done' && n.status !== 'failed').length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* Greeting */}
        <div className="pt-1">
          <h2 className="text-xl font-bold text-slate-100">Welkom, {username}</h2>
          <p className="text-sm text-slate-500 mt-0.5">Hier is je overzicht</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <Link href="/dashboard/docs" className="bg-slate-800 rounded-2xl p-4 text-center hover:bg-slate-700/80 active:scale-95 transition">
            <div className="text-2xl font-bold text-cyan-400">{loading ? '—' : docCount}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">Documenten</div>
          </Link>
          <Link href="/dashboard/mail" className="bg-slate-800 rounded-2xl p-4 text-center hover:bg-slate-700/80 active:scale-95 transition">
            <div className="text-2xl font-bold text-blue-400">{loading ? '—' : unreadMail}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">Ongelezen mail</div>
          </Link>
          <div className="bg-slate-800 rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-orange-400">{loading ? '—' : pending}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">In verwerking</div>
          </div>
        </div>

        {/* Activity feed */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Recente activiteit</h3>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-slate-800 rounded-2xl p-4 animate-pulse">
                  <div className="h-3 bg-slate-700 rounded w-2/3 mb-2" />
                  <div className="h-2.5 bg-slate-700/50 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-slate-600">
              <Bell size={36} className="mb-3 opacity-30" />
              <p className="text-sm">Nog geen activiteit</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map(n => {
                const cfg = STATUS_CONFIG[n.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
                const { Icon } = cfg;
                return (
                  <div key={n.id} className={`bg-slate-800 rounded-2xl p-4 flex items-start gap-3 border-l-2 ${cfg.border}`}>
                    <Icon size={16} className={`${cfg.color} mt-0.5 shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{n.documentTitle}</p>
                      <p className={`text-xs mt-0.5 ${cfg.color}`}>{cfg.label}</p>
                    </div>
                    <span className="text-xs text-slate-600 whitespace-nowrap shrink-0">{timeAgo(n.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
