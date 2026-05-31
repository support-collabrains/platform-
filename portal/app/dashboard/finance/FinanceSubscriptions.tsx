'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, Plus, CreditCard } from 'lucide-react';
import { useT } from '../LangContext';
import { useApiRequest } from '@/hooks/use-api-request';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Subscription {
  id: string;
  naam: string;
  bedrag: number;
  interval: string;
  volgendeBetaaldatum: string;
  opzegtermijnDagen: number;
  actief: boolean;
}

function deadlineDays(sub: Subscription): number {
  const betaal = new Date(sub.volgendeBetaaldatum).getTime();
  const deadline = betaal - sub.opzegtermijnDagen * 86_400_000;
  return Math.ceil((deadline - Date.now()) / 86_400_000);
}

function urgencyVariant(days: number): 'error' | 'warning' | 'success' {
  if (days <= 0) return 'error';
  if (days <= 7) return 'warning';
  return 'success';
}

const INTERVAL_LABEL: Record<string, string> = {
  maandelijks: '/mnd', kwartaal: '/kwt', jaarlijks: '/jr',
};

const EMPTY_FORM = {
  naam: '', bedrag: '', interval: 'maandelijks',
  volgendeBetaaldatum: '', opzegtermijnDagen: '30',
};

export default function FinanceSubscriptions() {
  const t = useT();
  const { request } = useApiRequest();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    request<Subscription[]>('/api/me/finance/subscriptions')
      .then(data => setSubs(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.naam || !form.bedrag || !form.volgendeBetaaldatum) return;
    setSaving(true);
    await fetch('/api/me/finance/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        bedrag: parseFloat(form.bedrag),
        opzegtermijnDagen: parseInt(form.opzegtermijnDagen),
      }),
    });
    setSaving(false);
    setShowAdd(false);
    setForm(EMPTY_FORM);
    load();
  };

  const toggle = async (sub: Subscription) => {
    await fetch(`/api/me/finance/subscriptions/${sub.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actief: !sub.actief }),
    });
    load();
  };

  const activeSubs = subs.filter(s => s.actief);
  const alerts = activeSubs.filter(s => deadlineDays(s) <= 14);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {alerts.length > 0 && (
          <div className="bg-red-950/40 border border-red-800/40 rounded-2xl px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-red-300 flex items-center gap-2">
              <AlertCircle size={14} />
              {t.financeAlertDeadline}
            </p>
            {alerts.map(s => {
              const days = deadlineDays(s);
              return (
                <p key={s.id} className="text-xs text-red-400 pl-5">
                  {s.naam} — {days <= 0 ? 'opzegtermijn verstreken' : `nog ${days} dag(en)`}
                </p>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-800 rounded-2xl p-4 animate-pulse">
                <div className="h-3 bg-slate-700 rounded w-1/2 mb-2" />
                <div className="h-2.5 bg-slate-700/50 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center py-12 gap-3 text-slate-600">
            <AlertCircle size={32} className="opacity-40" />
            <Button onClick={load} variant="secondary" size="sm">
              <RefreshCw size={14} />{t.errorRetry}
            </Button>
          </div>
        ) : subs.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-600 gap-2">
            <CreditCard size={36} className="opacity-30" />
            <p className="text-sm">{t.financeNoSubscriptions}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {subs.map(sub => {
              const days = sub.actief ? deadlineDays(sub) : null;
              return (
                <Card key={sub.id} className={`p-4 ${!sub.actief ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
                      <CreditCard size={16} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100">{sub.naam}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Volgende betaling: {sub.volgendeBetaaldatum}
                      </p>
                      {sub.actief && days !== null && (
                        <Badge variant={urgencyVariant(days)} className="mt-1 text-[9px]">
                          {days <= 0 ? 'Opzegtermijn verstreken' : `Opzeggen binnen ${days}d`}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-purple-400">
                        €{Number(sub.bedrag).toFixed(2)}{INTERVAL_LABEL[sub.interval] ?? ''}
                      </p>
                      <button
                        onClick={() => void toggle(sub)}
                        className={`text-[10px] mt-1 transition ${sub.actief ? 'text-slate-500 hover:text-red-400' : 'text-slate-600 hover:text-green-400'}`}
                      >
                        {sub.actief ? 'Deactiveer' : 'Activeer'}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {showAdd && (
          <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">{t.financeAddSubscription}</h3>
            <input
              className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-cyan-500"
              placeholder="Naam (bijv. Netflix)"
              value={form.naam}
              onChange={e => setForm(f => ({ ...f, naam: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number" step="0.01"
                className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                placeholder="Bedrag €"
                value={form.bedrag}
                onChange={e => setForm(f => ({ ...f, bedrag: e.target.value }))}
              />
              <select
                className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                value={form.interval}
                onChange={e => setForm(f => ({ ...f, interval: e.target.value }))}
              >
                <option value="maandelijks">Maandelijks</option>
                <option value="kwartaal">Per kwartaal</option>
                <option value="jaarlijks">Jaarlijks</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Volgende betaaldatum</label>
                <input
                  type="date"
                  className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                  value={form.volgendeBetaaldatum}
                  onChange={e => setForm(f => ({ ...f, volgendeBetaaldatum: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Opzegtermijn (dagen)</label>
                <input
                  type="number"
                  className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                  value={form.opzegtermijnDagen}
                  onChange={e => setForm(f => ({ ...f, opzegtermijnDagen: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void add()} variant="primary" size="md" disabled={saving} className="flex-1">
                {saving ? t.saving : t.financeSave}
              </Button>
              <Button onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }} variant="ghost" size="md">
                {t.financeCancel}
              </Button>
            </div>
          </div>
        )}

        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="fixed bottom-20 right-4 w-12 h-12 bg-purple-500 hover:bg-purple-400 text-white rounded-full shadow-lg flex items-center justify-center transition active:scale-95 z-10"
            aria-label={t.financeAddSubscription}
          >
            <Plus size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
