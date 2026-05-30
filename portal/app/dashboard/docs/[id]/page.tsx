'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, AlertCircle } from 'lucide-react';
import { useApiRequest } from '@/hooks/use-api-request';

interface DocMeta {
  id: number;
  title: string;
  created: string;
  correspondent?: { name: string } | null;
  document_type?: { name: string } | null;
  tags?: Array<{ name: string; color?: string }>;
}

export default function DocViewerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { request } = useApiRequest();
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [error, setError] = useState(false);
  const previewUrl = `/api/me/documents/${id}/preview`;

  useEffect(() => {
    request<DocMeta>(`/api/me/documents/${id}`)
      .then(d => setMeta(d))
      .catch(() => setError(true));
  }, [id, request]);

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-800">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-slate-400 hover:text-slate-200 transition p-1"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText size={16} className="text-cyan-400 shrink-0" />
          {error ? (
            <span className="text-sm text-red-400 flex items-center gap-1">
              <AlertCircle size={14} />
              Niet beschikbaar
            </span>
          ) : meta ? (
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-100 truncate">{meta.title}</p>
              <p className="text-xs text-slate-500">
                {new Date(meta.created).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                {meta.correspondent && <span className="ml-2 text-slate-400">{meta.correspondent.name}</span>}
              </p>
            </div>
          ) : (
            <div className="flex-1 space-y-1.5 animate-pulse">
              <div className="h-3 bg-slate-700 rounded w-48" />
              <div className="h-2.5 bg-slate-700/50 rounded w-28" />
            </div>
          )}
        </div>
        {meta?.tags && meta.tags.length > 0 && (
          <div className="shrink-0 flex gap-1">
            {meta.tags.slice(0, 3).map(tag => (
              <span key={tag.name} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 min-h-0 relative">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
            <AlertCircle size={40} className="opacity-30" />
            <p className="text-sm">Document niet beschikbaar</p>
            <button
              onClick={() => router.back()}
              className="text-xs text-cyan-500 hover:text-cyan-400 transition"
            >
              ← Terug
            </button>
          </div>
        ) : (
          <iframe
            src={previewUrl}
            className="w-full h-full border-0"
            title={meta?.title ?? 'Document'}
          />
        )}
      </div>
    </div>
  );
}
