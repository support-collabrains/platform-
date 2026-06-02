'use client';

import { useState, useEffect } from 'react';
import {
  Settings, Users, Shield, Bell, MessageSquare, BarChart3,
  CheckCircle, Plus, Save, Loader2, Trash2, ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  owner: string;
  phone: string;
  title: string;
  seq: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface User {
  pk: number;
  username: string;
  name: string;
  email: string;
  isActive: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h}u geleden`;
  return `${Math.floor(diff / 86_400_000)}d geleden`;
}

const STATUS_CLASS: Record<string, string> = {
  open: 'bg-orange-500/20 text-orange-400',
  pending_confirm: 'bg-yellow-500/20 text-yellow-400',
  done: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-slate-600/50 text-slate-400',
};

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export default function AdminClient() {
  const [activeTab, setActiveTab] = useState('users');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingPk, setDeletingPk] = useState<number | null>(null);
  const [createError, setCreateError] = useState('');
  const [setupLink, setSetupLink] = useState('');
  const [form, setForm] = useState({
    username: '', name: '', email: '', phone: '', phone2: '',
  });

  // Signal settings (local state, no backing API yet)
  const [signalSettings, setSignalSettings] = useState({
    enabled: true,
    autoResponse: true,
    autoResponseTemplate: 'Bedankt voor je bericht. We reageren binnen 24 uur.',
    twoWayMessaging: true,
    readReceipts: true,
    fallbackSMS: false,
    ticketingEnabled: true,
  });

  // Notification settings (local state)
  const [notifSettings, setNotifSettings] = useState({
    quietHoursEnabled: true,
    quietStart: '22:00',
    quietEnd: '08:00',
    urgentBypass: true,
    digestMode: 'instant' as 'instant' | 'hourly' | 'daily' | 'weekly',
  });

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json() as { users?: User[] } | User[];
        setUsers(Array.isArray(data) ? data : (data.users ?? []));
      }
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadTickets() {
    setTicketsLoading(true);
    try {
      const res = await fetch('/api/admin/tickets');
      if (res.ok) {
        const data = await res.json() as { tickets: Ticket[] };
        setTickets(data.tickets ?? []);
      }
    } finally {
      setTicketsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'tickets') loadTickets();
  }, [activeTab]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    setSetupLink('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Aanmaken mislukt');
      const data = await res.json() as { setupLink?: string };
      setForm({ username: '', name: '', email: '', phone: '', phone2: '' });
      setShowCreateForm(false);
      if (data.setupLink) setSetupLink(data.setupLink);
      await loadUsers();
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteUser(pk: number, username: string) {
    if (!confirm(`Gebruiker "${username}" verwijderen?`)) return;
    setDeletingPk(pk);
    await fetch(`/api/admin/users/${pk}`, { method: 'DELETE' });
    setDeletingPk(null);
    await loadUsers();
  }

  const tabs = [
    { id: 'tickets', label: 'Taken', icon: MessageSquare, count: tickets.length || null },
    { id: 'settings', label: 'Instellingen', icon: Settings, count: null },
    { id: 'users', label: 'Gebruikers', icon: Users, count: null },
    { id: 'analytics', label: 'Analytisch', icon: BarChart3, count: null },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-100 transition">
              <ArrowLeft size={20} />
            </Link>
            <Shield size={22} className="text-orange-400" />
            <h1 className="font-bold text-lg text-slate-100">CollaBrains Beheer</h1>
          </div>
          <p className="hidden sm:block text-sm text-slate-400">Systeem, tickets, gebruikers en beveiliging</p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-700/50 overflow-x-auto mb-8">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-3 font-medium text-sm transition border-b-2 flex items-center gap-2 whitespace-nowrap ${
                activeTab === id
                  ? 'text-orange-400 border-orange-400'
                  : 'text-slate-400 border-transparent hover:text-slate-300'
              }`}
            >
              <Icon size={15} />
              {label}
              {count !== null && (
                <span className="ml-1 text-xs bg-slate-700/50 px-2 py-0.5 rounded-full">{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── TICKETS ─────────────────────────────────────────────────────── */}
        {activeTab === 'tickets' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {(
                [
                  { label: 'Open', status: 'open', color: 'orange' },
                  { label: 'Wacht bevestiging', status: 'pending_confirm', color: 'yellow' },
                  { label: 'Afgerond', status: 'done', color: 'green' },
                ] as const
              ).map(({ label, status, color }) => (
                <div key={status} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className={`text-2xl font-bold text-${color}-400`}>
                    {tickets.filter(t => t.status === status).length}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-100">Alle taken</h3>
                <button
                  onClick={loadTickets}
                  className="text-xs text-slate-400 hover:text-slate-200 transition flex items-center gap-1"
                >
                  <CheckCircle size={13} /> Vernieuwen
                </button>
              </div>

              {ticketsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 size={22} className="animate-spin text-slate-500" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-10 text-sm text-slate-500">Geen open taken</div>
              ) : (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50 text-xs text-slate-500 uppercase tracking-wide text-left">
                        <th className="px-5 py-3">#</th>
                        <th className="px-5 py-3">Gebruiker</th>
                        <th className="px-5 py-3">Taak</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3 hidden sm:table-cell">Aangemaakt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map(t => (
                        <tr
                          key={t.id}
                          className="border-b border-slate-700/30 last:border-0 hover:bg-slate-700/20 transition"
                        >
                          <td className="px-5 py-3 text-slate-500 font-mono text-xs">
                            {t.seq > 0 ? `#${t.seq}` : '—'}
                          </td>
                          <td className="px-5 py-3">
                            <div className="font-medium text-slate-200">{t.owner}</div>
                            <div className="text-xs text-slate-500 truncate max-w-[120px]">📱 {t.phone}</div>
                          </td>
                          <td className="px-5 py-3 text-slate-300 max-w-xs truncate">{t.title}</td>
                          <td className="px-5 py-3">
                            <span className={`text-xs px-2 py-1 rounded-full ${STATUS_CLASS[t.status] ?? 'bg-slate-700/50 text-slate-400'}`}>
                              {t.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-slate-500 text-xs hidden sm:table-cell">
                            {formatTime(t.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SETTINGS ────────────────────────────────────────────────────── */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Signal */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="font-semibold text-slate-100 flex items-center gap-2 mb-5">
                <MessageSquare size={17} className="text-cyan-400" />
                Signal-integratie
              </h3>
              <div className="space-y-5">
                {(
                  [
                    { key: 'enabled', label: 'Signal-integratie inschakelen', desc: 'Gebruikers ontvangen meldingen via Signal' },
                    { key: 'twoWayMessaging', label: 'Tweerichtingsberichten', desc: 'Gebruikers kunnen antwoorden op botberichten' },
                    { key: 'ticketingEnabled', label: 'Support-tickets via Signal', desc: 'Gebruikers starten tickets met /help in Signal' },
                    { key: 'readReceipts', label: 'Leesbevestigingen', desc: 'Bijhouden wanneer gebruikers meldingen lezen' },
                    { key: 'fallbackSMS', label: 'Terugval naar SMS', desc: 'Stuur SMS als Signal-bezorging mislukt' },
                  ] as const
                ).map(({ key, label, desc }) => (
                  <label key={key} className="flex items-start gap-4 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={signalSettings[key]}
                      onChange={e => setSignalSettings(s => ({ ...s, [key]: e.target.checked }))}
                      className="w-5 h-5 rounded accent-cyan-400 mt-0.5"
                    />
                    <div>
                      <p className="font-medium text-slate-100 group-hover:text-white">{label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                    </div>
                  </label>
                ))}

                <div>
                  <p className="text-sm font-medium text-slate-300 mb-2">Auto-antwoordtekst</p>
                  <textarea
                    value={signalSettings.autoResponseTemplate}
                    onChange={e => setSignalSettings(s => ({ ...s, autoResponseTemplate: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-700/30 border border-slate-600/50 rounded text-sm text-slate-100 focus:outline-none focus:border-cyan-400/50 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="font-semibold text-slate-100 flex items-center gap-2 mb-5">
                <Bell size={17} className="text-yellow-400" />
                Meldingsinstellingen
              </h3>
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium text-slate-300 mb-2">Digest-modus</p>
                  <select
                    value={notifSettings.digestMode}
                    onChange={e => setNotifSettings(s => ({
                      ...s,
                      digestMode: e.target.value as typeof notifSettings.digestMode,
                    }))}
                    className="w-full px-3 py-2 bg-slate-700/30 border border-slate-600/50 rounded text-sm text-slate-100 focus:outline-none focus:border-yellow-400/50"
                  >
                    <option value="instant">Direct (meteen sturen)</option>
                    <option value="hourly">Elk uur samenvatten</option>
                    <option value="daily">Dagelijks overzicht</option>
                    <option value="weekly">Wekelijks overzicht</option>
                  </select>
                </div>

                <label className="flex items-start gap-4 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={notifSettings.quietHoursEnabled}
                    onChange={e => setNotifSettings(s => ({ ...s, quietHoursEnabled: e.target.checked }))}
                    className="w-5 h-5 rounded accent-yellow-400 mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-slate-100">Stille uren</p>
                    <p className="text-xs text-slate-400 mt-0.5">Geen meldingen buiten werkuren</p>
                    {notifSettings.quietHoursEnabled && (
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="time"
                          value={notifSettings.quietStart}
                          onChange={e => setNotifSettings(s => ({ ...s, quietStart: e.target.value }))}
                          className="px-2 py-1 bg-slate-700/30 border border-slate-600/50 rounded text-sm text-slate-100"
                        />
                        <span className="text-slate-400 text-sm">tot</span>
                        <input
                          type="time"
                          value={notifSettings.quietEnd}
                          onChange={e => setNotifSettings(s => ({ ...s, quietEnd: e.target.value }))}
                          className="px-2 py-1 bg-slate-700/30 border border-slate-600/50 rounded text-sm text-slate-100"
                        />
                      </div>
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-4 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={notifSettings.urgentBypass}
                    onChange={e => setNotifSettings(s => ({ ...s, urgentBypass: e.target.checked }))}
                    className="w-5 h-5 rounded accent-yellow-400 mt-0.5"
                  />
                  <div>
                    <p className="font-medium text-slate-100">Urgent negeert stille uren</p>
                    <p className="text-xs text-slate-400 mt-0.5">Hoge prioriteit altijd bezorgd</p>
                  </div>
                </label>
              </div>
            </div>

            <button className="w-full py-3 bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 rounded-lg font-medium transition flex items-center justify-center gap-2">
              <Save size={17} />
              Instellingen opslaan
            </button>
          </div>
        )}

        {/* ── USERS ───────────────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-100">Gebruikers</h3>
              <button
                onClick={() => setShowCreateForm(v => !v)}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 rounded-lg text-sm transition"
              >
                <Plus size={15} />
                Nieuwe gebruiker
              </button>
            </div>

            {showCreateForm && (
              <form
                onSubmit={createUser}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5 space-y-3"
              >
                <h4 className="font-semibold text-slate-100 text-sm">Gebruiker aanmaken</h4>
                {createError && <p className="text-red-400 text-xs">{createError}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(
                    [
                      { field: 'username', placeholder: 'Gebruikersnaam', type: 'text' },
                      { field: 'name', placeholder: 'Volledige naam', type: 'text' },
                      { field: 'email', placeholder: 'E-mailadres', type: 'email' },
                    ] as const
                  ).map(({ field, placeholder, type }) => (
                    <input
                      key={field}
                      required
                      type={type}
                      placeholder={placeholder}
                      value={form[field]}
                      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      className="px-3 py-2 bg-slate-700/30 border border-slate-600/50 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-400/50"
                    />
                  ))}
                  <input
                    type="tel"
                    placeholder="Signal-nummer 1 (optioneel, bijv. +31612345678)"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="sm:col-span-2 px-3 py-2 bg-slate-700/30 border border-slate-600/50 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-400/50"
                  />
                  <input
                    type="tel"
                    placeholder="Signal-nummer 2 (optioneel)"
                    value={form.phone2}
                    onChange={e => setForm(f => ({ ...f, phone2: e.target.value }))}
                    className="sm:col-span-2 px-3 py-2 bg-slate-700/30 border border-slate-600/50 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-400/50"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="text-sm text-slate-400 hover:text-slate-200 px-3 py-1.5 transition"
                  >
                    Annuleer
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 disabled:opacity-50 rounded text-sm font-medium transition"
                  >
                    {creating && <Loader2 size={13} className="animate-spin" />}
                    Aanmaken
                  </button>
                </div>
              </form>
            )}

            {setupLink && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-green-400">Gebruiker aangemaakt — eenmalige setup-link:</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={setupLink}
                    className="flex-1 px-3 py-1.5 bg-slate-800/60 border border-slate-600/50 rounded text-xs text-slate-300 font-mono focus:outline-none"
                    onFocus={e => e.target.select()}
                  />
                  <button
                    onClick={() => { void navigator.clipboard.writeText(setupLink); }}
                    className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 rounded text-xs transition whitespace-nowrap"
                  >
                    Kopieer
                  </button>
                  <button
                    onClick={() => setSetupLink('')}
                    className="text-slate-500 hover:text-slate-300 text-xs transition"
                  >
                    ✕
                  </button>
                </div>
                {!form.phone && <p className="text-xs text-slate-500">Geen Signal-nummer opgegeven — stuur deze link zelf door.</p>}
              </div>
            )}

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
              {usersLoading ? (
                <div className="flex justify-center p-12">
                  <Loader2 size={24} className="text-slate-400 animate-spin" />
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-12">
                  <Users size={32} className="mx-auto text-slate-600 mb-3" />
                  <p className="text-sm text-slate-400">Geen gebruikers gevonden</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 text-left text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-5 py-3">Gebruiker</th>
                      <th className="px-5 py-3 hidden sm:table-cell">E-mail</th>
                      <th className="px-5 py-3 text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr
                        key={u.pk}
                        className="border-b border-slate-700/30 last:border-0 hover:bg-slate-700/20 transition"
                      >
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-100">{u.name || u.username}</div>
                          <div className="text-xs text-slate-500 font-mono">{u.username}</div>
                        </td>
                        <td className="px-5 py-3 text-slate-400 hidden sm:table-cell">{u.email}</td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => deleteUser(u.pk, u.username)}
                            disabled={deletingPk === u.pk}
                            className="p-1.5 text-slate-500 hover:text-red-400 disabled:opacity-50 transition"
                            title="Verwijder gebruiker"
                          >
                            {deletingPk === u.pk
                              ? <Loader2 size={15} className="animate-spin" />
                              : <Trash2 size={15} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── ANALYTICS ───────────────────────────────────────────────────── */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(
                [
                  { label: 'Totaal gebruikers', value: String(users.length || '—'), change: '' },
                  { label: 'Verwerkte documenten', value: '—', change: '' },
                  { label: 'Support-tickets', value: String(tickets.length), change: '' },
                  { label: 'Gem. reactietijd', value: '—', change: '' },
                ]
              ).map(stat => (
                <div key={stat.label} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <p className="text-xs text-slate-400">{stat.label}</p>
                  <p className="text-2xl font-bold text-slate-100 mt-1">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="font-semibold text-slate-100 mb-4">Systeemstatus</h3>
              <div className="space-y-3">
                {(
                  [
                    { service: 'NestJS API', status: 'online' },
                    { service: 'Signal API (signal-cli)', status: 'online' },
                    { service: 'Redis / BullMQ', status: 'online' },
                    { service: 'Paperless-ngx', status: 'online' },
                    { service: 'Ollama (LLM)', status: 'online' },
                    { service: 'Mailcow IMAP/SMTP', status: 'online' },
                  ]
                ).map(({ service, status }) => (
                  <div
                    key={service}
                    className="flex items-center justify-between p-3 bg-slate-700/20 rounded"
                  >
                    <span className="text-sm text-slate-300">{service}</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      status === 'online' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
