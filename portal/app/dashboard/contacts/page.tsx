'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Search, Mail, Phone, Building2, User, X, RefreshCw, AlertCircle } from 'lucide-react';
import { useT } from '../LangContext';
import { useApiRequest } from '@/hooks/use-api-request';

interface Contact {
  uid: string;
  fullName: string;
  email?: string;
  phone?: string;
  organization?: string;
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function avatarColor(name: string) {
  const colors = ['#3b82f6','#06b6d4','#8b5cf6','#ec4899','#f59e0b','#10b981','#ef4444'];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

function ContactCard({ contact, onClick }: { contact: Contact; onClick: () => void }) {
  const color = avatarColor(contact.fullName);
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition rounded-xl"
      style={{ background: 'var(--dc-surf2)', border: '1px solid var(--dc-border)' }}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
        style={{ background: color }}>
        {initials(contact.fullName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{contact.fullName}</p>
        {contact.organization && <p className="text-xs text-slate-500 truncate">{contact.organization}</p>}
        {contact.email && !contact.organization && <p className="text-xs text-slate-500 truncate">{contact.email}</p>}
      </div>
      {contact.email && (
        <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()}
          className="p-1.5 text-slate-600 hover:text-blue-400 transition shrink-0">
          <Mail size={14} />
        </a>
      )}
    </button>
  );
}

function ContactDetail({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const color = avatarColor(contact.fullName);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--dc-surface)', border: '1px solid var(--dc-border)' }}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white"
              style={{ background: color }}>
              {initials(contact.fullName)}
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">{contact.fullName}</h3>
              {contact.organization && <p className="text-sm text-slate-500">{contact.organization}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg transition">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-2.5">
          {contact.email && (
            <a href={`mailto:${contact.email}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-blue-400 hover:bg-blue-500/10 transition"
              style={{ border: '1px solid var(--dc-border)' }}>
              <Mail size={15} className="shrink-0" />
              <span className="flex-1 truncate">{contact.email}</span>
            </a>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-green-400 hover:bg-green-500/10 transition"
              style={{ border: '1px solid var(--dc-border)' }}>
              <Phone size={15} className="shrink-0" />
              <span className="flex-1">{contact.phone}</span>
            </a>
          )}
          {contact.organization && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400"
              style={{ border: '1px solid var(--dc-border)' }}>
              <Building2 size={15} className="shrink-0" />
              <span className="flex-1 truncate">{contact.organization}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddContactModal({ onSave, onClose }: { onSave: (c: Omit<Contact,'uid'>) => Promise<void>; onClose: () => void }) {
  const t = useT();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', organization: '' });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) return;
    setSaving(true);
    try { await onSave(form); onClose(); } finally { setSaving(false); }
  }

  const field = (key: keyof typeof form, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className="text-xs text-slate-500 block mb-1">{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl text-sm text-slate-100 focus:outline-none transition"
        style={{ background: 'var(--dc-bg)', border: '1px solid var(--dc-border)' }} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl p-6 space-y-3"
        style={{ background: 'var(--dc-surface)', border: '1px solid var(--dc-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-slate-100">{t.contactsAdd}</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-white/5 transition">
            <X size={16} />
          </button>
        </div>
        {field('fullName', t.contactsName, 'text', 'Jan de Vries')}
        {field('email', t.contactsEmail, 'email', 'jan@example.com')}
        {field('phone', t.contactsPhone, 'tel', '+31 6 12345678')}
        {field('organization', t.contactsOrg, 'text', 'Bedrijf BV')}
        <button type="submit" disabled={saving || !form.fullName.trim()}
          className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition disabled:opacity-40"
          style={{ background: saving || !form.fullName.trim() ? 'var(--dc-border)' : 'var(--dc-blue)' }}>
          {saving ? 'Opslaan…' : t.contactsSave}
        </button>
      </form>
    </div>
  );
}

export default function ContactsPage() {
  const t = useT();
  const { request } = useApiRequest();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await request<Contact[]>('/api/me/contacts');
      setContacts(Array.isArray(data) ? data : []);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  async function addContact(c: Omit<Contact,'uid'>) {
    await fetch('/api/me/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    await load();
  }

  const filtered = query.trim()
    ? contacts.filter(c =>
        [c.fullName, c.email, c.phone, c.organization].some(v =>
          v?.toLowerCase().includes(query.toLowerCase())))
    : contacts;

  // Group A-Z
  const grouped: Record<string, Contact[]> = {};
  for (const c of filtered) {
    const key = c.fullName[0]?.toUpperCase() ?? '#';
    (grouped[key] ??= []).push(c);
  }
  const sortedKeys = Object.keys(grouped).sort();

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--dc-bg)' }}>
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'var(--dc-surf2)', border: '1px solid var(--dc-border)' }}>
            <Search size={15} className="text-slate-500 shrink-0" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none" />
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-white transition"
            style={{ background: 'var(--dc-blue)' }}>
            <UserPlus size={15} />
            <span className="hidden sm:inline">{t.contactsAdd}</span>
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({length: 6}).map((_,i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl animate-pulse"
                style={{ background: 'var(--dc-surf2)', border: '1px solid var(--dc-border)' }}>
                <div className="w-10 h-10 rounded-full bg-slate-700/60 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-slate-700 rounded w-1/3" />
                  <div className="h-2.5 bg-slate-700/50 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
            <AlertCircle size={32} className="text-red-400 opacity-50" />
            <p className="text-sm">{t.errorLoading}</p>
            <button onClick={load} className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl hover:bg-white/5 transition">
              <RefreshCw size={14} /> {t.errorRetry}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
            <User size={40} className="opacity-30" />
            <p className="text-sm">{query ? t.noResults : t.contactsEmpty}</p>
            {!query && (
              <button onClick={() => setShowAdd(true)}
                className="text-sm text-blue-400 hover:text-blue-300 transition">{t.contactsAdd}</button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {sortedKeys.map(key => (
              <div key={key}>
                <p className="text-xs font-semibold text-slate-600 px-1 mb-1.5">{key}</p>
                <div className="space-y-1">
                  {grouped[key].map(c => (
                    <ContactCard key={c.uid} contact={c} onClick={() => setSelected(c)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && <ContactDetail contact={selected} onClose={() => setSelected(null)} />}
      {showAdd && <AddContactModal onSave={addContact} onClose={() => setShowAdd(false)} />}
    </div>
  );
}
