'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, Plus, Check, X } from 'lucide-react';
import { useT } from '../LangContext';
import { useApiRequest } from '@/hooks/use-api-request';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type FinanceCategorie = 'Wonen' | 'Boodschappen' | 'Abonnementen' | 'Verzekeringen' | 'Transport' | 'Gezondheid' | 'Overig';

const CATEGORIEEN: FinanceCategorie[] = [
  'Wonen', 'Boodschappen', 'Abonnementen', 'Verzekeringen', 'Transport', 'Gezondheid', 'Overig',
];

interface Transaction {
  id: string;
  leverancier: string;
  bedrag: number;
  datum: string;
  categorie: string;
  source: string;
  status: string;
  type: string;
  notes?: string;
}

const SOURCE_LABEL: Record<string, string> = { paperless: '📄', mail: '✉️', manual: '✏️' };
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  approved: 'success', pending: 'warning', rejected: 'error',
};

interface AddForm {
  leverancier: string;
  bedrag: string;
  datum: string;
  categorie: FinanceCategorie;
  type: 'eenmalig' | 'abonnement';
}

const EMPTY_FORM: AddForm = {
  leverancier: '', bedrag: '', datum: new Date().toISOString().slice(0, 10),
  categorie: 'Overig', type: 'eenmalig',
};

export default function FinanceTransactions({ initialTab = 'all' }: { initialTab?: string }) {
  const t = useT();
  const { request } = useApiRequest();
  const [tab, setTab] = useState<'all' | 'pending' | 'subscriptions'>(
    initialTab === 'pending' ? 'pending' : 'all'
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    const url = tab === 'pending'
      ? '/api/me/finance/transactions?status=pending'
      : tab === 'subscriptions'
      ? '/api/me/finance/transactions?type=abonnement'
      : '/api/me/finance/transactions';
    request<Transaction[]>(url)
      .then(data => setTransactions(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [request, tab]);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: string) => {
    await fetch(`/api/me/finance/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    load();
  };

  const reject = async (id: string) => {
    await fetch(`/api/me/finance/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    load();
  };

  const addTransaction = async () => {
    if (!form.leverancier || !form.bedrag || !form.datum) return;
    setSaving(true);
    await fetch('/api/me/finance/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, bedrag: parseFloat(form.bedrag) }),
    });
    setSaving(false);
    setShowAdd(false);
    setForm(EMPTY_FORM);
    load();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Tabs */}
        <div className="flex bg-slate-800 rounded-2xl p-1 gap-1">
          {(['all', 'pending', 'subscriptions'] as const).map(t2 => (
            <button
              key={t2}
              onClick={() => setTab(t2)}
              className={`flex-1 py-2 text-xs font-medium rounded-xl transition ${
                tab === t2 ? 'bg-slate-700 text-cyan-400' : 'text-slate-500'
              }`}
            >
              {t2 === 'all' ? t.financeAll : t2 === 'pending' ? t.financePendingTab : t.financeSubscriptionsTab}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-800 rounded-2xl p-4 animate-pulse">
                <div className="h-3 bg-slate-700 rounded w-2/3 mb-2" />
                <div className="h-2.5 bg-slate-700/50 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center py-12 gap-3 text-slate-600">
            <AlertCircle size={32} className="opacity-40" />
            <p className="text-sm">{t.errorServiceUnavailable}</p>
            <Button onClick={load} variant="secondary" size="sm">
              <RefreshCw size={14} />{t.errorRetry}
            </Button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-600">
            <p className="text-sm">{t.financeNoTransactions}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => (
              <Card key={tx.id} className="p-3">
                <div className="flex items-center gap-3">
                  <span className="text-base shrink-0">{SOURCE_LABEL[tx.source] ?? '💶'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{tx.leverancier}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500">{tx.datum}</span>
                      <Badge variant="default" className="text-[9px] px-1.5 py-0">{tx.categorie}</Badge>
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-sm font-semibold text-slate-200">€{Number(tx.bedrag).toFixed(2)}</p>
                    <Badge variant={STATUS_VARIANT[tx.status] ?? 'default'} className="text-[9px]">
                      {tx.status}
                    </Badge>
                  </div>
                  {tx.status === 'pending' && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => void approve(tx.id)}
                        className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-lg transition"
                        title={t.financeApprove}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => void reject(tx.id)}
                        className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition"
                        title={t.financeReject}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Handmatige invoer formulier */}
        {showAdd && (
          <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">{t.financeAddTransaction}</h3>
            <input
              className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-cyan-500"
              placeholder="Leverancier"
              value={form.leverancier}
              onChange={e => setForm(f => ({ ...f, leverancier: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.01"
                className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                placeholder="Bedrag €"
                value={form.bedrag}
                onChange={e => setForm(f => ({ ...f, bedrag: e.target.value }))}
              />
              <input
                type="date"
                className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                value={form.datum}
                onChange={e => setForm(f => ({ ...f, datum: e.target.value }))}
              />
            </div>
            <select
              className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
              value={form.categorie}
              onChange={e => setForm(f => ({ ...f, categorie: e.target.value as FinanceCategorie }))}
            >
              {CATEGORIEEN.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex gap-2">
              <Button onClick={() => void addTransaction()} variant="primary" size="md" disabled={saving} className="flex-1">
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
            className="fixed bottom-20 right-4 w-12 h-12 bg-emerald-500 hover:bg-emerald-400 text-white rounded-full shadow-lg flex items-center justify-center transition active:scale-95 z-10"
            aria-label={t.financeAddTransaction}
          >
            <Plus size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
