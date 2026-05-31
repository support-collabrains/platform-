'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, X, Sparkles, RefreshCw, ChevronRight } from 'lucide-react';
import { useApiRequest } from '@/hooks/use-api-request';

interface Hint {
  id: string;
  type: 'appointment' | 'deadline' | 'ticket_due';
  title: string;
  suggestedDate: string | null;
  source: 'mail' | 'document' | 'ticket';
  createdAt: string;
}

const SOURCE_LABEL: Record<string, string> = {
  mail: 'E-mail',
  document: 'Document',
  ticket: 'Taak',
};

const TYPE_COLOR: Record<string, string> = {
  appointment: 'text-cyan-400',
  deadline: 'text-orange-400',
  ticket_due: 'text-emerald-400',
};

function formatHintDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return iso; }
}

export default function ProactiveHints() {
  const { request } = useApiRequest();
  const [hints, setHints] = useState<Hint[]>([]);
  const [scanning, setScanning] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await request<{ hints: Hint[] }>('/api/me/proactive/hints');
      setHints(data.hints ?? []);
    } catch { /* silent */ }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  const scan = async () => {
    setScanning(true);
    try {
      const data = await request<{ hints: Hint[] }>('/api/me/proactive/hints', { method: 'POST' });
      if ((data.hints ?? []).length > 0) await load();
    } finally {
      setScanning(false);
    }
  };

  const accept = async (hint: Hint) => {
    setAccepting(hint.id);
    try {
      await request(`/api/me/proactive/hints/${hint.id}`, {
        method: 'POST',
        body: JSON.stringify(hint.suggestedDate ? { start: hint.suggestedDate } : {}),
      });
      setHints(prev => prev.filter(h => h.id !== hint.id));
    } finally {
      setAccepting(null);
    }
  };

  const dismiss = async (id: string) => {
    try {
      await request(`/api/me/proactive/hints/${id}`, { method: 'DELETE' });
      setHints(prev => prev.filter(h => h.id !== id));
    } catch { /* silent */ }
  };

  if (hints.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-cyan-400" />
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Diggi suggereert</h3>
        </div>
        <button onClick={scan} disabled={scanning}
          className="text-slate-600 hover:text-slate-400 transition disabled:opacity-40">
          <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="space-y-2">
        {hints.map(hint => (
          <div key={hint.id}
            className="rounded-2xl p-3 flex items-start gap-3"
            style={{ background: 'var(--dc-surf2)', border: '1px solid var(--dc-border)' }}>

            <CalendarPlus size={16} className={`${TYPE_COLOR[hint.type] ?? 'text-slate-400'} mt-0.5 shrink-0`} />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-100 truncate">{hint.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {hint.suggestedDate && (
                  <span className="text-xs text-cyan-500">{formatHintDate(hint.suggestedDate)}</span>
                )}
                <span className="text-xs text-slate-600">{SOURCE_LABEL[hint.source]}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => accept(hint)}
                disabled={accepting === hint.id}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-cyan-400 hover:bg-cyan-500/10 transition disabled:opacity-50"
              >
                {accepting === hint.id
                  ? <RefreshCw size={11} className="animate-spin" />
                  : <><ChevronRight size={11} />Toevoegen</>
                }
              </button>
              <button onClick={() => dismiss(hint.id)}
                className="p-1 text-slate-600 hover:text-slate-400 transition rounded-lg hover:bg-white/5">
                <X size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
