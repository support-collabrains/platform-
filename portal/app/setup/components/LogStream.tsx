'use client';

import { useEffect, useRef } from 'react';
import type { BootstrapLogEntry } from '@/lib/api';

interface LogStreamProps {
  entries: BootstrapLogEntry[];
}

export default function LogStream({ entries }: LogStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div className="bg-slate-950 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
      {entries.length === 0 ? (
        <span className="text-slate-500">Waiting for provisioning to start...</span>
      ) : (
        entries.map((entry, i) => (
          <div key={i} className={`mb-1 ${entry.error ? 'text-red-400' : 'text-emerald-400'}`}>
            <span className="text-slate-500 mr-2">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
            <span className="text-slate-400 mr-2">[{entry.step}]</span>
            <span>{entry.message}</span>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
