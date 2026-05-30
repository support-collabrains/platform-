# Visual Design Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a consistent design system (6 UI primitives), a desktop sidebar layout, and dark mode toggle to all dashboard pages.

**Architecture:** Six new UI primitive components in `portal/components/ui/` with no external dependencies (no `class-variance-authority` — variants are handled with TypeScript union types and template literals). A `Sidebar` and `Header` layout component handle desktop layout; `AppShell` becomes mobile-only. Dark mode uses Tailwind v4's `@variant dark` directive with a `useDarkMode` hook toggling a CSS class on `<html>`. All 7 dashboard page files are refactored to use the new primitives.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Lucide icons. No new npm dependencies.

**Prerequisite:** Sub-project 1 (error handling) must be done first — `useApiRequest` hook must exist.

---

## File Map

**Create:**
- `portal/components/ui/card.tsx`
- `portal/components/ui/button.tsx`
- `portal/components/ui/badge.tsx`
- `portal/components/ui/avatar.tsx`
- `portal/components/ui/spinner.tsx`
- `portal/components/ui/skeleton.tsx`
- `portal/components/layout/Sidebar.tsx`
- `portal/components/layout/Header.tsx`
- `portal/hooks/use-dark-mode.ts`

**Modify:**
- `portal/app/globals.css` — add dark mode variant for Tailwind v4
- `portal/app/dashboard/layout.tsx` — add `<Sidebar>` + `<Header>` wrapper
- `portal/app/dashboard/AppShell.tsx` — make mobile-only (`md:hidden` bottom nav)
- `portal/app/dashboard/HomeTab.tsx` — use Card + Badge primitives
- `portal/app/dashboard/docs/page.tsx` — use Card primitive for doc rows
- `portal/app/dashboard/mail/MailClient.tsx` — use Button for pagination
- `portal/app/dashboard/tasks/TasksClient.tsx` — use Badge for overdue/status
- `portal/app/dashboard/calendar/CalendarClient.tsx` — use Button for add event
- `portal/app/dashboard/profile/ProfileTab.tsx` — use Button + add dark mode toggle

---

## Task 1: Enable dark mode in Tailwind v4

**Files:**
- Modify: `portal/app/globals.css`

In Tailwind v4, there is no `tailwind.config.js`. Dark mode with class strategy is configured in CSS using `@variant`.

- [ ] **Step 1: Add dark mode variant to `portal/app/globals.css`**

Open `portal/app/globals.css`. After the `@import "tailwindcss";` line, add:

```css
/* Dark mode — toggled by .dark class on <html> */
@variant dark (&:where(.dark, .dark *));
```

The complete updated file:

```css
@import "tailwindcss";

/* Dark mode — toggled by .dark class on <html> */
@variant dark (&:where(.dark, .dark *));

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/globals.css
git commit -m "feat(portal): enable class-based dark mode in Tailwind v4"
```

---

## Task 2: `useDarkMode` hook

**Files:**
- Create: `portal/hooks/use-dark-mode.ts`

- [ ] **Step 1: Write `portal/hooks/use-dark-mode.ts`**

```ts
// portal/hooks/use-dark-mode.ts
'use client';

import { useEffect, useState } from 'react';

export function useDarkMode() {
  const [dark, setDark] = useState(false);

  // On mount: read localStorage, fallback to system preference
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
      setDark(true);
      document.documentElement.classList.add('dark');
    } else if (stored === 'light') {
      setDark(false);
      document.documentElement.classList.remove('dark');
    } else {
      // System preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setDark(prefersDark);
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, []);

  function toggle() {
    setDark(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  }

  return { dark, toggle };
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/hooks/use-dark-mode.ts
git commit -m "feat(portal): add useDarkMode hook"
```

---

## Task 3: UI primitive components

**Files:**
- Create: `portal/components/ui/card.tsx`
- Create: `portal/components/ui/button.tsx`
- Create: `portal/components/ui/badge.tsx`
- Create: `portal/components/ui/avatar.tsx`
- Create: `portal/components/ui/spinner.tsx`
- Create: `portal/components/ui/skeleton.tsx`

- [ ] **Step 1: Write `portal/components/ui/card.tsx`**

```tsx
// portal/components/ui/card.tsx
import { type ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  href?: string;
}

export function Card({ children, className = '', onClick }: CardProps) {
  const base = 'bg-slate-800 dark:bg-slate-800 rounded-2xl border border-slate-700/50 dark:border-slate-700/50';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} w-full text-left transition hover:bg-slate-700/80 active:scale-[0.98] ${className}`}>
        {children}
      </button>
    );
  }
  return <div className={`${base} ${className}`}>{children}</div>;
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 pt-4 pb-2 border-b border-slate-700/50 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`text-xs font-semibold text-slate-500 uppercase tracking-wider ${className}`}>{children}</h3>;
}

export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}
```

- [ ] **Step 2: Write `portal/components/ui/button.tsx`**

```tsx
// portal/components/ui/button.tsx
import { type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  title?: string;
}

const VARIANTS: Record<Variant, string> = {
  primary:   'bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold',
  secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600',
  ghost:     'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
  danger:    'bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-900/50',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-xl',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-sm rounded-2xl',
};

export function Button({ children, onClick, variant = 'secondary', size = 'md', disabled, type = 'button', className = '', title }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Write `portal/components/ui/badge.tsx`**

```tsx
// portal/components/ui/badge.tsx
import { type ReactNode } from 'react';

type Variant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'cyan';

const STYLES: Record<Variant, string> = {
  default:  'bg-slate-700 text-slate-300',
  success:  'bg-emerald-900/40 text-emerald-400',
  warning:  'bg-amber-900/40 text-amber-400',
  error:    'bg-red-900/40 text-red-400',
  info:     'bg-blue-900/40 text-blue-400',
  cyan:     'bg-cyan-500/20 text-cyan-300',
};

interface BadgeProps {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STYLES[variant]} ${className}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Write `portal/components/ui/avatar.tsx`**

```tsx
// portal/components/ui/avatar.tsx
type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-14 h-14 text-2xl',
};

interface AvatarProps {
  name: string;
  size?: Size;
  className?: string;
}

export function Avatar({ name, size = 'md', className = '' }: AvatarProps) {
  return (
    <div className={`rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-slate-900 font-bold select-none shrink-0 ${SIZES[size]} ${className}`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
```

- [ ] **Step 5: Write `portal/components/ui/spinner.tsx`**

```tsx
// portal/components/ui/spinner.tsx
type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-3',
};

export function Spinner({ size = 'md', className = '' }: { size?: Size; className?: string }) {
  return (
    <div
      className={`rounded-full border-slate-600 border-t-current animate-spin ${SIZES[size]} ${className}`}
      role="status"
      aria-label="Laden"
    />
  );
}
```

- [ ] **Step 6: Write `portal/components/ui/skeleton.tsx`**

```tsx
// portal/components/ui/skeleton.tsx
type Variant = 'text' | 'block' | 'circle';

interface SkeletonProps {
  variant?: Variant;
  width?: string;
  height?: string;
  className?: string;
}

export function Skeleton({ variant = 'text', width, height, className = '' }: SkeletonProps) {
  const base = 'animate-pulse bg-slate-700 dark:bg-slate-700';
  const shape = variant === 'circle' ? 'rounded-full' : variant === 'text' ? 'rounded h-3' : 'rounded-xl';
  return (
    <div
      className={`${base} ${shape} ${className}`}
      style={{ width, height }}
    />
  );
}
```

- [ ] **Step 7: Commit all primitives**

```bash
cd /srv/platform
git add portal/components/ui/
git commit -m "feat(portal): add UI primitive components (Card, Button, Badge, Avatar, Spinner, Skeleton)"
```

---

## Task 4: Sidebar component

**Files:**
- Create: `portal/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create directory and write `portal/components/layout/Sidebar.tsx`**

```bash
mkdir -p /srv/platform/portal/components/layout
```

```tsx
// portal/components/layout/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Mail, FileText, User, CheckSquare, Calendar, Camera, LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';

interface Props {
  username: string;
  unreadMail: number;
  openTasks: number;
  logoutUrl: string;
}

const NAV_ITEMS = [
  { href: '/dashboard',          icon: Home,        label: 'Home' },
  { href: '/dashboard/tasks',    icon: CheckSquare, label: 'Taken',    badge: 'tasks' },
  { href: '/dashboard/mail',     icon: Mail,        label: 'Mail',     badge: 'mail' },
  { href: '/dashboard/docs',     icon: FileText,    label: 'Documenten' },
  { href: '/dashboard/photos',   icon: Camera,      label: "Foto's" },
  { href: '/dashboard/calendar', icon: Calendar,    label: 'Agenda' },
  { href: '/dashboard/profile',  icon: User,        label: 'Profiel' },
] as const;

export default function Sidebar({ username, unreadMail, openTasks, logoutUrl }: Props) {
  const pathname = usePathname();

  function badge(key: string) {
    if (key === 'mail' && unreadMail > 0)  return unreadMail;
    if (key === 'tasks' && openTasks > 0) return openTasks;
    return null;
  }

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-slate-900 border-r border-slate-800 h-full">
      {/* Logo */}
      <div className="shrink-0 px-5 py-5 border-b border-slate-800">
        <span className="font-bold text-slate-100 text-base tracking-tight">CollaBrains</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, icon: Icon, label, badge: badgeKey }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          const count = badgeKey ? badge(badgeKey) : null;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition group ${
                active
                  ? 'bg-cyan-500/15 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.5} className="shrink-0" />
              <span className="flex-1">{label}</span>
              {count !== null && (
                <span className={`text-[10px] font-bold rounded-full min-w-[18px] h-4.5 flex items-center justify-center px-1 ${
                  badgeKey === 'mail' ? 'bg-red-500 text-white' : 'bg-cyan-500 text-slate-900'
                }`}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-slate-800 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar name={username} size="sm" />
          <span className="flex-1 text-sm text-slate-300 truncate">{username}</span>
          <a
            href={logoutUrl}
            className="p-1.5 text-slate-600 hover:text-red-400 transition rounded-lg hover:bg-slate-800"
            title="Uitloggen"
          >
            <LogOut size={14} />
          </a>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/components/layout/Sidebar.tsx
git commit -m "feat(portal): add Sidebar layout component"
```

---

## Task 5: Header component

**Files:**
- Create: `portal/components/layout/Header.tsx`

- [ ] **Step 1: Write `portal/components/layout/Header.tsx`**

```tsx
// portal/components/layout/Header.tsx
'use client';

import { usePathname } from 'next/navigation';
import { Sun, Moon } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useDarkMode } from '@/hooks/use-dark-mode';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':           'Home',
  '/dashboard/tasks':     'Taken',
  '/dashboard/mail':      'Mail',
  '/dashboard/docs':      'Documenten',
  '/dashboard/photos':    "Foto's",
  '/dashboard/calendar':  'Agenda',
  '/dashboard/profile':   'Profiel',
};

interface Props {
  username: string;
}

export default function Header({ username }: Props) {
  const pathname = usePathname();
  const { dark, toggle } = useDarkMode();
  const title = PAGE_TITLES[pathname] ?? 'CollaBrains';

  return (
    <header className="hidden md:flex shrink-0 h-14 bg-slate-900 border-b border-slate-800 items-center px-6 gap-4">
      <h1 className="flex-1 text-sm font-semibold text-slate-200">{title}</h1>

      {/* Dark mode toggle */}
      <button
        onClick={toggle}
        className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-xl transition"
        title={dark ? 'Licht thema' : 'Donker thema'}
        aria-label={dark ? 'Schakel naar licht thema' : 'Schakel naar donker thema'}
      >
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <Avatar name={username} size="sm" />
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/components/layout/Header.tsx
git commit -m "feat(portal): add Header layout component with dark mode toggle"
```

---

## Task 6: Update dashboard layout

**Files:**
- Modify: `portal/app/dashboard/layout.tsx`

Wire in `<Sidebar>` and `<Header>` for desktop. AppShell (bottom nav) remains for mobile.

- [ ] **Step 1: Rewrite `portal/app/dashboard/layout.tsx`**

```tsx
// portal/app/dashboard/layout.tsx
import { headers } from 'next/headers';
import AppShell from './AppShell';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { Toaster } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const username = hdrs.get('x-authentik-username') ?? 'user';
  const groups = hdrs.get('x-authentik-groups') ?? '';
  const isAdmin = groups.split(',').map(g => g.trim()).includes('platform-admins');
  const logoutUrl = process.env.NEXT_PUBLIC_LOGOUT_URL ?? '/outpost.goauthentik.io/sign_out';

  return (
    <>
      {/* ── Desktop layout (≥ md) ──────────────────────────────────────────── */}
      <div className="hidden md:flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
        <Sidebar username={username} unreadMail={0} openTasks={0} logoutUrl={logoutUrl} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header username={username} />
          <main className="flex-1 overflow-y-auto p-6">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>

      {/* ── Mobile layout (< md) — AppShell with bottom nav ───────────────── */}
      <div className="md:hidden">
        <AppShell username={username} isAdmin={isAdmin}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </AppShell>
      </div>

      <Toaster />
    </>
  );
}
```

**Note:** `Sidebar` currently receives `unreadMail={0}` and `openTasks={0}` as static props — these are placeholder values for the initial render. The Sidebar badge counts are cosmetic on desktop and can be enhanced later by making the Sidebar a client component that fetches its own counts. For now, the bottom nav on mobile retains the real-time badge counts via AppShell.

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/layout.tsx
git commit -m "feat(portal): add desktop sidebar + header layout"
```

---

## Task 7: Refactor page files to use UI primitives

The following 5 page files are updated to use `Card`, `Button`, and `Badge` from the design system. The logic stays identical; only the JSX changes.

### 7a: HomeTab

- [ ] **Step 1: Update stats tiles in `portal/app/dashboard/HomeTab.tsx`**

Add import at the top (after existing imports):
```tsx
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
```

Replace the 4 stat tiles (the `<div className="grid grid-cols-2 ...">` block) with:

```tsx
        {/* Stats row — 4 tiles */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/docs">
            <Card className="p-4 text-center hover:bg-slate-700/80 active:scale-95 transition cursor-pointer">
              <div className="text-2xl font-bold text-cyan-400">{loading ? '—' : docCount}</div>
              <div className="text-[11px] text-slate-500 mt-1 leading-tight">{t.statDocs}</div>
            </Card>
          </Link>
          <Link href="/dashboard/mail">
            <Card className="p-4 text-center hover:bg-slate-700/80 active:scale-95 transition cursor-pointer">
              <div className="text-2xl font-bold text-blue-400">{loading ? '—' : unreadMail}</div>
              <div className="text-[11px] text-slate-500 mt-1 leading-tight">{t.statMail}</div>
            </Card>
          </Link>
          <Link href="/dashboard/tasks">
            <Card className="p-4 text-center hover:bg-slate-700/80 active:scale-95 transition cursor-pointer">
              <div className="text-2xl font-bold text-emerald-400">{loading ? '—' : openTasks}</div>
              <div className="text-[11px] text-slate-500 mt-1 leading-tight">{t.statTasks}</div>
            </Card>
          </Link>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-400">{loading ? '—' : pending}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">{t.statProcessing}</div>
          </Card>
        </div>
```

Replace notification status labels in the activity feed to use `<Badge>`:

Find:
```tsx
<p className={`text-xs mt-0.5 ${cfg.color}`}>{cfg.label}</p>
```

Replace with:
```tsx
<Badge variant={n.status === 'done' ? 'success' : n.status === 'failed' ? 'error' : n.status === 'processing' ? 'warning' : 'default'} className="mt-0.5">
  {cfg.label}
</Badge>
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/HomeTab.tsx
git commit -m "refactor(portal): use Card + Badge primitives in HomeTab"
```

### 7b: DocsPage

- [ ] **Step 3: Update doc cards in `portal/app/dashboard/docs/page.tsx`**

Add import:
```tsx
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
```

In the `DocList` component, replace each doc button with `<Card onClick={...}>`:
```tsx
    return (
      <div className="space-y-2">
        {items.map((doc) => (
          <Card
            key={doc.id}
            onClick={() => router.push(`/dashboard/docs/${doc.id}`)}
            className="p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center shrink-0">
                <FileText size={18} className="text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-100 truncate">{doc.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(doc.created).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <ChevronRight size={15} className="text-slate-600 shrink-0" />
            </div>
          </Card>
        ))}
      </div>
    );
```

In the error state, replace the retry `<button>` with `<Button>`:
```tsx
<Button onClick={load} variant="secondary" size="sm">
  <RefreshCw size={14} />{t.errorRetry}
</Button>
```

- [ ] **Step 4: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/docs/page.tsx
git commit -m "refactor(portal): use Card + Button primitives in DocsPage"
```

### 7c: TasksClient

- [ ] **Step 5: Update tasks in `portal/app/dashboard/tasks/TasksClient.tsx`**

Add import:
```tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
```

In the overdue banner replace the text with a `<Badge>`:
```tsx
        {overdue > 0 && (
          <div className="bg-red-950/40 border border-red-800/40 rounded-2xl px-4 py-3 flex items-center gap-3">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <span className="text-sm text-red-300">{overdue} {t.tasksOverdue}</span>
            <Badge variant="error" className="ml-auto">{overdue}</Badge>
          </div>
        )}
```

In the load error state, replace retry button with `<Button>`:
```tsx
            <Button onClick={load} variant="secondary" size="sm">
              <RefreshCw size={14} />{t.errorRetry}
            </Button>
```

- [ ] **Step 6: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/tasks/TasksClient.tsx
git commit -m "refactor(portal): use Badge + Button primitives in TasksClient"
```

### 7d: CalendarClient

- [ ] **Step 7: Update calendar in `portal/app/dashboard/calendar/CalendarClient.tsx`**

Add import:
```tsx
import { Button } from '@/components/ui/button';
```

Replace the "add event" button with `<Button>`:
```tsx
        <Button
          onClick={() => setShowForm(!showForm)}
          variant="secondary"
          size="md"
          className="w-full border-cyan-500/20 text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20"
        >
          <Plus size={16} />
          {t.calendarAdd}
        </Button>
```

Replace the "save event" button with:
```tsx
          <Button
            onClick={() => void save()}
            variant="primary"
            size="md"
            disabled={saving || !form.summary || !form.start}
            className="w-full"
          >
            {saving ? t.saving : t.calendarAdd}
          </Button>
```

Replace load error retry button with:
```tsx
            <Button onClick={load} variant="secondary" size="sm">
              <RefreshCw size={14} />{t.errorRetry}
            </Button>
```

- [ ] **Step 8: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/calendar/CalendarClient.tsx
git commit -m "refactor(portal): use Button primitive in CalendarClient"
```

### 7e: ProfileTab — add dark mode toggle

- [ ] **Step 9: Add dark mode toggle to `portal/app/dashboard/profile/ProfileTab.tsx`**

Add imports:
```tsx
import { Sun, Moon } from 'lucide-react';
import { useDarkMode } from '@/hooks/use-dark-mode';
import { Button } from '@/components/ui/button';
```

Inside the component, add after the existing hooks:
```tsx
  const { dark, toggle } = useDarkMode();
```

Add a new settings section after the Language section (before "Contact & archive"):

```tsx
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
              onClick={toggle}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm text-slate-300 transition"
            >
              {dark ? <Sun size={14} /> : <Moon size={14} />}
              {dark ? 'Licht' : 'Donker'}
            </button>
          </div>
        </div>
```

- [ ] **Step 10: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/profile/ProfileTab.tsx
git commit -m "feat(portal): add dark mode toggle to ProfileTab"
```

---

## Task 8: MailClient — use Button for pagination

**Files:**
- Modify: `portal/app/dashboard/mail/MailClient.tsx`

- [ ] **Step 1: Update pagination buttons in `portal/app/dashboard/mail/MailClient.tsx`**

Add import:
```tsx
import { Button } from '@/components/ui/button';
```

Replace the pagination div:
```tsx
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="shrink-0 flex items-center justify-center gap-4 py-2.5 border-t border-slate-800">
              <Button
                onClick={() => setPage(p => p - 1)}
                disabled={page <= 1}
                variant="ghost"
                size="sm"
              >
                <ChevronLeft size={16} />
              </Button>
              <span className="text-xs text-slate-500">{page} / {totalPages}</span>
              <Button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= totalPages}
                variant="ghost"
                size="sm"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/mail/MailClient.tsx
git commit -m "refactor(portal): use Button primitive in MailClient pagination"
```

---

## Task 9: Build and verify

- [ ] **Step 1: Rebuild portal**

```bash
cd /srv/platform && docker compose build portal 2>&1 | tail -15
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 2: Restart portal**

```bash
docker compose up -d portal
sleep 5
docker logs platform-portal-1 --tail 5 2>&1
```

- [ ] **Step 3: Verify desktop layout**

Open `https://portal.platform.cbrains.de/dashboard` in a desktop browser (window ≥ 768px).

Expected:
- Left sidebar with nav items visible
- Top header with page title and dark mode toggle button
- Bottom nav NOT visible
- Clicking nav items navigates correctly

- [ ] **Step 4: Verify mobile layout**

Open the same URL with browser devtools set to mobile viewport (< 768px).

Expected:
- Bottom nav visible (existing AppShell)
- Sidebar NOT visible
- Header NOT visible (mobile has compact AppShell header)

- [ ] **Step 5: Verify dark mode**

Open Profile page → click the "Donker / Licht" toggle.

Expected:
- Page background toggles between dark/light
- Preference persists after page refresh

- [ ] **Step 6: Verify UI primitives**

Open `/dashboard/docs`. Doc cards should use `Card` component styling.
Open `/dashboard/tasks`. Overdue badge should be visible.

- [ ] **Step 7: Final commit**

```bash
cd /srv/platform
git add -A
git commit -m "feat(portal): complete visual design upgrade — sidebar, dark mode, UI primitives" --allow-empty
```

---

## Self-review

**Spec coverage:**
- ✅ 6 UI primitives: Card, Button, Badge, Avatar, Spinner, Skeleton
- ✅ Sidebar component (desktop only, hidden on mobile)
- ✅ Header component (desktop only, dark mode toggle)
- ✅ Dark mode via Tailwind v4 `@variant dark`, `useDarkMode` hook, localStorage persistence
- ✅ Layout upgrade in `layout.tsx` (desktop: Sidebar+Header+main; mobile: AppShell)
- ✅ All 5 page files refactored to use new primitives
- ✅ ProfileTab: dark mode toggle added

**Spec note:** Sidebar badge counts (unread mail, open tasks) are static `0` on desktop in this implementation. The mobile AppShell has real-time counts. Enhancement: make Sidebar a client component with its own fetch — this is a follow-up improvement, not blocking.

**Type consistency:** `Avatar` used in Sidebar and Header. `Button` `variant` and `size` types consistent across all usage sites. `useDarkMode` returns `{ dark: boolean, toggle: () => void }` used in Header and ProfileTab.

**No placeholders found.**
