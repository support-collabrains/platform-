// portal/app/dashboard/docs/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, FileText, FolderOpen, Folder, Search, List, GitBranch, Tag, X, RefreshCw, AlertCircle, Upload, CheckCircle } from 'lucide-react';
import { useT } from '../LangContext';
import { useApiRequest } from '@/hooks/use-api-request';

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

function TreeNodeView({
  node, depth = 0, selected, onSelect,
}: {
  node: TreeNode; depth?: number; selected: string | null; onSelect: (path: string) => void;
}) {
  const hasChildren = !!node.children?.length;
  const [open, setOpen] = useState(depth === 0);
  const isSelected = selected === node.name;

  function handleClick() {
    if (hasChildren) setOpen(v => !v);
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
            <ChevronRight size={14} className={`shrink-0 transition-transform text-slate-500 ${open ? 'rotate-90' : ''}`} />
            {open ? <FolderOpen size={15} className="shrink-0 text-cyan-400/70" /> : <Folder size={15} className="shrink-0 text-slate-400" />}
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
          {node.children!.map(child => (
            <TreeNodeView key={child.name} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocsPage() {
  const t = useT();
  const router = useRouter();
  const { request } = useApiRequest();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<ViewMode>('list');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      request<{ docs?: Doc[] }>('/api/me/documents').then(d => d.docs ?? []).catch((): Doc[] => []),
      request<{ tree?: TreeNode[] }>('/api/me/tree').then(d => d.tree ?? []).catch((): TreeNode[] => []),
      request<{ types?: DocType[] }>('/api/me/document-types').then(d => d.types ?? []).catch((): DocType[] => []),
    ]).then(([docsData, treeData, typesData]) => {
      setDocs(docsData);
      setTree(treeData);
      const userTypeIds = new Set(docsData.map(d => d.document_type).filter(Boolean));
      setDocTypes(typesData.filter(ty => userTypeIds.has(ty.id)));
    }).catch(() => {
      setLoadError(true);
    }).finally(() => setLoading(false));
  }, [request]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError('');
    setUploadDone(false);
    try {
      const fd = new FormData();
      fd.append('document', file);
      fd.append('title', file.name.replace(/\.[^.]+$/, ''));
      const res = await fetch('/api/me/documents/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload mislukt');
      setUploadDone(true);
      setTimeout(() => { setShowUpload(false); setUploadDone(false); load(); }, 1500);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const filtered = docs.filter(d => {
    const matchesQuery = d.title.toLowerCase().includes(query.toLowerCase());
    const matchesType = selectedTypeId === null || d.document_type === selectedTypeId;
    return matchesQuery && matchesType;
  });

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
        {items.map(doc => (
          <button
            key={doc.id}
            type="button"
            onClick={() => router.push(`/dashboard/docs/${doc.id}`)}
            className="w-full flex items-center gap-3 bg-slate-800 rounded-2xl p-4 hover:bg-slate-700/80 active:scale-[0.98] transition group text-left"
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
            <ChevronRight size={15} className="text-slate-600 group-hover:text-slate-400 transition shrink-0" />
          </button>
        ))}
      </div>
    );
  }

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
          {tree.map(node => (
            <TreeNodeView key={node.name} node={node} depth={0} selected={selectedCategory} onSelect={setSelectedCategory} />
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {selectedCategory ? (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">{selectedCategory}</p>
              <DocList items={filtered.filter(d => d.title.toLowerCase().includes(selectedCategory.toLowerCase()))} />
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

  if (loading) {
    return (
      <div className="p-4 space-y-2">
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
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <AlertCircle size={36} className="text-red-400 opacity-60" />
        <p className="text-sm text-slate-400">Paperless niet bereikbaar</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm transition"
        >
          <RefreshCw size={14} />
          {t.errorRetry}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--dc-surface)', border: '1px solid var(--dc-border)' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-100">{t.docsUploadTitle}</h3>
              <button onClick={() => setShowUpload(false)} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg transition">
                <X size={16} />
              </button>
            </div>
            <input ref={fileRef} type="file" className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.gif,.webp,.bmp,.txt,.doc,.docx"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            {uploadDone ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle size={40} className="text-green-400" />
                <p className="text-sm text-slate-300">{t.docsUploadSuccess}</p>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full py-10 rounded-xl border-2 border-dashed flex flex-col items-center gap-3 transition hover:bg-white/3 disabled:opacity-50"
                style={{ borderColor: 'var(--dc-border)' }}>
                {uploading
                  ? <><RefreshCw size={28} className="text-blue-400 animate-spin" /><p className="text-sm text-slate-400">{t.docsUploading}</p></>
                  : <><Upload size={28} className="text-slate-400" /><p className="text-sm text-slate-400">{t.docsSelectFile}</p><p className="text-xs text-slate-600">PDF, JPG, PNG, DOCX…</p></>
                }
              </button>
            )}
            {uploadError && <p className="text-xs text-red-400 text-center">{uploadError}</p>}
          </div>
        </div>
      )}

      <div className="shrink-0 px-4 pt-4 pb-3 space-y-3">
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
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white shrink-0 transition"
            style={{ background: 'var(--dc-blue)' }}>
            <Upload size={14} />
            <span className="hidden sm:inline">{t.docsUpload}</span>
          </button>
          <div className="flex rounded-xl overflow-hidden shrink-0"
            style={{ background: 'var(--dc-surf2)', border: '1px solid var(--dc-border)' }}>
            <button type="button" onClick={() => setView('list')} className={`px-3 py-2 transition ${view === 'list' ? 'text-blue-400 bg-blue-500/10' : 'text-slate-500 hover:text-slate-300'}`} title="Lijst">
              <List size={15} />
            </button>
            <button type="button" onClick={() => setView('tree')} className={`px-3 py-2 transition ${view === 'tree' ? 'text-blue-400 bg-blue-500/10' : 'text-slate-500 hover:text-slate-300'}`} title="Archief">
              <GitBranch size={15} />
            </button>
          </div>
        </div>

        {view === 'list' && docTypes.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button type="button" onClick={() => setSelectedTypeId(null)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition shrink-0 ${selectedTypeId === null ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500'}`}>
              <Tag size={11} />
              Alle ({docs.length})
            </button>
            {docTypes.map(ty => {
              const count = docs.filter(d => d.document_type === ty.id).length;
              if (count === 0) return null;
              const isActive = selectedTypeId === ty.id;
              return (
                <button key={ty.id} type="button" onClick={() => setSelectedTypeId(isActive ? null : ty.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition shrink-0 ${isActive ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500'}`}>
                  {ty.name}
                  <span className={`text-[10px] ${isActive ? 'text-cyan-400/70' : 'text-slate-600'}`}>{count}</span>
                  {isActive && <X size={10} />}
                </button>
              );
            })}
          </div>
        )}

        {view === 'list' && (
          <p className="text-xs text-slate-500 px-1">
            {filtered.length} {filtered.length === 1 ? 'document' : 'documenten'}
            {selectedTypeId !== null && <span className="ml-1 text-cyan-500">— {docTypes.find(ty => ty.id === selectedTypeId)?.name}</span>}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {view === 'list' ? (
          <div className="h-full overflow-y-auto px-4 pb-4"><DocList items={filtered} /></div>
        ) : (
          <TreeView />
        )}
      </div>
    </div>
  );
}
