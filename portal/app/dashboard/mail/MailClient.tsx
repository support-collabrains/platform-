// portal/app/dashboard/mail/MailClient.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import { useT } from '../LangContext';

interface FolderStat { name: string; unread: number }
interface MailMessage {
  uid: number; from: string; subject: string; date: string;
  seen: boolean; hasAttachment: boolean;
}
interface MailDetail {
  uid: number; from: string; to: string; cc: string; subject: string;
  date: string; seen: boolean; bodyHtml: string; bodyText: string;
}

const DEFAULT_FOLDERS = ['INBOX', 'Sent', 'Drafts', 'Trash'];
const PAGE_SIZE = 25;

function fmt(date: string) {
  if (!date) return '';
  const d = new Date(date);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
}

export default function MailClient() {
  const t = useT();
  const [folder, setFolder] = useState('INBOX');
  const [folderStats, setFolderStats] = useState<FolderStat[]>([]);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MailDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch('/api/me/mail/stats');
      if (r.ok) {
        const { folders } = await r.json() as { unread: number; folders: FolderStat[] };
        setFolderStats(folders);
      }
    } catch { /* silent */ }
  }, []);

  const fetchMessages = useCallback(async (f: string, p: number) => {
    setLoadingList(true);
    setError('');
    try {
      const r = await fetch(
        `/api/me/mail/messages?folder=${encodeURIComponent(f)}&page=${p}&limit=${PAGE_SIZE}`
      );
      if (!r.ok) { setError(t.mailLoadError); return; }
      const { messages: msgs, total: tot } = await r.json() as {
        messages: MailMessage[]; total: number;
      };
      setMessages(msgs);
      setTotal(tot);
    } catch {
      setError(t.mailConnectionError);
    } finally {
      setLoadingList(false);
    }
  }, [t]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchMessages(folder, page); }, [folder, page, fetchMessages]);

  const openMessage = async (msg: MailMessage) => {
    setLoadingDetail(true);
    try {
      const r = await fetch(
        `/api/me/mail/messages/${msg.uid}?folder=${encodeURIComponent(folder)}`
      );
      if (!r.ok) return;
      const detail = await r.json() as MailDetail;
      setSelected(detail);
      if (!msg.seen) {
        await fetch(
          `/api/me/mail/messages/${msg.uid}/seen?folder=${encodeURIComponent(folder)}`,
          { method: 'POST' }
        );
        setMessages(prev => prev.map(m => m.uid === msg.uid ? { ...m, seen: true } : m));
        fetchStats();
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const deleteMessage = async (uid: number) => {
    await fetch(
      `/api/me/mail/messages/${uid}?folder=${encodeURIComponent(folder)}`,
      { method: 'DELETE' }
    );
    setSelected(null);
    fetchMessages(folder, page);
    fetchStats();
  };

  useEffect(() => {
    if (!iframeRef.current || !selected?.bodyHtml) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(
      `<!DOCTYPE html><html><head><style>
        body{font-family:system-ui,sans-serif;font-size:14px;color:#e2e8f0;background:#0f172a;
             padding:16px;margin:0;word-break:break-word;}
        a{color:#60a5fa;}img{max-width:100%;}
      </style></head><body>${selected.bodyHtml}</body></html>`
    );
    doc.close();
  }, [selected?.bodyHtml]);

  const allFolders = [...new Set([...DEFAULT_FOLDERS, ...folderStats.map(f => f.name)])];
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col h-full">
      {/* ── Folder chip row ──────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 overflow-x-auto border-b border-slate-800 bg-slate-900 scrollbar-none">
        <button
          onClick={() => { fetchStats(); fetchMessages(folder, page); }}
          className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-slate-800 transition"
        >
          <RefreshCw size={14} className={loadingList ? 'animate-spin' : ''} />
        </button>
        {allFolders.map(f => {
          const stat = folderStats.find(s => s.name === f);
          const active = folder === f;
          return (
            <button
              key={f}
              onClick={() => { setFolder(f); setPage(1); setSelected(null); }}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
                active
                  ? 'bg-cyan-500 text-slate-900'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {f}
              {stat && stat.unread > 0 && (
                <span className={`rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold ${
                  active ? 'bg-slate-900 text-cyan-400' : 'bg-blue-500 text-white'
                }`}>
                  {stat.unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Error banner ─────────────────────────────── */}
      {error && (
        <div className="shrink-0 px-4 py-2 bg-red-900/30 text-red-400 text-sm border-b border-red-900/40">
          {error}
        </div>
      )}

      {/* ── Body: list + detail ──────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Message list — hidden on mobile when a message is open or loading */}
        <div className={`flex flex-col overflow-hidden bg-slate-900 border-r border-slate-800
          ${(selected || loadingDetail) ? 'hidden md:flex md:w-72 md:flex-none' : 'w-full md:w-72 md:flex-none'}
        `}>
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="px-4 py-3.5 border-b border-slate-800/60 animate-pulse">
                    <div className="h-2.5 bg-slate-700 rounded w-2/3 mb-2" />
                    <div className="h-2.5 bg-slate-700/50 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-slate-600 text-sm">
                {t.mailNoMessages}
              </div>
            ) : (
              messages.map(msg => (
                <button
                  key={msg.uid}
                  onClick={() => openMessage(msg)}
                  className={`w-full text-left px-4 py-3.5 border-b border-slate-800/60 hover:bg-slate-800/60 transition ${
                    selected?.uid === msg.uid
                      ? 'bg-slate-800 border-l-2 border-l-cyan-500'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-sm truncate ${msg.seen ? 'text-slate-500' : 'text-slate-100 font-semibold'}`}>
                      {msg.from || t.mailUnknown}
                    </span>
                    <span className="text-[11px] text-slate-600 shrink-0">{fmt(msg.date)}</span>
                  </div>
                  <p className={`text-sm truncate mt-0.5 ${msg.seen ? 'text-slate-600' : 'text-slate-400'}`}>
                    {msg.subject || t.mailNoSubject}
                  </p>
                </button>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="shrink-0 flex items-center justify-center gap-6 py-2.5 border-t border-slate-800">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="text-slate-400 hover:text-slate-200 disabled:opacity-30 p-1 transition"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-slate-500">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="text-slate-400 hover:text-slate-200 disabled:opacity-30 p-1 transition"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Detail panel — full-screen on mobile, right column on md+ */}
        {loadingDetail ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            {t.mailLoading}
          </div>
        ) : selected ? (
          <div className="flex flex-col flex-1 min-w-0 bg-slate-900 overflow-hidden">
            {/* Detail header */}
            <div className="shrink-0 px-4 py-3 bg-slate-800/60 border-b border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                {/* Back button — mobile only */}
                <button
                  onClick={() => setSelected(null)}
                  className="md:hidden p-1 text-slate-400 hover:text-slate-100 transition shrink-0"
                >
                  <ArrowLeft size={18} />
                </button>
                <h2 className="flex-1 text-sm font-semibold text-slate-100 truncate">
                  {selected.subject || t.mailNoSubject}
                </h2>
                <button
                  onClick={() => deleteMessage(selected.uid)}
                  className="p-1 text-slate-500 hover:text-red-400 transition shrink-0"
                  title={folder === 'Trash' ? t.mailDeleteForever : t.mailMoveToTrash}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="text-xs text-slate-500 space-y-0.5 ml-7 md:ml-0">
                <div><span className="text-slate-600">{t.mailFrom}</span> {selected.from}</div>
                <div><span className="text-slate-600">{t.mailTo}</span> {selected.to}</div>
                {selected.cc && <div><span className="text-slate-600">{t.mailCc}</span> {selected.cc}</div>}
                <div>{new Date(selected.date).toLocaleString('nl-NL')}</div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden">
              {selected.bodyHtml ? (
                <iframe
                  ref={iframeRef}
                  sandbox="allow-same-origin"
                  className="w-full h-full border-0"
                  title="Berichtinhoud"
                />
              ) : (
                <pre className="p-4 text-sm text-slate-300 whitespace-pre-wrap font-sans overflow-auto h-full">
                  {selected.bodyText || t.mailNoContent}
                </pre>
              )}
            </div>
          </div>
        ) : (
          /* Empty state — desktop only */
          <div className="hidden md:flex flex-1 items-center justify-center text-slate-600 text-sm">
            {t.mailSelectMessage}
          </div>
        )}
      </div>
    </div>
  );
}
