'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Inbox, RefreshCw, Trash2, X } from 'lucide-react';
import Link from 'next/link';

interface FolderStat { name: string; unread: number }
interface MailMessage { uid: number; from: string; subject: string; date: string; seen: boolean; hasAttachment: boolean }
interface MailDetail { uid: number; from: string; to: string; cc: string; subject: string; date: string; seen: boolean; bodyHtml: string; bodyText: string }

const FOLDERS = ['INBOX', 'Sent', 'Drafts', 'Trash'];
const PAGE_SIZE = 25;

function fmt(date: string) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
}

export default function MailClient() {
  const [folder, setFolder] = useState('INBOX');
  const [folders, setFolders] = useState<FolderStat[]>([]);
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
        const { folders: fl } = await r.json() as { unread: number; folders: FolderStat[] };
        setFolders(fl);
      }
    } catch { /* silent */ }
  }, []);

  const fetchMessages = useCallback(async (f: string, p: number) => {
    setLoadingList(true);
    setError('');
    setSelected(null);
    try {
      const r = await fetch(`/api/me/mail/messages?folder=${encodeURIComponent(f)}&page=${p}&limit=${PAGE_SIZE}`);
      if (!r.ok) { setError('Kon berichten niet laden'); return; }
      const { messages: msgs, total: tot } = await r.json() as { messages: MailMessage[]; total: number };
      setMessages(msgs);
      setTotal(tot);
    } catch {
      setError('Verbindingsfout');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchMessages(folder, page);
  }, [folder, page, fetchStats, fetchMessages]);

  const openMessage = async (msg: MailMessage) => {
    setLoadingDetail(true);
    try {
      const r = await fetch(`/api/me/mail/messages/${msg.uid}?folder=${encodeURIComponent(folder)}`);
      if (!r.ok) return;
      const detail = await r.json() as MailDetail;
      setSelected(detail);
      if (!msg.seen) {
        await fetch(`/api/me/mail/messages/${msg.uid}/seen?folder=${encodeURIComponent(folder)}`, { method: 'POST' });
        setMessages(prev => prev.map(m => m.uid === msg.uid ? { ...m, seen: true } : m));
        fetchStats();
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const deleteMessage = async (uid: number) => {
    await fetch(`/api/me/mail/messages/${uid}?folder=${encodeURIComponent(folder)}`, { method: 'DELETE' });
    setSelected(null);
    fetchMessages(folder, page);
    fetchStats();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Inject sanitized HTML into sandboxed iframe
  useEffect(() => {
    if (!iframeRef.current || !selected?.bodyHtml) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>
      body { font-family: system-ui, sans-serif; font-size: 14px; color: #e2e8f0; background: #0f172a; padding: 16px; margin: 0; word-break: break-word; }
      a { color: #60a5fa; } img { max-width: 100%; }
    </style></head><body>${selected.bodyHtml}</body></html>`);
    doc.close();
  }, [selected?.bodyHtml]);

  const allFolders = (() => {
    const names = new Set([...FOLDERS, ...folders.map(f => f.name)]);
    return [...names];
  })();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center gap-3">
        <Link href="/dashboard" className="text-slate-400 hover:text-slate-100 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <Inbox size={20} className="text-blue-400" />
        <h1 className="font-semibold text-slate-100">E-mailclient</h1>
        <button
          onClick={() => fetchMessages(folder, page)}
          className="ml-auto text-slate-400 hover:text-blue-400 transition-colors"
          title="Vernieuwen"
        >
          <RefreshCw size={16} className={loadingList ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-44 bg-slate-800 border-r border-slate-700 flex flex-col py-2 shrink-0">
          {allFolders.map(f => {
            const stat = folders.find(s => s.name === f);
            return (
              <button
                key={f}
                onClick={() => { setFolder(f); setPage(1); }}
                className={`text-left px-4 py-2 text-sm flex justify-between items-center transition-colors ${
                  folder === f ? 'bg-blue-600/20 text-blue-300 font-medium' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span className="truncate">{f}</span>
                {stat && stat.unread > 0 && (
                  <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 ml-1">{stat.unread}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Message list */}
        <div className="w-80 border-r border-slate-700 flex flex-col bg-slate-900 shrink-0">
          {error && (
            <div className="p-3 text-sm text-red-400 bg-red-900/20 border-b border-slate-700">{error}</div>
          )}

          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="flex items-center justify-center py-12 text-slate-500 text-sm">Laden...</div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-slate-500 text-sm">Geen berichten</div>
            ) : (
              messages.map(msg => (
                <button
                  key={msg.uid}
                  onClick={() => openMessage(msg)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-800 hover:bg-slate-800/60 transition-colors ${
                    selected?.uid === msg.uid ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <div className={`text-sm truncate ${msg.seen ? 'text-slate-400' : 'text-slate-100 font-semibold'}`}>
                    {msg.from || '(onbekend)'}
                  </div>
                  <div className={`text-sm truncate mt-0.5 ${msg.seen ? 'text-slate-500' : 'text-slate-300'}`}>
                    {msg.subject || '(geen onderwerp)'}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">{fmt(msg.date)}</div>
                </button>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-700 text-xs text-slate-400">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="disabled:opacity-30 hover:text-slate-200 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span>{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="disabled:opacity-30 hover:text-slate-200 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Message detail */}
        <div className="flex-1 flex flex-col bg-slate-900 min-w-0">
          {loadingDetail ? (
            <div className="flex items-center justify-center flex-1 text-slate-500 text-sm">Laden...</div>
          ) : !selected ? (
            <div className="flex items-center justify-center flex-1 text-slate-500 text-sm">
              Selecteer een bericht
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div className="px-5 py-4 border-b border-slate-700 bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-slate-100 text-base leading-tight truncate">
                      {selected.subject || '(geen onderwerp)'}
                    </h2>
                    <div className="mt-2 space-y-1 text-sm text-slate-400">
                      <div><span className="text-slate-500">Van:</span> {selected.from}</div>
                      <div><span className="text-slate-500">Aan:</span> {selected.to}</div>
                      {selected.cc && (
                        <div><span className="text-slate-500">CC:</span> {selected.cc}</div>
                      )}
                      <div className="text-xs text-slate-500">{new Date(selected.date).toLocaleString('nl-NL')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => deleteMessage(selected.uid)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1"
                      title={folder === 'Trash' ? 'Definitief verwijderen' : 'Naar prullenbak'}
                    >
                      <Trash2 size={16} />
                    </button>
                    <button
                      onClick={() => setSelected(null)}
                      className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                    >
                      <X size={16} />
                    </button>
                  </div>
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
                  <pre className="p-5 text-sm text-slate-300 whitespace-pre-wrap font-sans overflow-auto h-full">
                    {selected.bodyText || '(geen inhoud)'}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
