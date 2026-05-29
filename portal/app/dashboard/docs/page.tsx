// portal/app/dashboard/docs/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { FileText, Search, ExternalLink, FolderOpen, Folder, List, GitBranch } from 'lucide-react';
import { useT } from '../LangContext';

interface Doc {
  id: number;
  title: string;
  created: string;
}

interface TreeNode {
  name: string;
  children?: TreeNode[];
}

function paperlessUrl(id: number): string {
  const api = process.env.NEXT_PUBLIC_API_URL ?? '';
  return api.replace('portal.', 'docs.').replace(/\/api$/, '') + `/documents/${id}/`;
}

function TreeNodeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = node.children && node.children.length > 0;
  return (
    <div>
      <button
        onClick={() => hasChildren && setOpen(o => !o)}
        className={`flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-xl text-sm transition
          ${depth === 0 ? 'font-medium text-slate-200 hover:bg-slate-700/60' : 'text-slate-400 hover:bg-slate-700/40'}
          ${hasChildren ? 'cursor-pointer' : 'cursor-default'}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {hasChildren ? (
          open
            ? <FolderOpen size={14} className="text-cyan-400 shrink-0" />
            : <Folder size={14} className="text-slate-500 shrink-0" />
        ) : (
          <Folder size={14} className="text-slate-600 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {open && hasChildren && (
        <div>
          {node.children!.map(child => (
            <TreeNodeView key={child.name} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocsPage() {
  const t = useT();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'tree'>('list');

  useEffect(() => {
    Promise.all([
      fetch('/api/me/documents')
        .then(r => r.ok ? r.json() : { docs: [] })
        .then((d: { docs?: Doc[] }) => setDocs(d.docs ?? [])),
      fetch('/api/me/tree')
        .then(r => r.ok ? r.json() : { tree: [] })
        .then((d: { tree?: TreeNode[] }) => setTree(d.tree ?? [])),
    ]).finally(() => setLoading(false));
  }, []);

  const filtered = docs.filter(d => d.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="search"
              placeholder={t.searchPlaceholder}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-2xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>
          <div className="flex bg-slate-800 border border-slate-700 rounded-2xl p-1 gap-1">
            <button
              onClick={() => setView('list')}
              className={`p-1.5 rounded-xl transition ${view === 'list' ? 'bg-slate-600 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
              title="Lijst"
            >
              <List size={15} />
            </button>
            <button
              onClick={() => setView('tree')}
              className={`p-1.5 rounded-xl transition ${view === 'tree' ? 'bg-slate-600 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
              title="Mappenstructuur"
            >
              <GitBranch size={15} />
            </button>
          </div>
        </div>

        {/* List view */}
        {view === 'list' && (
          loading ? (
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
          )
        )}

        {/* Tree view */}
        {view === 'tree' && (
          loading ? (
            <div className="space-y-1">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="bg-slate-800 rounded-xl h-8 animate-pulse" />
              ))}
            </div>
          ) : tree.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-600">
              <Folder size={40} className="mb-3 opacity-30" />
              <p className="text-sm">Geen archiefmappen beschikbaar</p>
            </div>
          ) : (
            <div className="bg-slate-800 rounded-2xl py-2">
              {tree.map(node => (
                <TreeNodeView key={node.name} node={node} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
