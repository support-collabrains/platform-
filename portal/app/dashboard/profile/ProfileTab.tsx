// portal/app/dashboard/profile/ProfileTab.tsx
'use client';

import { useEffect, useState } from 'react';
import { Settings, Shield, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useT, useLang } from '../LangContext';
import type { Lang } from '../lang';
import { useApiRequest } from '@/hooks/use-api-request';
import { useDarkMode } from '@/hooks/use-dark-mode';
import { Sun, Moon } from 'lucide-react';

interface Preferences {
  signal_doc_notify: boolean;
  signal_digest_mode: boolean;
  language: 'nl' | 'de' | 'en';
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-6 rounded-full transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${checked ? 'bg-cyan-500' : 'bg-slate-600'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
    </button>
  );
}

function FieldSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-2.5 bg-slate-700 rounded w-1/3" />
      <div className="h-10 bg-slate-700/50 rounded-xl w-full" />
    </div>
  );
}

export default function ProfileTab({ username, email, isAdmin }: { username: string; email: string; isAdmin: boolean }) {
  const t = useT();
  const { request } = useApiRequest();
  const { dark, toggle: toggleDark } = useDarkMode();
  const [, setLang] = useLang();
  const [prefs, setPrefs] = useState<Preferences>({ signal_doc_notify: true, signal_digest_mode: false, language: 'nl' });
  const [saving, setSaving] = useState(false);
  const [ldapAttrs, setLdapAttrs] = useState({ signalPhone: '', defaultArchivePath: '' });
  const [ldapSaving, setLdapSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      request<Preferences>('/api/me/preferences').catch(() => null),
      request<{ signalPhone?: string; defaultArchivePath?: string }>('/api/me/ldap-profile').catch(() => null),
    ]).then(([prefsData, ldapData]) => {
      if (prefsData) setPrefs(prefsData);
      if (ldapData) setLdapAttrs({ signalPhone: ldapData.signalPhone ?? '', defaultArchivePath: ldapData.defaultArchivePath ?? '' });
    }).finally(() => setProfileLoading(false));
  }, [request]);

  async function saveLdapAttrs() {
    setLdapSaving(true);
    await fetch('/api/me/ldap-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ldapAttrs),
    }).finally(() => setLdapSaving(false));
  }

  async function updatePref<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs(prev => ({ ...prev, [key]: value }));
    if (key === 'language') setLang(value as Lang);
    setSaving(true);
    await fetch('/api/me/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    }).finally(() => setSaving(false));
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* User card */}
        <div className="bg-slate-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-slate-900 font-bold text-2xl shrink-0 select-none">
            {username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-100 truncate">{username}</p>
            {email && <p className="text-sm text-slate-500 truncate mt-0.5">{email}</p>}
          </div>
        </div>

        {/* Notification preferences */}
        <div className="bg-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Settings size={12} />
              {t.sectionNotifications}
              {saving && <span className="text-cyan-400 text-[10px] normal-case tracking-normal ml-1">{t.saving}</span>}
            </h3>
          </div>
          {profileLoading ? (
            <div className="px-4 pb-4 space-y-3">
              <div className="animate-pulse flex items-center justify-between py-2">
                <div className="space-y-1.5"><div className="h-3 bg-slate-700 rounded w-32" /><div className="h-2.5 bg-slate-700/50 rounded w-48" /></div>
                <div className="w-12 h-6 bg-slate-700 rounded-full" />
              </div>
              <div className="animate-pulse flex items-center justify-between py-2">
                <div className="space-y-1.5"><div className="h-3 bg-slate-700 rounded w-28" /><div className="h-2.5 bg-slate-700/50 rounded w-40" /></div>
                <div className="w-12 h-6 bg-slate-700 rounded-full" />
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              <div className="px-4 py-3.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-200">{t.prefSignalNotify}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.prefSignalNotifyDesc}</p>
                </div>
                <Toggle checked={prefs.signal_doc_notify} onChange={v => updatePref('signal_doc_notify', v)} />
              </div>
              <div className="px-4 py-3.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-200">{t.prefDigest}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.prefDigestDesc}</p>
                </div>
                <Toggle checked={prefs.signal_digest_mode} onChange={v => updatePref('signal_digest_mode', v)} />
              </div>
            </div>
          )}
        </div>

        {/* Language */}
        <div className="bg-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t.sectionLanguage}</h3>
          </div>
          <div className="px-4 pb-4">
            {profileLoading ? (
              <div className="h-10 bg-slate-700/50 rounded-xl animate-pulse" />
            ) : (
              <select
                value={prefs.language}
                onChange={e => updatePref('language', e.target.value as Preferences['language'])}
                className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600/50 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition appearance-none"
              >
                <option value="nl">🇳🇱 Nederlands</option>
                <option value="de">🇩🇪 Deutsch</option>
                <option value="en">🇬🇧 English</option>
              </select>
            )}
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Weergave</h3>
          </div>
          <div className="px-4 pb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-200">Donker thema</p>
              <p className="text-xs text-slate-500 mt-0.5">Schakel tussen licht en donker</p>
            </div>
            <button
              type="button"
              onClick={toggleDark}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm text-slate-300 transition"
            >
              {dark ? <Sun size={14} /> : <Moon size={14} />}
              {dark ? 'Licht' : 'Donker'}
            </button>
          </div>
        </div>

        {/* Contact & archive */}
        <div className="bg-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Contactgegevens
              {ldapSaving && <span className="text-cyan-400 text-[10px] normal-case tracking-normal ml-1">Opslaan...</span>}
            </h3>
          </div>
          <div className="px-4 pb-4 space-y-3">
            {profileLoading ? (
              <>
                <FieldSkeleton />
                <FieldSkeleton />
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Signal telefoonnummer</label>
                  <input type="tel" value={ldapAttrs.signalPhone} onChange={e => setLdapAttrs(prev => ({ ...prev, signalPhone: e.target.value }))} placeholder="+316xxxxxxxx" className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600/50 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Standaard archiefpad</label>
                  <input type="text" value={ldapAttrs.defaultArchivePath} onChange={e => setLdapAttrs(prev => ({ ...prev, defaultArchivePath: e.target.value }))} placeholder="/archive/gebruikersnaam" className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600/50 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition" />
                </div>
                <button onClick={saveLdapAttrs} disabled={ldapSaving} className="w-full py-2.5 bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-xl text-sm font-medium hover:bg-cyan-500/30 transition disabled:opacity-50">
                  Opslaan
                </button>
              </>
            )}
          </div>
        </div>

        {isAdmin && (
          <Link href="/admin" className="flex items-center gap-3 bg-slate-800 rounded-2xl p-4 hover:bg-slate-700/80 active:scale-[0.98] transition">
            <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center shrink-0">
              <Shield size={18} className="text-orange-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-200">{t.adminSettings}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t.adminSettingsDesc}</p>
            </div>
            <span className="text-slate-600 text-lg">›</span>
          </Link>
        )}

        <a
          href={process.env.NEXT_PUBLIC_LOGOUT_URL ?? '/outpost.goauthentik.io/sign_out'}
          className="flex items-center gap-3 bg-red-950/60 border border-red-900/50 rounded-2xl p-4 hover:bg-red-900/50 active:scale-[0.98] transition"
        >
          <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center shrink-0">
            <LogOut size={18} className="text-red-400" />
          </div>
          <p className="text-sm font-semibold text-red-300">{t.logout}</p>
        </a>

        <div className="h-4" />
      </div>
    </div>
  );
}
