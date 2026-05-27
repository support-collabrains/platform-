# Portal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragmented portal with a single app-shell that has bottom-tab navigation, a logout button, and a mobile-first responsive layout.

**Architecture:** A new `app/dashboard/layout.tsx` (server component) reads Authentik headers and renders `<AppShell>` — a sticky header + bottom nav wrapper. Each of the four tabs is a dedicated Next.js route under `/dashboard/*`. The mail client renders inline within its tab, never navigating away from the shell. Regular pages (Home, Docs, Profile) are `overflow-y-auto` scrollers; the mail tab controls its own overflow for the message pane.

**Tech Stack:** Next.js 16 app router, Tailwind CSS v4, lucide-react, existing `/api/me/*` route handlers unchanged.

---

## File map

| Action | Path | Purpose |
|---|---|---|
| Create | `portal/app/dashboard/layout.tsx` | Server component — reads auth headers, renders AppShell |
| Create | `portal/app/dashboard/AppShell.tsx` | Client component — sticky header + bottom nav |
| Create | `portal/app/dashboard/HomeTab.tsx` | Client component — activity feed + stats |
| Modify | `portal/app/dashboard/page.tsx` | Thin wrapper calling HomeTab |
| Create | `portal/app/dashboard/docs/page.tsx` | Documents tab with search |
| Create | `portal/app/dashboard/profile/page.tsx` | Server component reading email header |
| Create | `portal/app/dashboard/profile/ProfileTab.tsx` | Client component — prefs, language, logout |
| Modify | `portal/app/dashboard/mail/MailClient.tsx` | Mobile-first redesign |
| Modify | `portal/app/dashboard/loading.tsx` | Match new shell skeleton |
| Delete | `portal/app/dashboard/DashboardClient.tsx` | Replaced by HomeTab |
| Delete | `portal/app/dashboard/components/` (all 7 files) | Unused after redesign |

---

### Task 1: App shell — layout + AppShell component

**Files:**
- Create: `portal/app/dashboard/layout.tsx`
- Create: `portal/app/dashboard/AppShell.tsx`

- [ ] **Step 1: Create `portal/app/dashboard/layout.tsx`**

```typescript
// portal/app/dashboard/layout.tsx
import { headers } from 'next/headers';
import AppShell from './AppShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const username = hdrs.get('x-authentik-username') ?? 'user';
  const groups = hdrs.get('x-authentik-groups') ?? '';
  const isAdmin = groups.split(',').map(g => g.trim()).includes('platform-admins');
  return <AppShell username={username} isAdmin={isAdmin}>{children}</AppShell>;
}
```

- [ ] **Step 2: Create `portal/app/dashboard/AppShell.tsx`**

```typescript
// portal/app/dashboard/AppShell.tsx
'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Home, Mail, FileText, User } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  username: string;
  isAdmin: boolean;
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Home',
  '/dashboard/mail': 'Mail',
  '/dashboard/docs': 'Documenten',
  '/dashboard/profile': 'Profiel',
};

const NAV_ITEMS = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/dashboard/mail', icon: Mail, label: 'Mail' },
  { href: '/dashboard/docs', icon: FileText, label: 'Docs' },
  { href: '/dashboard/profile', icon: User, label: 'Profiel' },
] as const;

export default function AppShell({ children, username }: Props) {
  const pathname = usePathname();
  const [unreadMail, setUnreadMail] = useState(0);

  useEffect(() => {
    fetch('/api/me/mail/stats')
      .then(r => r.ok ? r.json() : null)
      .then((d: { unread?: number } | null) => { if (d?.unread != null) setUnreadMail(d.unread); })
      .catch(() => {});
  }, []);

  const title = PAGE_TITLES[pathname] ?? 'CollaBrains';

  return (
    <div className="flex flex-col bg-slate-900 text-slate-100 h-dvh">
      {/* Compact header */}
      <header className="shrink-0 h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-10">
        <span className="font-semibold text-sm text-slate-100">{title}</span>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-slate-900 font-bold text-sm select-none">
          {username.charAt(0).toUpperCase()}
        </div>
      </header>

      {/* Scrollable / controlled content area */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {children}
      </main>

      {/* Bottom navigation */}
      <nav className="shrink-0 bg-slate-900 border-t border-slate-800 flex safe-area-bottom">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative transition-colors min-h-[56px] ${
                active ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-cyan-400 rounded-full" />
              )}
              <div className="relative">
                <Icon size={22} strokeWidth={active ? 2 : 1.5} />
                {href === '/dashboard/mail' && unreadMail > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none">
                    {unreadMail > 99 ? '99+' : unreadMail}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run from `/srv/platform/portal`:
```bash
npm run build 2>&1 | tail -20
```
Expected: build succeeds (or only pre-existing errors, none from the new files).

- [ ] **Step 4: Commit**

```bash
git add portal/app/dashboard/layout.tsx portal/app/dashboard/AppShell.tsx
git commit -m "feat(portal): add app shell layout with bottom navigation"
```

---

### Task 2: Home tab

**Files:**
- Create: `portal/app/dashboard/HomeTab.tsx`
- Modify: `portal/app/dashboard/page.tsx`

- [ ] **Step 1: Create `portal/app/dashboard/HomeTab.tsx`**

```typescript
// portal/app/dashboard/HomeTab.tsx
'use client';

import { useEffect, useState } from 'react';
import { Bell, CheckCircle, Clock, XCircle } from 'lucide-react';
import Link from 'next/link';

interface Notification {
  id: string;
  documentTitle: string;
  status: string;
  createdAt: string;
}

const STATUS_CONFIG = {
  done:       { label: 'Samenvatting verzonden', color: 'text-green-400',  border: 'border-l-green-500',  Icon: CheckCircle },
  processing: { label: 'Bezig met verwerken',    color: 'text-yellow-400', border: 'border-l-yellow-500', Icon: Clock },
  pending:    { label: 'Wacht op verwerking',    color: 'text-slate-400',  border: 'border-l-slate-600',  Icon: Clock },
  failed:     { label: 'Mislukt',                color: 'text-red-400',    border: 'border-l-red-500',    Icon: XCircle },
} as const;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return 'zojuist';
  if (m < 60) return `${m}m geleden`;
  if (h < 24) return `${h}u geleden`;
  if (d < 7) return `${d}d geleden`;
  return new Date(dateStr).toLocaleDateString('nl-NL');
}

export default function HomeTab({ username }: { username: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [unreadMail, setUnreadMail] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/me/notifications').then(r => r.ok ? r.json() : { notifications: [] }),
      fetch('/api/me/documents').then(r => r.ok ? r.json() : { docs: [] }),
      fetch('/api/me/mail/stats').then(r => r.ok ? r.json() : { unread: 0 }),
    ]).then(([notifData, docsData, mailData]) => {
      setNotifications((notifData as { notifications?: Notification[] }).notifications ?? []);
      setDocCount(((docsData as { docs?: unknown[] }).docs ?? []).length);
      setUnreadMail((mailData as { unread?: number }).unread ?? 0);
    }).finally(() => setLoading(false));
  }, []);

  const pending = notifications.filter(n => n.status !== 'done' && n.status !== 'failed').length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* Greeting */}
        <div className="pt-1">
          <h2 className="text-xl font-bold text-slate-100">Welkom, {username}</h2>
          <p className="text-sm text-slate-500 mt-0.5">Hier is je overzicht</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <Link href="/dashboard/docs" className="bg-slate-800 rounded-2xl p-4 text-center hover:bg-slate-700/80 active:scale-95 transition">
            <div className="text-2xl font-bold text-cyan-400">{loading ? '—' : docCount}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">Documenten</div>
          </Link>
          <Link href="/dashboard/mail" className="bg-slate-800 rounded-2xl p-4 text-center hover:bg-slate-700/80 active:scale-95 transition">
            <div className="text-2xl font-bold text-blue-400">{loading ? '—' : unreadMail}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">Ongelezen mail</div>
          </Link>
          <div className="bg-slate-800 rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-orange-400">{loading ? '—' : pending}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">In verwerking</div>
          </div>
        </div>

        {/* Activity feed */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Recente activiteit</h3>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-slate-800 rounded-2xl p-4 animate-pulse">
                  <div className="h-3 bg-slate-700 rounded w-2/3 mb-2" />
                  <div className="h-2.5 bg-slate-700/50 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-slate-600">
              <Bell size={36} className="mb-3 opacity-30" />
              <p className="text-sm">Nog geen activiteit</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map(n => {
                const cfg = STATUS_CONFIG[n.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
                const { Icon } = cfg;
                return (
                  <div key={n.id} className={`bg-slate-800 rounded-2xl p-4 flex items-start gap-3 border-l-2 ${cfg.border}`}>
                    <Icon size={16} className={`${cfg.color} mt-0.5 shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{n.documentTitle}</p>
                      <p className={`text-xs mt-0.5 ${cfg.color}`}>{cfg.label}</p>
                    </div>
                    <span className="text-xs text-slate-600 whitespace-nowrap shrink-0">{timeAgo(n.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `portal/app/dashboard/page.tsx`**

```typescript
// portal/app/dashboard/page.tsx
import { headers } from 'next/headers';
import HomeTab from './HomeTab';

export default async function DashboardPage() {
  const hdrs = await headers();
  const username = hdrs.get('x-authentik-username') ?? 'Gebruiker';
  return <HomeTab username={username} />;
}
```

- [ ] **Step 3: Build to verify**

```bash
npm run build 2>&1 | tail -20
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add portal/app/dashboard/HomeTab.tsx portal/app/dashboard/page.tsx
git commit -m "feat(portal): add home tab with activity feed and stats"
```

---

### Task 3: Documents tab

**Files:**
- Create: `portal/app/dashboard/docs/page.tsx`

- [ ] **Step 1: Create `portal/app/dashboard/docs/page.tsx`**

```typescript
// portal/app/dashboard/docs/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { FileText, Search, ExternalLink } from 'lucide-react';

interface Doc {
  id: number;
  title: string;
  created: string;
}

function paperlessUrl(id: number): string {
  // NEXT_PUBLIC_API_URL = https://portal.domain.tld/api
  // → https://docs.domain.tld/documents/123/
  const api = process.env.NEXT_PUBLIC_API_URL ?? '';
  return api.replace('portal.', 'docs.').replace(/\/api$/, '') + `/documents/${id}/`;
}

export default function DocsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me/documents')
      .then(r => r.ok ? r.json() : { docs: [] })
      .then((d: { docs?: Doc[] }) => setDocs(d.docs ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = docs.filter(d => d.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="search"
            placeholder="Zoeken..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-2xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-600">
            <FileText size={40} className="mb-3 opacity-30" />
            <p className="text-sm">{query ? 'Geen resultaten' : 'Geen documenten'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(doc => (
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
                    {new Date(doc.created).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <ExternalLink size={15} className="text-slate-600 group-hover:text-slate-400 transition shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build 2>&1 | tail -20
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add portal/app/dashboard/docs/page.tsx
git commit -m "feat(portal): add documents tab with search"
```

---

### Task 4: Profile tab with logout

**Files:**
- Create: `portal/app/dashboard/profile/page.tsx`
- Create: `portal/app/dashboard/profile/ProfileTab.tsx`

- [ ] **Step 1: Create `portal/app/dashboard/profile/page.tsx`**

```typescript
// portal/app/dashboard/profile/page.tsx
import { headers } from 'next/headers';
import ProfileTab from './ProfileTab';

export default async function ProfilePage() {
  const hdrs = await headers();
  const username = hdrs.get('x-authentik-username') ?? 'user';
  const email = hdrs.get('x-authentik-email') ?? '';
  const groups = hdrs.get('x-authentik-groups') ?? '';
  const isAdmin = groups.split(',').map(g => g.trim()).includes('platform-admins');
  return <ProfileTab username={username} email={email} isAdmin={isAdmin} />;
}
```

- [ ] **Step 2: Create `portal/app/dashboard/profile/ProfileTab.tsx`**

```typescript
// portal/app/dashboard/profile/ProfileTab.tsx
'use client';

import { useEffect, useState } from 'react';
import { Settings, Shield, LogOut } from 'lucide-react';
import Link from 'next/link';

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
      className={`relative w-12 h-6 rounded-full transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
        checked ? 'bg-cyan-500' : 'bg-slate-600'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function ProfileTab({
  username,
  email,
  isAdmin,
}: {
  username: string;
  email: string;
  isAdmin: boolean;
}) {
  const [prefs, setPrefs] = useState<Preferences>({
    signal_doc_notify: true,
    signal_digest_mode: false,
    language: 'nl',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/me/preferences')
      .then(r => r.ok ? r.json() : null)
      .then((d: Preferences | null) => { if (d) setPrefs(d); })
      .catch(() => {});
  }, []);

  async function updatePref<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs(prev => ({ ...prev, [key]: value }));
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
              Meldingen
              {saving && <span className="text-cyan-400 text-[10px] normal-case tracking-normal ml-1">opslaan…</span>}
            </h3>
          </div>
          <div className="divide-y divide-slate-700/50">
            <div className="px-4 py-3.5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-200">Signal-meldingen</p>
                <p className="text-xs text-slate-500 mt-0.5">Melding bij nieuw document</p>
              </div>
              <Toggle
                checked={prefs.signal_doc_notify}
                onChange={v => updatePref('signal_doc_notify', v)}
              />
            </div>
            <div className="px-4 py-3.5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-200">Digest-modus</p>
                <p className="text-xs text-slate-500 mt-0.5">Dagelijks overzicht i.p.v. direct</p>
              </div>
              <Toggle
                checked={prefs.signal_digest_mode}
                onChange={v => updatePref('signal_digest_mode', v)}
              />
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="bg-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Taal</h3>
          </div>
          <div className="px-4 pb-4">
            <select
              value={prefs.language}
              onChange={e => updatePref('language', e.target.value as Preferences['language'])}
              className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600/50 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition appearance-none"
            >
              <option value="nl">🇳🇱 Nederlands</option>
              <option value="de">🇩🇪 Deutsch</option>
              <option value="en">🇬🇧 English</option>
            </select>
          </div>
        </div>

        {/* Admin link — only for admins */}
        {isAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-3 bg-slate-800 rounded-2xl p-4 hover:bg-slate-700/80 active:scale-[0.98] transition"
          >
            <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center shrink-0">
              <Shield size={18} className="text-orange-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-200">Beheerdersinstellingen</p>
              <p className="text-xs text-slate-500 mt-0.5">Gebruikers, tickets, configuratie</p>
            </div>
            <span className="text-slate-600 text-lg">›</span>
          </Link>
        )}

        {/* Logout */}
        <a
          href="/outpost.goauthentik.io/sign_out"
          className="flex items-center gap-3 bg-red-950/60 border border-red-900/50 rounded-2xl p-4 hover:bg-red-900/50 active:scale-[0.98] transition"
        >
          <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center shrink-0">
            <LogOut size={18} className="text-red-400" />
          </div>
          <p className="text-sm font-semibold text-red-300">Uitloggen</p>
        </a>

        {/* Spacer for safe area */}
        <div className="h-4" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build to verify**

```bash
npm run build 2>&1 | tail -20
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add portal/app/dashboard/profile/page.tsx portal/app/dashboard/profile/ProfileTab.tsx
git commit -m "feat(portal): add profile tab with preferences, language, logout"
```

---

### Task 5: Mail client — mobile-first redesign

**Files:**
- Modify: `portal/app/dashboard/mail/MailClient.tsx`

The key changes vs the current version:
- Folder selector becomes a horizontal-scroll chip row (no fixed sidebar on mobile)
- On mobile: message list is full-width; tapping a message shows a full-screen detail overlay
- On desktop (md+): restore 3-column layout (folder sidebar + list + detail)
- Refresh button moves into the folder chip row
- Remove the back-to-dashboard link (the shell handles navigation)

- [ ] **Step 1: Replace `portal/app/dashboard/mail/MailClient.tsx`**

```typescript
// portal/app/dashboard/mail/MailClient.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';

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
      if (!r.ok) { setError('Kon berichten niet laden'); return; }
      const { messages: msgs, total: tot } = await r.json() as {
        messages: MailMessage[]; total: number;
      };
      setMessages(msgs);
      setTotal(tot);
    } catch {
      setError('Verbindingsfout');
    } finally {
      setLoadingList(false);
    }
  }, []);

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
                Geen berichten
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
                      {msg.from || '(onbekend)'}
                    </span>
                    <span className="text-[11px] text-slate-600 shrink-0">{fmt(msg.date)}</span>
                  </div>
                  <p className={`text-sm truncate mt-0.5 ${msg.seen ? 'text-slate-600' : 'text-slate-400'}`}>
                    {msg.subject || '(geen onderwerp)'}
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
            Laden…
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
                  {selected.subject || '(geen onderwerp)'}
                </h2>
                <button
                  onClick={() => deleteMessage(selected.uid)}
                  className="p-1 text-slate-500 hover:text-red-400 transition shrink-0"
                  title={folder === 'Trash' ? 'Definitief verwijderen' : 'Naar prullenbak'}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="text-xs text-slate-500 space-y-0.5 ml-7 md:ml-0">
                <div><span className="text-slate-600">Van:</span> {selected.from}</div>
                <div><span className="text-slate-600">Aan:</span> {selected.to}</div>
                {selected.cc && <div><span className="text-slate-600">CC:</span> {selected.cc}</div>}
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
                  {selected.bodyText || '(geen inhoud)'}
                </pre>
              )}
            </div>
          </div>
        ) : (
          /* Empty state — desktop only */
          <div className="hidden md:flex flex-1 items-center justify-center text-slate-600 text-sm">
            Selecteer een bericht
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build 2>&1 | tail -20
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add portal/app/dashboard/mail/MailClient.tsx
git commit -m "feat(portal): mobile-first mail client with folder chips and slide-in detail"
```

---

### Task 6: Cleanup — delete old files, update loading skeleton

**Files:**
- Modify: `portal/app/dashboard/loading.tsx`
- Delete: `portal/app/dashboard/DashboardClient.tsx`
- Delete: `portal/app/dashboard/components/` (7 files)

- [ ] **Step 1: Confirm nothing imports the files to delete**

```bash
grep -r "DashboardClient\|from.*dashboard/components" /srv/platform/portal/app --include="*.tsx" --include="*.ts"
```
Expected: only `portal/app/dashboard/page.tsx` references DashboardClient (which we already replaced in Task 2). Components directory has no external importers.

- [ ] **Step 2: Delete old files**

```bash
rm /srv/platform/portal/app/dashboard/DashboardClient.tsx
rm -rf /srv/platform/portal/app/dashboard/components
```

- [ ] **Step 3: Update `portal/app/dashboard/loading.tsx` to match new shell**

```typescript
// portal/app/dashboard/loading.tsx
export default function Loading() {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      {/* Greeting skeleton */}
      <div className="pt-1 space-y-2 animate-pulse">
        <div className="h-6 bg-slate-700 rounded-lg w-48" />
        <div className="h-3.5 bg-slate-700/50 rounded w-32" />
      </div>
      {/* Stats row skeleton */}
      <div className="grid grid-cols-3 gap-3 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-slate-800 rounded-2xl p-4 space-y-2">
            <div className="h-7 bg-slate-700 rounded w-8 mx-auto" />
            <div className="h-2.5 bg-slate-700/50 rounded w-3/4 mx-auto" />
          </div>
        ))}
      </div>
      {/* Activity skeleton */}
      <div className="space-y-2 animate-pulse">
        <div className="h-3 bg-slate-700/50 rounded w-28 mb-3" />
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-slate-800 rounded-2xl p-4 flex gap-3">
            <div className="w-4 h-4 bg-slate-700 rounded-full mt-0.5 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-slate-700 rounded w-3/4" />
              <div className="h-2.5 bg-slate-700/50 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build to verify**

```bash
npm run build 2>&1 | tail -20
```
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add portal/app/dashboard/loading.tsx
git commit -m "feat(portal): update loading skeleton + remove old DashboardClient and components"
```

---

### Task 7: Build, deploy, verify

**Files:** none — build and deploy only

- [ ] **Step 1: Final production build**

```bash
cd /srv/platform/portal && npm run build 2>&1 | tail -20
```
Expected: `✓ Compiled successfully` or similar, zero new errors.

- [ ] **Step 2: Rebuild and restart portal container**

```bash
cd /srv/platform && docker compose build portal && docker compose up -d portal
```

- [ ] **Step 3: Wait for portal to start**

```bash
sleep 5 && docker ps --filter name=platform-portal --format "{{.Status}}"
```
Expected: `Up N seconds`

- [ ] **Step 4: Smoke test each tab**

```bash
source /srv/platform/.env
PORTAL_IP=$(docker inspect platform-portal-1 --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}')

# Home tab — returns HTML with HomeTab
curl -s "http://${PORTAL_IP}:3000/dashboard" -H "x-authentik-username: scan" | grep -o "Welkom" | head -1

# Mail tab — loads without error
curl -s -o /dev/null -w "%{http_code}" "http://${PORTAL_IP}:3000/dashboard/mail" -H "x-authentik-username: scan"

# Docs tab
curl -s -o /dev/null -w "%{http_code}" "http://${PORTAL_IP}:3000/dashboard/docs" -H "x-authentik-username: scan"

# Profile tab
curl -s -o /dev/null -w "%{http_code}" "http://${PORTAL_IP}:3000/dashboard/profile" -H "x-authentik-username: scan"
```
Expected: `Welkom` + three `200` responses.

- [ ] **Step 5: Commit deploy**

```bash
git add -A && git commit -m "feat(portal): ship redesigned portal — bottom nav, logout, mobile-first UX"
```
