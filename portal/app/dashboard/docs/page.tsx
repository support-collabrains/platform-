// portal/app/dashboard/docs/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { FileText, Search, ExternalLink } from 'lucide-react';
import { useT } from '../LangContext';

interface Doc {
  id: number;
  title: string;
  created: string;
}

function paperlessUrl(id: number): string {
  // NEXT_PUBLIC_API_URL = https://portal.domain.tld/api (in production)
  // → https://docs.domain.tld/documents/123/
  const api = process.env.NEXT_PUBLIC_API_URL ?? '';
  return api.replace('portal.', 'docs.').replace(/\/api$/, '') + `/documents/${id}/`;
}

export default function DocsPage() {
  const t = useT();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me/documents')
      .then(r => r.ok ? r.json() : { docs: [] })
      .then((d: { docs?: Doc[] }) => setDocs(d.docs ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = docs.filter(d => d.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="search"
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-2xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-slate-800 rounded-2xl p-4 animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-700 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-slate-700 rounded w-3/4" />
                  <div className="h-2.5 bg-slate-700/50 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-600">
            <FileText size={40} className="mb-3 opacity-30" />
            <p className="text-sm">{query ? t.noResults : t.noDocs}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(doc => (
              <a
                key={doc.id}
                href={paperlessUrl(doc.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-slate-800 rounded-2xl p-4 hover:bg-slate-700/80 active:scale-[0.98] transition group"
              >
                <div className="w-10 h-10 bg-slate-700 group-hover:bg-slate-600 rounded-xl flex items-center justify-center shrink-0 transition">
                  <FileText size={18} className="text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-100 truncate">{doc.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(doc.created).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <ExternalLink size={15} className="text-slate-600 group-hover:text-slate-400 transition shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
