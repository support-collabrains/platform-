'use client';

import { useState, useEffect } from 'react';
import {
  Bell, FileText, Mail, Settings, Clock, MessageSquare, Eye, Download,
  Shield, ChevronDown,
} from 'lucide-react';
import Link from 'next/link';

interface Notification {
  id: string;
  documentTitle: string;
  status: string;
  createdAt: string;
}

interface Document {
  id: number;
  title: string;
  created: string;
}

interface Preferences {
  signal_doc_notify: boolean;
  signal_digest_mode: boolean;
  language: 'nl' | 'de' | 'en';
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Wacht op verwerking',
  processing: 'Bezig...',
  done: 'Samenvatting verzonden',
  failed: 'Mislukt',
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return 'zojuist';
  if (m < 60) return `${m}m geleden`;
  if (h < 24) return `${h}u geleden`;
  if (d < 7) return `${d}d geleden`;
  return date.toLocaleDateString('nl-NL');
}

export default function DashboardClient({ username, isAdmin = false }: { username: string; isAdmin?: boolean }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [prefs, setPrefs] = useState<Preferences>({
    signal_doc_notify: true,
    signal_digest_mode: false,
    language: 'nl',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/me/notifications').then(r => r.ok ? r.json() : { notifications: [] }),
      fetch('/api/me/documents').then(r => r.ok ? r.json() : { docs: [] }),
      fetch('/api/me/preferences').then(r => r.ok ? r.json() : null),
    ]).then(([notifData, docsData, prefsData]) => {
      setNotifications(notifData.notifications ?? []);
      setDocuments(docsData.docs ?? []);
      if (prefsData) setPrefs(prefsData as Preferences);
    }).finally(() => setLoading(false));
  }, []);

  async function updatePref(key: keyof Preferences, value: boolean | string) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await fetch('/api/me/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
  }

  const unreadCount = notifications.filter(n => n.status !== 'done').length;

  const tabs = [
    { id: 'overview', label: 'Notificaties', icon: Bell },
    { id: 'documents', label: 'Documenten', icon: FileText },
    { id: 'email', label: 'E-mail', icon: Mail },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center font-bold text-slate-900 select-none">
              {username.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-100">CollaBrains</h1>
              <p className="text-xs text-slate-400">
              Welkom, {username}
              {isAdmin && <span className="ml-2 text-orange-400 font-medium">admin</span>}
            </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-300">
              <Bell size={16} className="text-cyan-400" />
              <span>{unreadCount} ongelezen</span>
            </div>
            <Link
              href="/admin"
              className="p-2 hover:bg-slate-700/50 rounded-lg transition text-slate-400 hover:text-slate-100"
              title="Beheer"
            >
              <Settings size={20} />
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600/50 transition">
                <div className="text-2xl font-bold text-cyan-400">{documents.length}</div>
                <div className="text-xs text-slate-400 mt-1">Documenten</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600/50 transition">
                <div className="text-2xl font-bold text-orange-400">{unreadCount}</div>
                <div className="text-xs text-slate-400 mt-1">Ongelezen</div>
              </div>
              <Link
                href="/dashboard/mail"
                className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-blue-500/40 transition block"
              >
                <div className="text-2xl font-bold text-blue-400">→</div>
                <div className="text-xs text-slate-400 mt-1">E-mail</div>
              </Link>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600/50 transition">
                <div className="text-2xl font-bold text-green-400">{notifications.length}</div>
                <div className="text-xs text-slate-400 mt-1">Totaal log</div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-700/50 overflow-x-auto">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`px-4 py-3 font-medium text-sm transition border-b-2 flex items-center gap-2 whitespace-nowrap ${
                    activeTab === id
                      ? 'text-cyan-400 border-cyan-400'
                      : 'text-slate-400 border-transparent hover:text-slate-300'
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>

            {/* Notifications tab */}
            {activeTab === 'overview' && (
              <div className="space-y-3">
                {loading ? (
                  [1, 2, 3].map(i => (
                    <div key={i} className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-4 animate-pulse">
                      <div className="h-3 bg-slate-700 rounded w-2/3 mb-2" />
                      <div className="h-3 bg-slate-700/50 rounded w-1/2" />
                    </div>
                  ))
                ) : notifications.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Bell size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nog geen notificaties</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4 hover:border-slate-600/50 transition"
                    >
                      <div className="flex items-start gap-3">
                        <MessageSquare size={18} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-100 text-sm truncate">{n.documentTitle}</h3>
                          <p className="text-slate-400 text-sm mt-1">{STATUS_LABEL[n.status] ?? n.status}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Clock size={11} className="text-slate-500" />
                            <span className="text-xs text-slate-500">{formatTime(n.createdAt)}</span>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full border flex-shrink-0 ${
                          n.status === 'done'
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : n.status === 'failed'
                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                            : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                        }`}>
                          {n.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Documents tab */}
            {activeTab === 'documents' && (
              <div className="space-y-3">
                {loading ? (
                  [1, 2, 3].map(i => (
                    <div key={i} className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-4 animate-pulse">
                      <div className="h-3 bg-slate-700 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-slate-700/50 rounded w-1/4" />
                    </div>
                  ))
                ) : documents.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <FileText size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Geen documenten gevonden</p>
                  </div>
                ) : (
                  documents.map(doc => (
                    <div
                      key={doc.id}
                      className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 hover:border-slate-600/50 transition group"
                    >
                      <div className="flex items-center gap-3">
                        <FileText size={18} className="text-slate-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-slate-100 text-sm truncate">{doc.title}</h4>
                          <p className="text-xs text-slate-500 mt-1">
                            {new Date(doc.created).toLocaleDateString('nl-NL', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            className="p-2 hover:bg-slate-700 rounded transition"
                            title="Bekijken"
                          >
                            <Eye size={15} className="text-slate-400" />
                          </button>
                          <button
                            className="p-2 hover:bg-slate-700 rounded transition"
                            title="Downloaden"
                          >
                            <Download size={15} className="text-slate-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Email tab — links to mail client */}
            {activeTab === 'email' && (
              <div className="text-center py-16 space-y-4">
                <Mail size={48} className="mx-auto text-blue-400 opacity-60" />
                <div>
                  <h3 className="font-semibold text-slate-100 text-lg">E-mailclient</h3>
                  <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">
                    Lees en verstuur e-mails van je @cbrains.de mailbox via de volledige inbox.
                  </p>
                </div>
                <Link
                  href="/dashboard/mail"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 rounded-lg transition font-medium"
                >
                  <Mail size={18} />
                  Open e-mailclient
                </Link>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Activity summary */}
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-slate-100">Overzicht</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Signal-meldingen</span>
                  <span className="font-medium text-cyan-400">{notifications.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Ongelezen</span>
                  <span className="font-medium text-orange-400">{unreadCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Documenten</span>
                  <span className="font-medium text-blue-400">{documents.length}</span>
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                <Bell size={15} />
                Meldingsvoorkeuren
              </h3>
              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={prefs.signal_doc_notify}
                    onChange={e => updatePref('signal_doc_notify', e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded accent-cyan-400"
                  />
                  <div>
                    <p className="text-sm text-slate-300 group-hover:text-slate-100 leading-snug">
                      Signal bij nieuw document
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Direct melden via Signal</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={prefs.signal_digest_mode}
                    onChange={e => updatePref('signal_digest_mode', e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded accent-cyan-400"
                  />
                  <div>
                    <p className="text-sm text-slate-300 group-hover:text-slate-100 leading-snug">
                      Digest-modus
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Dagelijks overzicht i.p.v. direct</p>
                  </div>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-700/50">
                <p className="text-xs text-slate-400 mb-2">Taal</p>
                <select
                  value={prefs.language}
                  onChange={e => updatePref('language', e.target.value as Preferences['language'])}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded text-sm text-slate-100 focus:outline-none focus:border-cyan-400/50"
                >
                  <option value="nl">Nederlands</option>
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            {/* Quick links */}
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6 space-y-3">
              <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                <Shield size={15} />
                Snelkoppelingen
              </h3>
              <Link
                href="/dashboard/mail"
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-blue-400 transition py-1"
              >
                <Mail size={15} />
                E-mailclient
              </Link>
              <Link
                href="/admin"
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-orange-400 transition py-1"
              >
                <Settings size={15} />
                Beheerdersinstellingen
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
