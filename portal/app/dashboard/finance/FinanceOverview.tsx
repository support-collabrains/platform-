'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { useT } from '../LangContext';
import { useApiRequest } from '@/hooks/use-api-request';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface MaandTotaal {
  maand: string;
  totaal: number;
  perCategorie: Record<string, number>;
}

interface Summary {
  maandTotalen: MaandTotaal[];
  abonnementenMaandlast: number;
  actieveAbonnementen: number;
  pendingCount: number;
}

interface Transaction {
  id: string;
  leverancier: string;
  bedrag: number;
  datum: string;
  categorie: string;
  source: string;
  status: string;
}

const SOURCE_LABEL: Record<string, string> = {
  paperless: '📄',
  mail: '✉️',
  manual: '✏️',
};

const CATEGORIE_KLEUREN: Record<string, string> = {
  Wonen: 'bg-blue-500',
  Boodschappen: 'bg-green-500',
  Abonnementen: 'bg-purple-500',
  Verzekeringen: 'bg-orange-500',
  Transport: 'bg-yellow-500',
  Gezondheid: 'bg-red-500',
  Overig: 'bg-slate-500',
};

export default function FinanceOverview({ onTabChange }: { onTabChange?: (tab: string) => void }) {
  const t = useT();
  const { request } = useApiRequest();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      request<Summary>('/api/me/finance/summary').catch(() => null),
      request<Transaction[]>('/api/me/finance/transactions?status=approved').catch(() => []),
    ]).then(([sum, txs]) => {
      setSummary(sum);
      setRecentTx((txs ?? []).slice(0, 5));
    }).catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const thisMonthTotal = summary?.maandTotalen.find(m => m.maand === thisMonth)?.totaal ?? 0;
  const maxTotal = Math.max(...(summary?.maandTotalen.map(m => m.totaal) ?? [1]), 1);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <AlertCircle size={36} className="text-red-400 opacity-60" />
        <p className="text-sm text-slate-400">{t.errorLoading}</p>
        <Button onClick={load} variant="secondary" size="sm">
          <RefreshCw size={14} />{t.errorRetry}
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <div className="text-xl font-bold text-emerald-400">
              {loading ? '—' : `€${Number(thisMonthTotal).toFixed(0)}`}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{t.financeThisMonth}</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xl font-bold text-purple-400">
              {loading ? '—' : `€${Number(summary?.abonnementenMaandlast ?? 0).toFixed(0)}`}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{t.financeMonthlyTotal}</div>
          </Card>
          <button onClick={() => onTabChange?.('pending')} className="focus:outline-none">
            <Card className="p-3 text-center cursor-pointer hover:bg-slate-700/80 transition">
              <div className="text-xl font-bold text-amber-400">
                {loading ? '—' : (summary?.pendingCount ?? 0)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{t.financePending}</div>
            </Card>
          </button>
        </div>

        {/* Staafgrafiek — CSS-only */}
        {!loading && summary && summary.maandTotalen.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Uitgaven per maand
            </h3>
            <div className="flex items-end gap-2 h-28">
              {summary.maandTotalen.map(m => {
                const height = Math.max(4, (m.totaal / maxTotal) * 100);
                const isCurrentMonth = m.maand === thisMonth;
                const maandLabel = new Date(m.maand + '-01').toLocaleDateString('nl-NL', { month: 'short' });
                return (
                  <div key={m.maand} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] text-slate-500">€{Math.round(m.totaal)}</span>
                    <div
                      className={`w-full rounded-t-lg transition-all ${isCurrentMonth ? 'bg-emerald-500' : 'bg-slate-700'}`}
                      style={{ height: `${height}%` }}
                    />
                    <span className={`text-[9px] ${isCurrentMonth ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {maandLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recente transacties */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Recente transacties
            </h3>
            <button
              onClick={() => onTabChange?.('all')}
              className="text-xs text-cyan-500 hover:text-cyan-400"
            >
              Alle
            </button>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-slate-800 rounded-2xl p-3 animate-pulse">
                  <div className="h-3 bg-slate-700 rounded w-2/3 mb-1.5" />
                  <div className="h-2.5 bg-slate-700/50 rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : recentTx.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-slate-600 gap-2">
              <TrendingDown size={32} className="opacity-30" />
              <p className="text-sm">{t.financeNoTransactions}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTx.map(tx => (
                <div key={tx.id} className="bg-slate-800 rounded-2xl p-3 flex items-center gap-3">
                  <span className="text-base shrink-0">{SOURCE_LABEL[tx.source] ?? '💶'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{tx.leverancier}</p>
                    <p className="text-xs text-slate-500">{tx.datum}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-200">€{Number(tx.bedrag).toFixed(2)}</p>
                    <span className={`inline-block w-2 h-2 rounded-full ${CATEGORIE_KLEUREN[tx.categorie] ?? 'bg-slate-500'}`} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
