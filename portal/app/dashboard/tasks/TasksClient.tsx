'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Trash2, Clock, AlertCircle, PlusCircle, RefreshCw } from 'lucide-react';
import { useT } from '../LangContext';
import { useApiRequest } from '@/hooks/use-api-request';

interface Ticket {
  id: string;
  seq: number;
  title: string;
  status: string;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
}

function dueLabel(dueDate: string | null): { text: string; color: string } | null {
  if (!dueDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate < today) return { text: dueDate, color: 'text-red-400' };
  if (dueDate === today) return { text: dueDate, color: 'text-orange-400' };
  return { text: dueDate, color: 'text-slate-400' };
}

export default function TasksClient() {
  const t = useT();
  const { request } = useApiRequest();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [done, setDone] = useState<Ticket[]>([]);
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      request<{ tickets?: Ticket[] }>('/api/me/tickets').catch(() => ({ tickets: [] as Ticket[] })),
      request<{ tickets?: Ticket[] }>('/api/me/tickets?status=done').catch(() => ({ tickets: [] as Ticket[] })),
    ]).then(([openData, doneData]) => {
      setTickets(openData.tickets ?? []);
      setDone(doneData.tickets ?? []);
    }).catch(() => {
      setLoadError(true);
    }).finally(() => setLoading(false));
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const markDone = async (id: string) => {
    await fetch(`/api/me/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    load();
  };

  const del = async (id: string) => {
    await fetch(`/api/me/tickets/${id}`, { method: 'DELETE' });
    load();
  };

  const current = tab === 'open' ? tickets : done;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = tickets.filter(tk => tk.dueDate && tk.dueDate < today).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {overdue > 0 && (
          <div className="bg-red-950/40 border border-red-800/40 rounded-2xl px-4 py-3 flex items-center gap-3">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <span className="text-sm text-red-300">{overdue} {t.tasksOverdue}</span>
          </div>
        )}

        <div className="flex bg-slate-800 rounded-2xl p-1">
          <button onClick={() => setTab('open')} className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${tab === 'open' ? 'bg-slate-700 text-cyan-400' : 'text-slate-500'}`}>
            {t.tasksOpen} {tickets.length > 0 && <span className="ml-1 text-xs bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full">{tickets.length}</span>}
          </button>
          <button onClick={() => setTab('done')} className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${tab === 'done' ? 'bg-slate-700 text-slate-300' : 'text-slate-500'}`}>
            {t.tasksDone}
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-800 rounded-2xl p-4 animate-pulse">
                <div className="h-3 bg-slate-700 rounded w-3/4 mb-2" />
                <div className="h-2.5 bg-slate-700/50 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center py-12 text-slate-600 gap-3">
            <AlertCircle size={32} className="opacity-40" />
            <p className="text-sm">{t.errorServiceUnavailable}</p>
            <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm transition">
              <RefreshCw size={14} />{t.errorRetry}
            </button>
          </div>
        ) : current.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-600">
            <CheckCircle2 size={36} className="mb-3 opacity-30" />
            <p className="text-sm mb-2">{tab === 'open' ? t.tasksEmpty : t.tasksDoneEmpty}</p>
            {tab === 'open' && <p className="text-xs text-center text-slate-700 max-w-[240px]">{t.tasksAddSignal}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {current.map(tk => {
              const due = dueLabel(tk.dueDate);
              const isOverdue = tk.dueDate && tk.dueDate < today && tk.status === 'open';
              return (
                <div key={tk.id} className={`bg-slate-800 rounded-2xl p-4 border-l-2 ${isOverdue ? 'border-l-red-500' : tk.dueDate === today ? 'border-l-orange-500' : 'border-l-transparent'}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-slate-600 mt-0.5 shrink-0">#{tk.seq}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${tk.status === 'done' ? 'line-through text-slate-500' : 'text-slate-100'} truncate`}>{tk.title}</p>
                      {due && (
                        <div className={`flex items-center gap-1 mt-1 text-xs ${due.color}`}>
                          <Clock size={11} />
                          <span>{due.text}</span>
                        </div>
                      )}
                    </div>
                    {tk.status === 'open' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => void markDone(tk.id)} className="text-green-400 hover:text-green-300 active:scale-90 transition" title={t.tasksMarkDone}>
                          <CheckCircle2 size={20} />
                        </button>
                        <button onClick={() => void del(tk.id)} className="text-slate-600 hover:text-red-400 active:scale-90 transition" title={t.tasksDelete}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'open' && tickets.length > 0 && (
          <div className="flex items-center gap-2 text-slate-700 text-xs pt-2">
            <PlusCircle size={14} />
            <span>{t.tasksAddSignal}</span>
          </div>
        )}
      </div>
    </div>
  );
}
