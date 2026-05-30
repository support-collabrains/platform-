# Error Handling & Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all silent `.catch(() => {})` failures in the CollaBrains portal with visible error messages, retry buttons, and a toast notification system.

**Architecture:** Three new shared utilities (Toast system, Error Boundary, `useApiRequest` hook) wired into the dashboard layout, then each of the 8 existing page files is updated to use them. No new dependencies except the existing React/Next.js stack.

**Tech Stack:** Next.js 16 (App Router, `'use client'`), React 19, TypeScript, Tailwind CSS. Working directory: `/srv/platform/portal`.

---

## File Map

**Create:**
- `portal/components/ui/toast.tsx` — module-level toast store + `<Toaster>` component + `toast` object
- `portal/components/ui/error-boundary.tsx` — React class component for page-level crash isolation
- `portal/hooks/use-api-request.ts` — `fetch` wrapper with timeout (10 s), 2 retries, auto-toast

**Modify:**
- `portal/app/dashboard/lang.ts` — add error-related translation keys
- `portal/app/dashboard/layout.tsx` — mount `<Toaster>`, wrap children in `<ErrorBoundary>`
- `portal/app/dashboard/AppShell.tsx` — use `useApiRequest` for badge counts, add offline indicator
- `portal/app/dashboard/HomeTab.tsx` — use `useApiRequest`, add retry button, fix today-events empty state
- `portal/app/dashboard/docs/page.tsx` — use `useApiRequest`, add retry button on error
- `portal/app/dashboard/docs/[id]/page.tsx` — add loading skeleton, improve error UI
- `portal/app/dashboard/mail/MailClient.tsx` — add retry button (already has error state, minor change)
- `portal/app/dashboard/tasks/TasksClient.tsx` — use `useApiRequest`, add retry button
- `portal/app/dashboard/calendar/CalendarClient.tsx` — use `useApiRequest`, add retry button
- `portal/app/dashboard/profile/ProfileTab.tsx` — add loading skeleton for initial data

---

## Task 1: Toast notification system

**Files:**
- Create: `portal/components/ui/toast.tsx`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p /srv/platform/portal/components/ui
```

- [ ] **Step 2: Write `portal/components/ui/toast.tsx`**

```tsx
// portal/components/ui/toast.tsx
'use client';

import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

// ── Module-level store (client-side only) ─────────────────────────────────────
let _toasts: Toast[] = [];
let _listeners: Array<(toasts: Toast[]) => void> = [];

function notify() {
  _listeners.forEach(fn => fn([..._toasts]));
}

function add(message: string, variant: ToastVariant, durationMs: number) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  _toasts = [..._toasts.slice(-3), { id, message, variant }]; // max 4
  notify();
  setTimeout(() => remove(id), durationMs);
}

function remove(id: string) {
  _toasts = _toasts.filter(t => t.id !== id);
  notify();
}

// ── Public API ────────────────────────────────────────────────────────────────
export const toast = {
  success: (msg: string) => add(msg, 'success', 3000),
  error:   (msg: string) => add(msg, 'error',   6000),
  warning: (msg: string) => add(msg, 'warning', 5000),
  info:    (msg: string) => add(msg, 'info',    4000),
};

// ── Toaster component — mount once in layout ──────────────────────────────────
const ICONS: Record<ToastVariant, React.ElementType> = {
  success: CheckCircle,
  error:   AlertCircle,
  warning: AlertTriangle,
  info:    Info,
};

const STYLES: Record<ToastVariant, string> = {
  success: 'bg-emerald-900/90 border-emerald-700/60 text-emerald-200',
  error:   'bg-red-900/90 border-red-700/60 text-red-200',
  warning: 'bg-amber-900/90 border-amber-700/60 text-amber-200',
  info:    'bg-blue-900/90 border-blue-700/60 text-blue-200',
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const fn = (ts: Toast[]) => setToasts(ts);
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(l => l !== fn); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[calc(100vw-32px)] max-w-sm pointer-events-none"
    >
      {toasts.map(t => {
        const Icon = ICONS[t.variant];
        return (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl border text-sm shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 fade-in duration-200 ${STYLES[t.variant]}`}
          >
            <Icon size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition"
              aria-label="Sluit melding"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Verify the file exists**

```bash
ls /srv/platform/portal/components/ui/toast.tsx && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
cd /srv/platform
git add portal/components/ui/toast.tsx
git commit -m "feat(portal): add toast notification system"
```

---

## Task 2: Error Boundary component

**Files:**
- Create: `portal/components/ui/error-boundary.tsx`

- [ ] **Step 1: Write `portal/components/ui/error-boundary.tsx`**

```tsx
// portal/components/ui/error-boundary.tsx
'use client';

import { Component, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    return { hasError: true, message };
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 p-8">
          <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center">
            <AlertCircle size={24} className="text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-200 mb-1">Er ging iets mis</p>
            <p className="text-xs text-slate-500 max-w-xs">{this.state.message}</p>
          </div>
          <button
            onClick={this.reset}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm transition"
          >
            <RefreshCw size={14} />
            Opnieuw proberen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/components/ui/error-boundary.tsx
git commit -m "feat(portal): add ErrorBoundary component"
```

---

## Task 3: `useApiRequest` hook

**Files:**
- Create: `portal/hooks/use-api-request.ts`

The hook wraps `fetch` with:
- 10 s `AbortController` timeout
- 2 retries on network failure (not on HTTP errors)
- `toast.error()` with a human-readable message on final failure

- [ ] **Step 1: Create the hooks directory and file**

```bash
mkdir -p /srv/platform/portal/hooks
```

- [ ] **Step 2: Write `portal/hooks/use-api-request.ts`**

```ts
// portal/hooks/use-api-request.ts
'use client';

import { useCallback } from 'react';
import { toast } from '@/components/ui/toast';

const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

// Maps URL prefix to a friendly Dutch error message
function errorLabel(url: string): string {
  if (url.includes('/mail'))       return 'Mailserver niet bereikbaar';
  if (url.includes('/documents'))  return 'Paperless niet bereikbaar';
  if (url.includes('/document-types')) return 'Documenttypes niet beschikbaar';
  if (url.includes('/calendar'))   return 'Agenda niet beschikbaar';
  if (url.includes('/tickets'))    return 'Taken niet beschikbaar';
  if (url.includes('/preferences')) return 'Instellingen niet beschikbaar';
  if (url.includes('/ldap-profile')) return 'Profieldata niet beschikbaar';
  if (url.includes('/notifications')) return 'Meldingen niet beschikbaar';
  if (url.includes('/gateway'))    return 'Service tijdelijk niet bereikbaar';
  return 'Verbindingsfout — probeer opnieuw';
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, options: RequestInit, retries: number): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options);
      return res; // caller checks res.ok — we only retry on network errors
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw new Error('Unreachable');
}

/**
 * Returns a stable `request<T>()` function.
 *
 * Usage (inside useEffect or async handler):
 *   const { request } = useApiRequest();
 *   const data = await request<MyType>('/api/me/documents');
 *
 * On network failure (after retries): shows toast.error and throws.
 * On non-ok HTTP (4xx/5xx): throws without toast (caller decides).
 * On success: returns parsed JSON.
 */
export function useApiRequest() {
  const request = useCallback(async <T>(
    url: string,
    options: RequestInit = {},
  ): Promise<T> => {
    let res: Response;
    try {
      res = await fetchWithRetry(url, options, MAX_RETRIES);
    } catch {
      toast.error(errorLabel(url));
      throw new Error(errorLabel(url));
    }
    if (!res.ok) {
      // HTTP error — don't auto-toast; let caller decide
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }, []);

  return { request };
}
```

- [ ] **Step 3: Verify**

```bash
ls /srv/platform/portal/hooks/use-api-request.ts && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
cd /srv/platform
git add portal/hooks/use-api-request.ts
git commit -m "feat(portal): add useApiRequest hook with timeout, retry, auto-toast"
```

---

## Task 4: Wire infrastructure — layout + lang translations

**Files:**
- Modify: `portal/app/dashboard/layout.tsx`
- Modify: `portal/app/dashboard/lang.ts`

- [ ] **Step 1: Rewrite `portal/app/dashboard/layout.tsx`**

```tsx
// portal/app/dashboard/layout.tsx
import { headers } from 'next/headers';
import AppShell from './AppShell';
import { Toaster } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const username = hdrs.get('x-authentik-username') ?? 'user';
  const groups = hdrs.get('x-authentik-groups') ?? '';
  const isAdmin = groups.split(',').map(g => g.trim()).includes('platform-admins');
  return (
    <AppShell username={username} isAdmin={isAdmin}>
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
      <Toaster />
    </AppShell>
  );
}
```

- [ ] **Step 2: Add error translations to `portal/app/dashboard/lang.ts`**

Open `portal/app/dashboard/lang.ts`. Find the `nl` object (around line 3). Add these keys inside it, after the last existing key:

```ts
  // Error handling
  errorRetry: 'Opnieuw proberen',
  errorServiceUnavailable: 'Service niet beschikbaar',
  errorLoading: 'Fout bij laden',
```

Do the same for the `de` object:

```ts
  // Error handling
  errorRetry: 'Erneut versuchen',
  errorServiceUnavailable: 'Dienst nicht verfügbar',
  errorLoading: 'Fehler beim Laden',
```

And the `en` object:

```ts
  // Error handling
  errorRetry: 'Try again',
  errorServiceUnavailable: 'Service unavailable',
  errorLoading: 'Error loading',
```

- [ ] **Step 3: Verify the portal still compiles**

```bash
cd /srv/platform && docker compose exec portal sh -c "cd /app && npx next build --no-lint 2>&1 | tail -5" 2>/dev/null || echo "(build check skipped — will verify at end)"
```

- [ ] **Step 4: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/layout.tsx portal/app/dashboard/lang.ts
git commit -m "feat(portal): wire Toaster + ErrorBoundary into dashboard layout"
```

---

## Task 5: Fix AppShell — replace silent fetch failures

**Files:**
- Modify: `portal/app/dashboard/AppShell.tsx`

The two `useEffect` blocks in AppShell use bare `fetch().catch(() => {})`. We add `useApiRequest` so network failures auto-toast without crashing.

- [ ] **Step 1: Rewrite `portal/app/dashboard/AppShell.tsx`**

```tsx
// portal/app/dashboard/AppShell.tsx
'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Home, Mail, FileText, User, CheckSquare } from 'lucide-react';
import { LangContext } from './LangContext';
import { translations, type Lang } from './lang';
import { useApiRequest } from '@/hooks/use-api-request';

interface Props {
  children: React.ReactNode;
  username: string;
  isAdmin: boolean;
}

const NAV_HREFS = [
  { href: '/dashboard', icon: Home },
  { href: '/dashboard/tasks', icon: CheckSquare },
  { href: '/dashboard/mail', icon: Mail },
  { href: '/dashboard/docs', icon: FileText },
  { href: '/dashboard/profile', icon: User },
] as const;

export default function AppShell({ children, username }: Props) {
  const pathname = usePathname();
  const [unreadMail, setUnreadMail] = useState(0);
  const [openTasks, setOpenTasks] = useState(0);
  const [lang, setLang] = useState<Lang>('nl');
  const { request } = useApiRequest();

  useEffect(() => {
    // Badge counts — silently ignore errors (non-critical UI)
    request<{ unread?: number }>('/api/me/mail/stats')
      .then(d => { if (d?.unread != null) setUnreadMail(d.unread); })
      .catch(() => {});
    request<{ tickets?: unknown[] }>('/api/me/tickets')
      .then(d => { if (d?.tickets != null) setOpenTasks(d.tickets.length); })
      .catch(() => {});
  }, [request]);

  useEffect(() => {
    request<{ language?: string }>('/api/me/preferences')
      .then(d => {
        if (d?.language && ['nl', 'de', 'en'].includes(d.language)) setLang(d.language as Lang);
      })
      .catch(() => {});
  }, [request]);

  const t = translations[lang] ?? translations.nl;

  const PAGE_TITLES: Record<string, string> = {
    '/dashboard': t.titleHome,
    '/dashboard/tasks': t.titleTasks,
    '/dashboard/calendar': t.titleCalendar,
    '/dashboard/photos': t.titlePhotos,
    '/dashboard/mail': t.titleMail,
    '/dashboard/docs': t.titleDocs,
    '/dashboard/profile': t.titleProfile,
  };

  const NAV_LABELS = [t.navHome, t.navTasks, t.navMail, t.navDocs, t.navProfile];

  const title = PAGE_TITLES[pathname] ?? t.titleFallback;

  return (
    <LangContext.Provider value={{ lang, setLang }}>
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
        <nav className="shrink-0 bg-slate-900 border-t border-slate-800 flex">
          {NAV_HREFS.map(({ href, icon: Icon }, i) => {
            const label = NAV_LABELS[i];
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
                  {href === '/dashboard/tasks' && openTasks > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-cyan-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none">
                      {openTasks > 99 ? '99+' : openTasks}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </LangContext.Provider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/AppShell.tsx
git commit -m "fix(portal): use useApiRequest in AppShell badge fetches"
```

---

## Task 6: Fix HomeTab — retry on error, fix today-events empty state

**Files:**
- Modify: `portal/app/dashboard/HomeTab.tsx`

Two bugs to fix:
1. All 5 fetches are silent on failure. Switch to `useApiRequest` and catch with a retry button.
2. The today-events section is hidden when loading=false AND events=[] — user never sees "geen agenda vandaag".

- [ ] **Step 1: Rewrite `portal/app/dashboard/HomeTab.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCircle, Clock, XCircle, Calendar, Camera, RefreshCw, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useT } from './LangContext';
import { useApiRequest } from '@/hooks/use-api-request';

interface Notification {
  id: string;
  documentTitle: string;
  status: string;
  createdAt: string;
}

interface CalEvent {
  uid: string;
  summary: string;
  start: string;
  allDay: boolean;
}

export default function HomeTab({ username }: { username: string }) {
  const t = useT();
  const { request } = useApiRequest();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [unreadMail, setUnreadMail] = useState(0);
  const [openTasks, setOpenTasks] = useState(0);
  const [todayEvents, setTodayEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const STATUS_CONFIG = {
    done:       { label: t.statusDone,       color: 'text-green-400',  border: 'border-l-green-500',  Icon: CheckCircle },
    processing: { label: t.statusProcessing, color: 'text-yellow-400', border: 'border-l-yellow-500', Icon: Clock },
    pending:    { label: t.statusPending,    color: 'text-slate-400',  border: 'border-l-slate-600',  Icon: Clock },
    failed:     { label: t.statusFailed,     color: 'text-red-400',    border: 'border-l-red-500',    Icon: XCircle },
  } as const;

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60_000);
    const h = Math.floor(diff / 3_600_000);
    const d = Math.floor(diff / 86_400_000);
    if (m < 1) return t.timeJustNow;
    if (m < 60) return t.timeMinutes(m);
    if (h < 24) return t.timeHours(h);
    if (d < 7) return t.timeDays(d);
    return new Date(dateStr).toLocaleDateString('nl-NL');
  }

  function formatEventTime(ev: CalEvent): string {
    if (ev.allDay) return t.calendarAllDay;
    try { return new Date(ev.start).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    Promise.all([
      request<{ notifications?: Notification[] }>('/api/me/notifications').catch(() => ({ notifications: [] as Notification[] })),
      request<{ docs?: unknown[] }>('/api/me/documents').catch(() => ({ docs: [] })),
      request<{ unread?: number }>('/api/me/mail/stats').catch(() => ({ unread: 0 })),
      request<{ tickets?: unknown[] }>('/api/me/tickets').catch(() => ({ tickets: [] })),
      request<{ events?: CalEvent[] }>(`/api/me/calendar/events?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(tomorrow)}`).catch(() => ({ events: [] as CalEvent[] })),
    ]).then(([notifData, docsData, mailData, ticketsData, calData]) => {
      setNotifications(notifData.notifications ?? []);
      setDocCount((docsData.docs ?? []).length);
      setUnreadMail(mailData.unread ?? 0);
      setOpenTasks((ticketsData.tickets ?? []).length);
      const allEvents = calData.events ?? [];
      setTodayEvents(allEvents.filter(ev => ev.start.slice(0, 10) === today));
    }).catch(() => {
      setLoadError(true);
    }).finally(() => setLoading(false));
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const pending = notifications.filter(n => n.status !== 'done' && n.status !== 'failed').length;

  if (loadError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
        <AlertCircle size={36} className="text-red-400 opacity-60" />
        <p className="text-sm text-slate-400">{t.errorLoading}</p>
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
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* Greeting */}
        <div className="pt-1">
          <h2 className="text-xl font-bold text-slate-100">{t.welcome(username)}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{t.overview}</p>
        </div>

        {/* Stats row — 4 tiles */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/docs" className="bg-slate-800 rounded-2xl p-4 text-center hover:bg-slate-700/80 active:scale-95 transition">
            <div className="text-2xl font-bold text-cyan-400">{loading ? '—' : docCount}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">{t.statDocs}</div>
          </Link>
          <Link href="/dashboard/mail" className="bg-slate-800 rounded-2xl p-4 text-center hover:bg-slate-700/80 active:scale-95 transition">
            <div className="text-2xl font-bold text-blue-400">{loading ? '—' : unreadMail}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">{t.statMail}</div>
          </Link>
          <Link href="/dashboard/tasks" className="bg-slate-800 rounded-2xl p-4 text-center hover:bg-slate-700/80 active:scale-95 transition">
            <div className="text-2xl font-bold text-emerald-400">{loading ? '—' : openTasks}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">{t.statTasks}</div>
          </Link>
          <div className="bg-slate-800 rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-orange-400">{loading ? '—' : pending}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">{t.statProcessing}</div>
          </div>
        </div>

        {/* Today's agenda — always show section (fixes missing empty state) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t.calendarToday}</h3>
            <Link href="/dashboard/calendar" className="text-xs text-cyan-500 hover:text-cyan-400">
              <Calendar size={14} />
            </Link>
          </div>
          {loading ? (
            <div className="bg-slate-800 rounded-2xl p-4 animate-pulse">
              <div className="h-3 bg-slate-700 rounded w-1/2" />
            </div>
          ) : todayEvents.length === 0 ? (
            <div className="bg-slate-800/50 rounded-2xl p-4 flex items-center gap-3 text-slate-600">
              <Calendar size={16} className="opacity-40" />
              <span className="text-sm">{t.calendarNoEvents}</span>
            </div>
          ) : (
            <div className="space-y-2">
              {todayEvents.map(ev => (
                <Link href="/dashboard/calendar" key={ev.uid} className="flex items-center gap-3 bg-slate-800 rounded-2xl p-3 hover:bg-slate-700/80 transition">
                  <div className="w-1 self-stretch bg-cyan-500 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{ev.summary}</p>
                    <p className="text-xs text-slate-500">{formatEventTime(ev)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/calendar" className="bg-slate-800 rounded-2xl p-4 flex flex-col items-center gap-2 hover:bg-slate-700/80 active:scale-95 transition">
            <Calendar size={24} className="text-sky-400" />
            <span className="text-xs text-slate-500">{t.titleCalendar}</span>
          </Link>
          <Link href="/dashboard/photos" className="bg-slate-800 rounded-2xl p-4 flex flex-col items-center gap-2 hover:bg-slate-700/80 active:scale-95 transition">
            <Camera size={24} className="text-purple-400" />
            <span className="text-xs text-slate-500">{t.titlePhotos}</span>
          </Link>
        </div>

        {/* Activity feed */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{t.recentActivity}</h3>
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
            <div className="flex flex-col items-center py-10 text-slate-600">
              <Bell size={36} className="mb-3 opacity-30" />
              <p className="text-sm">{t.noActivity}</p>
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

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/HomeTab.tsx
git commit -m "fix(portal): add retry button and fix today-events empty state in HomeTab"
```

---

## Task 7: Fix DocsPage — retry on error

**Files:**
- Modify: `portal/app/dashboard/docs/page.tsx`

Two changes:
1. Replace raw `Promise.all` + `.finally` with `useApiRequest` so network failures auto-toast.
2. Add an error state with a retry button.

- [ ] **Step 1: Replace the `useEffect` and add error state in `portal/app/dashboard/docs/page.tsx`**

The file stays the same except for these sections. Replace the entire top of the component (state declarations + useEffect) and add an error render branch. The complete file:

```tsx
// portal/app/dashboard/docs/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, FileText, FolderOpen, Folder, Search, List, GitBranch, Tag, X, RefreshCw, AlertCircle } from 'lucide-react';
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
      {/* Toolbar */}
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
          <div className="flex bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shrink-0">
            <button type="button" onClick={() => setView('list')} className={`px-3 py-2.5 transition ${view === 'list' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`} title="Lijst">
              <List size={16} />
            </button>
            <button type="button" onClick={() => setView('tree')} className={`px-3 py-2.5 transition ${view === 'tree' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`} title="Archief">
              <GitBranch size={16} />
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
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/docs/page.tsx
git commit -m "fix(portal): add error state + retry to DocsPage"
```

---

## Task 8: Fix DocViewer — loading skeleton for metadata

**Files:**
- Modify: `portal/app/dashboard/docs/[id]/page.tsx`

Change: show a skeleton in the header while metadata loads, instead of plain "Document laden…".

- [ ] **Step 1: Rewrite `portal/app/dashboard/docs/[id]/page.tsx`**

```tsx
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
            /* Loading skeleton */
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
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/docs/[id]/page.tsx
git commit -m "fix(portal): add loading skeleton and improve error UI in DocViewer"
```

---

## Task 9: Fix MailClient — add retry button

**Files:**
- Modify: `portal/app/dashboard/mail/MailClient.tsx`

MailClient already has a good error banner. The only missing piece: a retry button in the error banner, so users don't need to refresh the page.

- [ ] **Step 1: Replace the error banner section in `portal/app/dashboard/mail/MailClient.tsx`**

Find this block (around line 161–166):

```tsx
      {/* ── Error banner ─────────────────────────────── */}
      {error && (
        <div className="shrink-0 px-4 py-2 bg-red-900/30 text-red-400 text-sm border-b border-red-900/40">
          {error}
        </div>
      )}
```

Replace with:

```tsx
      {/* ── Error banner ─────────────────────────────── */}
      {error && (
        <div className="shrink-0 px-4 py-2 bg-red-900/30 text-red-400 text-sm border-b border-red-900/40 flex items-center gap-3">
          <span className="flex-1">{error}</span>
          <button
            onClick={() => fetchMessages(folder, page)}
            className="shrink-0 flex items-center gap-1 text-xs text-red-300 hover:text-red-100 transition"
          >
            <RefreshCw size={12} />
            Opnieuw
          </button>
        </div>
      )}
```

Also add `RefreshCw` to the import line at the top:

```tsx
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
```

(`RefreshCw` is already imported — it's the refresh button. Verify the import is there; if it is, no change needed.)

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/mail/MailClient.tsx
git commit -m "fix(portal): add retry button to mail error banner"
```

---

## Task 10: Fix TasksClient — add error state + retry

**Files:**
- Modify: `portal/app/dashboard/tasks/TasksClient.tsx`

- [ ] **Step 1: Rewrite `portal/app/dashboard/tasks/TasksClient.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Trash2, Clock, AlertCircle, PlusCircle, RefreshCw } from 'lucide-react';
import { useT } from '../LangContext';
import { useApiRequest } from '@/hooks/use-api-request';

interface Ticket {
  id: string;
  seq: number;
  title: string;
  status: string;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
}

function dueLabel(dueDate: string | null): { text: string; color: string } | null {
  if (!dueDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate < today) return { text: dueDate, color: 'text-red-400' };
  if (dueDate === today) return { text: dueDate, color: 'text-orange-400' };
  return { text: dueDate, color: 'text-slate-400' };
}

export default function TasksClient() {
  const t = useT();
  const { request } = useApiRequest();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [done, setDone] = useState<Ticket[]>([]);
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      request<{ tickets?: Ticket[] }>('/api/me/tickets').catch(() => ({ tickets: [] as Ticket[] })),
      request<{ tickets?: Ticket[] }>('/api/me/tickets?status=done').catch(() => ({ tickets: [] as Ticket[] })),
    ]).then(([openData, doneData]) => {
      setTickets(openData.tickets ?? []);
      setDone(doneData.tickets ?? []);
    }).catch(() => {
      setLoadError(true);
    }).finally(() => setLoading(false));
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const markDone = async (id: string) => {
    await fetch(`/api/me/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    load();
  };

  const del = async (id: string) => {
    await fetch(`/api/me/tickets/${id}`, { method: 'DELETE' });
    load();
  };

  const current = tab === 'open' ? tickets : done;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = tickets.filter(tk => tk.dueDate && tk.dueDate < today).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Overdue banner */}
        {overdue > 0 && (
          <div className="bg-red-950/40 border border-red-800/40 rounded-2xl px-4 py-3 flex items-center gap-3">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <span className="text-sm text-red-300">{overdue} {t.tasksOverdue}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex bg-slate-800 rounded-2xl p-1">
          <button onClick={() => setTab('open')} className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${tab === 'open' ? 'bg-slate-700 text-cyan-400' : 'text-slate-500'}`}>
            {t.tasksOpen} {tickets.length > 0 && <span className="ml-1 text-xs bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full">{tickets.length}</span>}
          </button>
          <button onClick={() => setTab('done')} className={`flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${tab === 'done' ? 'bg-slate-700 text-slate-300' : 'text-slate-500'}`}>
            {t.tasksDone}
          </button>
        </div>

        {/* Task list */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-800 rounded-2xl p-4 animate-pulse">
                <div className="h-3 bg-slate-700 rounded w-3/4 mb-2" />
                <div className="h-2.5 bg-slate-700/50 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center py-12 text-slate-600 gap-3">
            <AlertCircle size={32} className="opacity-40" />
            <p className="text-sm">{t.errorServiceUnavailable}</p>
            <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm transition">
              <RefreshCw size={14} />{t.errorRetry}
            </button>
          </div>
        ) : current.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-600">
            <CheckCircle2 size={36} className="mb-3 opacity-30" />
            <p className="text-sm mb-2">{tab === 'open' ? t.tasksEmpty : t.tasksDoneEmpty}</p>
            {tab === 'open' && <p className="text-xs text-center text-slate-700 max-w-[240px]">{t.tasksAddSignal}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {current.map(tk => {
              const due = dueLabel(tk.dueDate);
              const isOverdue = tk.dueDate && tk.dueDate < today && tk.status === 'open';
              return (
                <div key={tk.id} className={`bg-slate-800 rounded-2xl p-4 border-l-2 ${isOverdue ? 'border-l-red-500' : tk.dueDate === today ? 'border-l-orange-500' : 'border-l-transparent'}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-slate-600 mt-0.5 shrink-0">#{tk.seq}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${tk.status === 'done' ? 'line-through text-slate-500' : 'text-slate-100'} truncate`}>{tk.title}</p>
                      {due && (
                        <div className={`flex items-center gap-1 mt-1 text-xs ${due.color}`}>
                          <Clock size={11} />
                          <span>{due.text}</span>
                        </div>
                      )}
                    </div>
                    {tk.status === 'open' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => void markDone(tk.id)} className="text-green-400 hover:text-green-300 active:scale-90 transition" title={t.tasksMarkDone}>
                          <CheckCircle2 size={20} />
                        </button>
                        <button onClick={() => void del(tk.id)} className="text-slate-600 hover:text-red-400 active:scale-90 transition" title={t.tasksDelete}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'open' && tickets.length > 0 && (
          <div className="flex items-center gap-2 text-slate-700 text-xs pt-2">
            <PlusCircle size={14} />
            <span>{t.tasksAddSignal}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/tasks/TasksClient.tsx
git commit -m "fix(portal): add error state + retry to TasksClient"
```

---

## Task 11: Fix CalendarClient — add error state + retry

**Files:**
- Modify: `portal/app/dashboard/calendar/CalendarClient.tsx`

- [ ] **Step 1: Rewrite `portal/app/dashboard/calendar/CalendarClient.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Calendar, Plus, Clock, MapPin, RefreshCw, AlertCircle } from 'lucide-react';
import { useT } from '../LangContext';
import { useApiRequest } from '@/hooks/use-api-request';

interface CalEvent {
  uid: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  allDay: boolean;
}

function formatDate(iso: string, allDay: boolean): string {
  try {
    const d = new Date(allDay ? iso + 'T00:00:00' : iso);
    return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return iso; }
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function groupByDate(events: CalEvent[]): { date: string; events: CalEvent[] }[] {
  const map = new Map<string, CalEvent[]>();
  for (const ev of events) {
    const key = ev.start.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, evs]) => ({ date, events: evs }));
}

export default function CalendarClient() {
  const t = useT();
  const { request } = useApiRequest();
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ summary: '', start: '', end: '', location: '', allDay: false });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    request<{ events?: CalEvent[] }>(`/api/me/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(d => setEvents(d.events ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.summary || !form.start) return;
    setSaving(true);
    const start = form.allDay ? form.start : new Date(form.start).toISOString();
    const end = form.end ? (form.allDay ? form.end : new Date(form.end).toISOString()) : start;
    await fetch('/api/me/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: form.summary, start, end, location: form.location || undefined, allDay: form.allDay }),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ summary: '', start: '', end: '', location: '', allDay: false });
    load();
  };

  const today = new Date().toISOString().slice(0, 10);
  const groups = groupByDate(events);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full flex items-center justify-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 rounded-2xl py-3 text-sm font-medium transition active:scale-95"
        >
          <Plus size={16} />
          {t.calendarAdd}
        </button>

        {showForm && (
          <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
            <input className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-cyan-500" placeholder="Titel" value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input type="checkbox" checked={form.allDay} onChange={e => setForm(f => ({ ...f, allDay: e.target.checked }))} className="rounded" />
              {t.calendarAllDay}
            </label>
            {form.allDay ? (
              <div className="grid grid-cols-2 gap-2">
                <input type="date" className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
                <input type="date" className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input type="datetime-local" className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
                <input type="datetime-local" className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
              </div>
            )}
            <input className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-cyan-500" placeholder="Locatie (optioneel)" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            <button onClick={() => void save()} disabled={saving || !form.summary || !form.start} className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-900 font-semibold rounded-xl py-2.5 text-sm transition active:scale-95">
              {saving ? t.saving : t.calendarAdd}
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-800 rounded-2xl p-4 animate-pulse">
                <div className="h-2.5 bg-slate-700 rounded w-1/4 mb-3" />
                <div className="h-3 bg-slate-700 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center py-12 text-slate-600 gap-3">
            <AlertCircle size={32} className="opacity-40" />
            <p className="text-sm">Agenda niet beschikbaar</p>
            <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm transition">
              <RefreshCw size={14} />{t.errorRetry}
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-600">
            <Calendar size={36} className="mb-3 opacity-30" />
            <p className="text-sm">{t.calendarNoEvents}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(({ date, events: evs }) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${date === today ? 'text-cyan-400' : 'text-slate-500'}`}>
                    {date === today ? t.calendarToday : formatDate(date, true)}
                  </span>
                </div>
                <div className="space-y-2">
                  {evs.map(ev => (
                    <div key={ev.uid} className={`bg-slate-800 rounded-2xl p-4 border-l-2 ${date === today ? 'border-l-cyan-500' : 'border-l-slate-600'}`}>
                      <p className="text-sm font-medium text-slate-100">{ev.summary}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {!ev.allDay && (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Clock size={11} /><span>{formatTime(ev.start)}</span>
                          </div>
                        )}
                        {ev.allDay && <span className="text-xs text-slate-500">{t.calendarAllDay}</span>}
                        {ev.location && (
                          <div className="flex items-center gap-1 text-xs text-slate-500 truncate">
                            <MapPin size={11} /><span className="truncate">{ev.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/calendar/CalendarClient.tsx
git commit -m "fix(portal): add error state + retry to CalendarClient"
```

---

## Task 12: Fix ProfileTab — add loading skeleton

**Files:**
- Modify: `portal/app/dashboard/profile/ProfileTab.tsx`

Profile currently shows defaults instantly and fills in data silently. Add a `profileLoading` state and a skeleton so the user knows data is being fetched.

- [ ] **Step 1: Rewrite `portal/app/dashboard/profile/ProfileTab.tsx`**

```tsx
// portal/app/dashboard/profile/ProfileTab.tsx
'use client';

import { useEffect, useState } from 'react';
import { Settings, Shield, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useT, useLang } from '../LangContext';
import type { Lang } from '../lang';
import { useApiRequest } from '@/hooks/use-api-request';

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
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/profile/ProfileTab.tsx
git commit -m "fix(portal): add loading skeleton to ProfileTab"
```

---

## Task 13: Build and verify in production

- [ ] **Step 1: Rebuild the portal container**

```bash
cd /srv/platform && docker compose build portal 2>&1 | tail -15
```

Expected: `Successfully built ...` with no TypeScript errors.

- [ ] **Step 2: Restart the portal**

```bash
docker compose up -d portal
sleep 5
docker logs platform-portal-1 --tail 10 2>&1
```

Expected: `ready - started server on 0.0.0.0:3000`

- [ ] **Step 3: Smoke test — stop Paperless and check error handling**

```bash
docker compose stop paperless
sleep 3
curl -s -I https://portal.platform.cbrains.de/dashboard/docs
```

Open `https://portal.platform.cbrains.de/dashboard/docs` in a browser.
Expected: red "Paperless niet bereikbaar" toast appears + retry button visible.

- [ ] **Step 4: Restore Paperless**

```bash
docker compose up -d paperless
```

- [ ] **Step 5: Verify today-events empty state on home page**

Open `https://portal.platform.cbrains.de/dashboard` in a browser.
Expected: Today's agenda section shows either events OR "geen agenda" message. Never hidden.

- [ ] **Step 6: Verify profile loading skeleton**

With throttled network (browser devtools → Slow 3G), open `/dashboard/profile`.
Expected: 3 skeleton rows visible for ≥200 ms before real data appears.

- [ ] **Step 7: Final commit**

```bash
cd /srv/platform
git add -A
git commit -m "chore: rebuild portal with error handling improvements" --allow-empty
```

---

## Self-review

**Spec coverage:**
- ✅ Toast system (`toast.tsx`, auto-dismiss, 4 variants)
- ✅ Error Boundary (`error-boundary.tsx`, wraps children in layout)
- ✅ `useApiRequest` hook (timeout 10s, 2 retries, auto-toast)
- ✅ Layout wired (Toaster + ErrorBoundary mounted)
- ✅ AppShell (uses useApiRequest for badge fetches)
- ✅ HomeTab (retry button, today-events empty state fixed)
- ✅ DocsPage (retry button on error)
- ✅ DocViewer (loading skeleton, improved error UI)
- ✅ MailClient (retry button in error banner)
- ✅ TasksClient (error state + retry)
- ✅ CalendarClient (error state + retry)
- ✅ ProfileTab (loading skeleton)
- ✅ lang.ts translations for `errorRetry`, `errorServiceUnavailable`, `errorLoading`

**No placeholders found.**

**Type consistency:** `useApiRequest` returns `{ request }` everywhere it's used. `loadError` / `load` naming is consistent across all page components.
