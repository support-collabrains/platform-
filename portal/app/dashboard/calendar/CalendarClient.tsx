'use client';

import { useCallback, useEffect, useState } from 'react';
import { Calendar, Plus, Clock, MapPin, RefreshCw, AlertCircle } from 'lucide-react';
import { useT } from '../LangContext';
import { useApiRequest } from '@/hooks/use-api-request';
import { Button } from '@/components/ui/button';

interface CalEvent {
  uid: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  allDay: boolean;
}

function formatDate(iso: string, allDay: boolean): string {
  try {
    const d = new Date(allDay ? iso + 'T00:00:00' : iso);
    return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return iso; }
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function groupByDate(events: CalEvent[]): { date: string; events: CalEvent[] }[] {
  const map = new Map<string, CalEvent[]>();
  for (const ev of events) {
    const key = ev.start.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, evs]) => ({ date, events: evs }));
}

export default function CalendarClient() {
  const t = useT();
  const { request } = useApiRequest();
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ summary: '', start: '', end: '', location: '', allDay: false });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    request<{ events?: CalEvent[] }>(`/api/me/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(d => setEvents(d.events ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.summary || !form.start) return;
    setSaving(true);
    const start = form.allDay ? form.start : new Date(form.start).toISOString();
    const end = form.end ? (form.allDay ? form.end : new Date(form.end).toISOString()) : start;
    await fetch('/api/me/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: form.summary, start, end, location: form.location || undefined, allDay: form.allDay }),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ summary: '', start: '', end: '', location: '', allDay: false });
    load();
  };

  const today = new Date().toISOString().slice(0, 10);
  const groups = groupByDate(events);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        <Button
          onClick={() => setShowForm(!showForm)}
          variant="secondary"
          size="md"
          className="w-full border-cyan-500/20 text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20"
        >
          <Plus size={16} />
          {t.calendarAdd}
        </Button>

        {showForm && (
          <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
            <input className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-cyan-500" placeholder="Titel" value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input type="checkbox" checked={form.allDay} onChange={e => setForm(f => ({ ...f, allDay: e.target.checked }))} className="rounded" />
              {t.calendarAllDay}
            </label>
            {form.allDay ? (
              <div className="grid grid-cols-2 gap-2">
                <input type="date" className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
                <input type="date" className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input type="datetime-local" className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
                <input type="datetime-local" className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
              </div>
            )}
            <input className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-cyan-500" placeholder="Locatie (optioneel)" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            <Button
              onClick={() => void save()}
              variant="primary"
              size="md"
              disabled={saving || !form.summary || !form.start}
              className="w-full"
            >
              {saving ? t.saving : t.calendarAdd}
            </Button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-800 rounded-2xl p-4 animate-pulse">
                <div className="h-2.5 bg-slate-700 rounded w-1/4 mb-3" />
                <div className="h-3 bg-slate-700 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center py-12 text-slate-600 gap-3">
            <AlertCircle size={32} className="opacity-40" />
            <p className="text-sm">Agenda niet beschikbaar</p>
            <Button onClick={load} variant="secondary" size="sm">
              <RefreshCw size={14} />{t.errorRetry}
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-600">
            <Calendar size={36} className="mb-3 opacity-30" />
            <p className="text-sm">{t.calendarNoEvents}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(({ date, events: evs }) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${date === today ? 'text-cyan-400' : 'text-slate-500'}`}>
                    {date === today ? t.calendarToday : formatDate(date, true)}
                  </span>
                </div>
                <div className="space-y-2">
                  {evs.map(ev => (
                    <div key={ev.uid} className={`bg-slate-800 rounded-2xl p-4 border-l-2 ${date === today ? 'border-l-cyan-500' : 'border-l-slate-600'}`}>
                      <p className="text-sm font-medium text-slate-100">{ev.summary}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {!ev.allDay && (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Clock size={11} /><span>{formatTime(ev.start)}</span>
                          </div>
                        )}
                        {ev.allDay && <span className="text-xs text-slate-500">{t.calendarAllDay}</span>}
                        {ev.location && (
                          <div className="flex items-center gap-1 text-xs text-slate-500 truncate">
                            <MapPin size={11} /><span className="truncate">{ev.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
