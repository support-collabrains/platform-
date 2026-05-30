'use client';

import { useEffect, useState } from 'react';
import { Users, Plus, Trash2, Loader2, ArrowLeft, ChevronDown, ChevronUp, Phone, Mail, Shield } from 'lucide-react';
import Link from 'next/link';
import Logo from '@/components/Logo';

interface User {
  pk: number;
  username: string;
  name: string;
  email: string;
  isActive: boolean;
  isAdmin?: boolean;
  attributes?: Record<string, string>;
}

interface UserAttributes {
  signalPhone?: string;
  phone?: string;
  phone2?: string;
  defaultArchivePath?: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingPk, setDeletingPk] = useState<number | null>(null);
  const [expandedPk, setExpandedPk] = useState<number | null>(null);
  const [form, setForm] = useState({ username: '', name: '', email: '', password: '', phone: '', phone2: '' });
  const [error, setError] = useState('');

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : data.users ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Aanmaken mislukt');
      setForm({ username: '', name: '', email: '', password: '', phone: '', phone2: '' });
      setShowForm(false);
      await loadUsers();
    } catch (err) {
      setError((err as Error).message);
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

  function toggleExpand(pk: number) {
    setExpandedPk((prev) => (prev === pk ? null : pk));
  }

  function getUserAttrs(user: User): UserAttributes {
    const a = user.attributes ?? {};
    return {
      signalPhone: a.signalPhone || a.phone || undefined,
      phone2: a.phone2 || undefined,
      defaultArchivePath: a.defaultArchivePath || undefined,
    };
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-slate-400 hover:text-slate-600 transition">
            <ArrowLeft size={20} />
          </Link>
          <Logo size="sm" />
          <Users size={20} className="text-blue-600 ml-1" />
          <h1 className="text-xl font-bold text-slate-800">Gebruikers</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="ml-auto flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
          >
            <Plus size={16} />
            Nieuwe gebruiker
          </button>
        </div>

        {showForm && (
          <form onSubmit={createUser} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5 space-y-3">
            <h2 className="font-semibold text-slate-800 text-sm">Gebruiker aanmaken</h2>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              {(['username', 'name', 'email', 'password'] as const).map((field) => (
                <input
                  key={field}
                  required
                  type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                  placeholder={field === 'username' ? 'Gebruikersnaam' : field === 'name' ? 'Volledige naam' : field === 'email' ? 'E-mailadres' : 'Wachtwoord'}
                  value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  className="col-span-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ))}
              <input
                type="tel"
                placeholder="Signal nummer 1 (optioneel, bijv. +31612345678)"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="tel"
                placeholder="Signal nummer 2 (optioneel)"
                value={form.phone2}
                onChange={(e) => setForm((f) => ({ ...f, phone2: e.target.value }))}
                className="col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">Annuleer</button>
              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition"
              >
                {creating && <Loader2 size={14} className="animate-spin" />}
                Aanmaken
              </button>
            </div>
          </form>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center p-12">
              <Loader2 size={24} className="text-slate-400 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-slate-400 text-sm p-12">Geen gebruikers gevonden</p>
          ) : (
            <div>
              {users.map((u) => {
                const expanded = expandedPk === u.pk;
                const attrs = getUserAttrs(u);
                return (
                  <div key={u.pk} className="border-b border-slate-100 last:border-0">
                    {/* Row */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(u.pk)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {(u.name || u.username).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800 text-sm">{u.name || u.username}</span>
                          {u.isAdmin && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                              <Shield size={9} />
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">{u.username}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteUser(u.pk, u.username); }}
                          disabled={deletingPk === u.pk}
                          className="p-1.5 text-slate-300 hover:text-red-500 disabled:opacity-50 transition"
                        >
                          {deletingPk === u.pk
                            ? <Loader2 size={16} className="animate-spin" />
                            : <Trash2 size={16} />}
                        </button>
                        {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {expanded && (
                      <div className="px-4 pb-4 pt-1 bg-slate-50 border-t border-slate-100">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex items-start gap-2 text-slate-600">
                            <Mail size={14} className="text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-slate-400 mb-0.5">E-mail</p>
                              <p>{u.email || '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2 text-slate-600">
                            <Phone size={14} className="text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-slate-400 mb-0.5">Signal</p>
                              <p>{attrs.signalPhone || '—'}</p>
                              {attrs.phone2 && <p className="text-slate-400">{attrs.phone2}</p>}
                            </div>
                          </div>
                          {attrs.defaultArchivePath && (
                            <div className="col-span-2 flex items-start gap-2 text-slate-600">
                              <div className="w-3.5 shrink-0" />
                              <div>
                                <p className="text-xs text-slate-400 mb-0.5">Archief pad</p>
                                <p className="font-mono text-xs">{attrs.defaultArchivePath}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
