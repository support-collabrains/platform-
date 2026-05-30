// portal/app/dashboard/docs/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, FileText, FolderOpen, Folder, Search, ExternalLink, List, GitBranch, Tag, X } from 'lucide-react';
import { useT } from '../LangContext';

interface Doc {
  id: number;
  title: string;
  created: string;
  document_type?: number | null;
}

interface DocType {
  id: number;
  name: string;
  document_count: number;
}

interface TreeNode {
  name: string;
  children?: TreeNode[];
}

type ViewMode = 'list' | 'tree';

function paperlessUrl(id: number): string {
  const api = process.env.NEXT_PUBLIC_API_URL ?? '';
  return api.replace('portal.', 'docs.').replace(/\/api$/, '') + `/documents/${id}/`;
}

// ── Tree components ───────────────────────────────────────────────────────────

function TreeNodeView({
  node,
  depth = 0,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth?: number;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const hasChildren = !!node.children?.length;
  const [open, setOpen] = useState(depth === 0);
  const isSelected = selected === node.name;

  function handleClick() {
    if (hasChildren) setOpen((v) => !v);
    onSelect(node.name);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
        className={`w-full flex items-center gap-2 py-2 pr-3 text-left rounded-xl transition text-sm
          ${isSelected ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-300 hover:bg-slate-700/50'}`}
      >
        {hasChildren ? (
          <>
            <ChevronRight
              size={14}
              className={`shrink-0 transition-transform text-slate-500 ${open ? 'rotate-90' : ''}`}
            />
            {open ? (
              <FolderOpen size={15} className="shrink-0 text-cyan-400/70" />
            ) : (
              <Folder size={15} className="shrink-0 text-slate-400" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <Folder size={15} className="shrink-0 text-slate-500" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {open && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNodeView
              key={child.name}
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const t = useT();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('list');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/me/documents')
        .then((r) => (r.ok ? r.json() : { docs: [] }))
        .then((d: { docs?: Doc[] }) => d.docs ?? []),
      fetch('/api/me/tree')
        .then((r) => (r.ok ? r.json() : { tree: [] }))
        .then((d: { tree?: TreeNode[] }) => d.tree ?? []),
      fetch('/api/me/document-types')
        .then((r) => (r.ok ? r.json() : { types: [] }))
        .then((d: { types?: DocType[] }) => d.types ?? []),
    ])
      .then(([docsData, treeData, typesData]) => {
        setDocs(docsData);
        setTree(treeData);
        // Only show types that have documents belonging to this user
        const userTypeIds = new Set((docsData as Doc[]).map((d) => d.document_type).filter(Boolean));
        setDocTypes((typesData as DocType[]).filter((ty) => userTypeIds.has(ty.id)));
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = docs.filter((d) => {
    const matchesQuery = d.title.toLowerCase().includes(query.toLowerCase());
    const matchesType = selectedTypeId === null || d.document_type === selectedTypeId;
    return matchesQuery && matchesType;
  });

  // ── List view ──────────────────────────────────────────────────────────────

  function DocList({ items }: { items: Doc[] }) {
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center py-16 text-slate-600">
          <FileText size={40} className="mb-3 opacity-30" />
          <p className="text-sm">{query || selectedTypeId ? t.noResults : t.noDocs}</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {items.map((doc) => (
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
                {new Date(doc.created).toLocaleDateString('nl-NL', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
            <ExternalLink size={15} className="text-slate-600 group-hover:text-slate-400 transition shrink-0" />
          </a>
        ))}
      </div>
    );
  }

  // ── Tree view ──────────────────────────────────────────────────────────────

  function TreeView() {
    if (!tree.length) {
      return (
        <div className="flex flex-col items-center py-16 text-slate-600">
          <FolderOpen size={40} className="mb-3 opacity-30" />
          <p className="text-sm">{t.noArchive}</p>
        </div>
      );
    }
    return (
      <div className="flex gap-0 h-full">
        <div className="w-1/2 overflow-y-auto border-r border-slate-800 p-2 space-y-0.5">
          {tree.map((node) => (
            <TreeNodeView
              key={node.name}
              node={node}
              depth={0}
              selected={selectedCategory}
              onSelect={setSelectedCategory}
            />
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {selectedCategory ? (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">
                {selectedCategory}
              </p>
              <DocList
                items={filtered.filter((d) =>
                  d.title.toLowerCase().includes(selectedCategory.toLowerCase()),
                )}
              />
            </>
          ) : (
            <div className="flex flex-col items-center py-16 text-slate-600">
              <Folder size={32} className="mb-2 opacity-30" />
              <p className="text-xs">{t.selectCategory}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Skeleton ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-slate-800 rounded-2xl p-4 animate-pulse flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-700 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-slate-700 rounded w-3/4" />
              <div className="h-2.5 bg-slate-700/50 rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="shrink-0 px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
            />
            <input
              type="search"
              placeholder={t.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-2xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>
          <div className="flex bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`px-3 py-2.5 transition ${view === 'list' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
              title="Lijst"
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => setView('tree')}
              className={`px-3 py-2.5 transition ${view === 'tree' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
              title="Archief"
            >
              <GitBranch size={16} />
            </button>
          </div>
        </div>

        {/* Document type filter chips */}
        {view === 'list' && docTypes.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedTypeId(null)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition shrink-0
                ${selectedTypeId === null
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500'}`}
            >
              <Tag size={11} />
              Alle ({docs.length})
            </button>
            {docTypes.map((ty) => {
              const count = docs.filter((d) => d.document_type === ty.id).length;
              if (count === 0) return null;
              const isActive = selectedTypeId === ty.id;
              return (
                <button
                  key={ty.id}
                  type="button"
                  onClick={() => setSelectedTypeId(isActive ? null : ty.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition shrink-0
                    ${isActive
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500'}`}
                >
                  {ty.name}
                  <span className={`text-[10px] ${isActive ? 'text-cyan-400/70' : 'text-slate-600'}`}>
                    {count}
                  </span>
                  {isActive && <X size={10} />}
                </button>
              );
            })}
          </div>
        )}

        {view === 'list' && (
          <p className="text-xs text-slate-500 px-1">
            {filtered.length} {filtered.length === 1 ? 'document' : 'documenten'}
            {selectedTypeId !== null && (
              <span className="ml-1 text-cyan-500">
                — {docTypes.find((t) => t.id === selectedTypeId)?.name}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {view === 'list' ? (
          <div className="h-full overflow-y-auto px-4 pb-4">
            <DocList items={filtered} />
          </div>
        ) : (
          <TreeView />
        )}
      </div>
    </div>
  );
}
