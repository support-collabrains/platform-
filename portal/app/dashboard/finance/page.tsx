'use client';

import { useState } from 'react';
import FinanceOverview from './FinanceOverview';
import FinanceTransactions from './FinanceTransactions';
import FinanceSubscriptions from './FinanceSubscriptions';

type ActiveTab = 'overview' | 'transactions' | 'subscriptions';

export default function FinancePage() {
  const [tab, setTab] = useState<ActiveTab>('overview');
  const [txInitialTab, setTxInitialTab] = useState('all');

  function handleTabChange(t: string) {
    if (t === 'pending' || t === 'all') {
      setTxInitialTab(t);
      setTab('transactions');
    } else if (t === 'overview' || t === 'transactions' || t === 'subscriptions') {
      setTab(t);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top tabs */}
      <div className="shrink-0 px-4 pt-3 pb-0">
        <div className="flex bg-slate-800 rounded-2xl p-1 gap-1">
          {(['overview', 'transactions', 'subscriptions'] as const).map(t2 => (
            <button
              key={t2}
              onClick={() => setTab(t2)}
              className={`flex-1 py-2 text-xs font-medium rounded-xl transition ${
                tab === t2 ? 'bg-slate-700 text-cyan-400' : 'text-slate-500'
              }`}
            >
              {t2 === 'overview' ? 'Overzicht' : t2 === 'transactions' ? 'Transacties' : 'Abonnementen'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {tab === 'overview' && <FinanceOverview onTabChange={handleTabChange} />}
        {tab === 'transactions' && <FinanceTransactions initialTab={txInitialTab} />}
        {tab === 'subscriptions' && <FinanceSubscriptions />}
      </div>
    </div>
  );
}
