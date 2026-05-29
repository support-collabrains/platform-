'use client';

import { useEffect, useState } from 'react';
import { Bell, CheckCircle, Clock, XCircle, Calendar, Camera } from 'lucide-react';
import Link from 'next/link';
import { useT } from './LangContext';

interface Notification {
  id: string;
  documentTitle: string;
  status: string;
  createdAt: string;
}

interface CalEvent {
  uid: string;
  summary: string;
  start: string;
  allDay: boolean;
}

export default function HomeTab({ username }: { username: string }) {
  const t = useT();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [unreadMail, setUnreadMail] = useState(0);
  const [openTasks, setOpenTasks] = useState(0);
  const [todayEvents, setTodayEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const STATUS_CONFIG = {
    done:       { label: t.statusDone,       color: 'text-green-400',  border: 'border-l-green-500',  Icon: CheckCircle },
    processing: { label: t.statusProcessing, color: 'text-yellow-400', border: 'border-l-yellow-500', Icon: Clock },
    pending:    { label: t.statusPending,    color: 'text-slate-400',  border: 'border-l-slate-600',  Icon: Clock },
    failed:     { label: t.statusFailed,     color: 'text-red-400',    border: 'border-l-red-500',    Icon: XCircle },
  } as const;

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60_000);
    const h = Math.floor(diff / 3_600_000);
    const d = Math.floor(diff / 86_400_000);
    if (m < 1) return t.timeJustNow;
    if (m < 60) return t.timeMinutes(m);
    if (h < 24) return t.timeHours(h);
    if (d < 7) return t.timeDays(d);
    return new Date(dateStr).toLocaleDateString('nl-NL');
  }

  function formatEventTime(ev: CalEvent): string {
    if (ev.allDay) return t.calendarAllDay;
    try { return new Date(ev.start).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    Promise.all([
      fetch('/api/me/notifications').then(r => r.ok ? r.json() : { notifications: [] }),
      fetch('/api/me/documents').then(r => r.ok ? r.json() : { docs: [] }),
      fetch('/api/me/mail/stats').then(r => r.ok ? r.json() : { unread: 0 }),
      fetch('/api/me/tickets').then(r => r.ok ? r.json() : { tickets: [] }),
      fetch(`/api/me/calendar/events?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(tomorrow)}`).then(r => r.ok ? r.json() : { events: [] }),
    ]).then(([notifData, docsData, mailData, ticketsData, calData]) => {
      setNotifications((notifData as { notifications?: Notification[] }).notifications ?? []);
      setDocCount(((docsData as { docs?: unknown[] }).docs ?? []).length);
      setUnreadMail((mailData as { unread?: number }).unread ?? 0);
      setOpenTasks(((ticketsData as { tickets?: unknown[] }).tickets ?? []).length);
      const allEvents = (calData as { events?: CalEvent[] }).events ?? [];
      setTodayEvents(allEvents.filter(ev => ev.start.slice(0, 10) === today));
    }).finally(() => setLoading(false));
  }, []);

  const pending = notifications.filter(n => n.status !== 'done' && n.status !== 'failed').length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* Greeting */}
        <div className="pt-1">
          <h2 className="text-xl font-bold text-slate-100">{t.welcome(username)}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{t.overview}</p>
        </div>

        {/* Stats row — 4 tiles */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/docs" className="bg-slate-800 rounded-2xl p-4 text-center hover:bg-slate-700/80 active:scale-95 transition">
            <div className="text-2xl font-bold text-cyan-400">{loading ? '—' : docCount}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">{t.statDocs}</div>
          </Link>
          <Link href="/dashboard/mail" className="bg-slate-800 rounded-2xl p-4 text-center hover:bg-slate-700/80 active:scale-95 transition">
            <div className="text-2xl font-bold text-blue-400">{loading ? '—' : unreadMail}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">{t.statMail}</div>
          </Link>
          <Link href="/dashboard/tasks" className="bg-slate-800 rounded-2xl p-4 text-center hover:bg-slate-700/80 active:scale-95 transition">
            <div className="text-2xl font-bold text-emerald-400">{loading ? '—' : openTasks}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">{t.statTasks}</div>
          </Link>
          <div className="bg-slate-800 rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-orange-400">{loading ? '—' : pending}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">{t.statProcessing}</div>
          </div>
        </div>

        {/* Today's agenda */}
        {(loading || todayEvents.length > 0) && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t.calendarToday}</h3>
              <Link href="/dashboard/calendar" className="text-xs text-cyan-500 hover:text-cyan-400">
                <Calendar size={14} />
              </Link>
            </div>
            {loading ? (
              <div className="bg-slate-800 rounded-2xl p-4 animate-pulse">
                <div className="h-3 bg-slate-700 rounded w-1/2" />
              </div>
            ) : (
              <div className="space-y-2">
                {todayEvents.map(ev => (
                  <Link href="/dashboard/calendar" key={ev.uid} className="flex items-center gap-3 bg-slate-800 rounded-2xl p-3 hover:bg-slate-700/80 transition">
                    <div className="w-1 self-stretch bg-cyan-500 rounded-full shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{ev.summary}</p>
                      <p className="text-xs text-slate-500">{formatEventTime(ev)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick links — Calendar & Photos */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/calendar" className="bg-slate-800 rounded-2xl p-4 flex flex-col items-center gap-2 hover:bg-slate-700/80 active:scale-95 transition">
            <Calendar size={24} className="text-sky-400" />
            <span className="text-xs text-slate-500">{t.titleCalendar}</span>
          </Link>
          <Link href="/dashboard/photos" className="bg-slate-800 rounded-2xl p-4 flex flex-col items-center gap-2 hover:bg-slate-700/80 active:scale-95 transition">
            <Camera size={24} className="text-purple-400" />
            <span className="text-xs text-slate-500">{t.titlePhotos}</span>
          </Link>
        </div>

        {/* Activity feed */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{t.recentActivity}</h3>
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
            <div className="flex flex-col items-center py-10 text-slate-600">
              <Bell size={36} className="mb-3 opacity-30" />
              <p className="text-sm">{t.noActivity}</p>
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
