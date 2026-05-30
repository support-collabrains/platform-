# Visual Design Upgrade — Design Spec

**Date:** 2026-05-30  
**Status:** Approved  
**Scope:** CollaBrains portal — all dashboard pages

---

## Context

The portal currently uses a mobile-first bottom navigation (AppShell.tsx) with no layout for desktop screens. On a laptop, the content spans the full width with a bottom nav that looks out of place. There are no consistent UI primitives — each page invents its own card styles, buttons, and badges. Dark mode is not supported.

**Goal:** Professional desktop layout, consistent design system, dark mode.

---

## Architecture

### 1. Design System Primitives (`portal/components/ui/`)

Six small, self-contained components with no external dependencies. All use Tailwind CSS with `class-variance-authority` (cva) pattern for variant handling.

> **Dependency to add:** `class-variance-authority` (tiny, 1.4 kB). No other new dependencies.

#### `card.tsx`
```tsx
<Card>          ← bg-white dark:bg-slate-800, rounded-xl, shadow-sm, border
<CardHeader>    ← padding + border-b
<CardTitle>     ← text-base font-semibold
<CardContent>   ← padding
<CardFooter>    ← padding + border-t, flex row
```

#### `button.tsx`
Variants: `primary` (blue solid), `secondary` (slate outline), `ghost` (transparent hover), `danger` (red).  
Sizes: `sm`, `md`, `lg`.  
States: disabled (opacity-50 cursor-not-allowed), loading (spinner icon replaces label).

#### `badge.tsx`
Variants: `default` (slate), `success` (green), `warning` (amber), `error` (red), `info` (blue).  
Small pill with text, optionally with a dot indicator.

#### `avatar.tsx`
Shows user initials on a coloured background (colour derived from username hash).  
Sizes: `sm` (24px), `md` (32px), `lg` (48px).  
Optional: image URL prop for future photo support.

#### `spinner.tsx`
Replaces ad-hoc `animate-spin` Loader2 icons across all pages.  
Sizes: `sm`, `md`, `lg`. Colour: `currentColor`.

#### `skeleton.tsx`
Replaces ad-hoc `animate-pulse bg-slate-200` divs.  
Variants: `text` (h-4 rounded), `block` (arbitrary height), `circle` (for avatars).

---

### 2. Layout Upgrade

#### `portal/components/layout/Sidebar.tsx`
Desktop only (hidden below `md` breakpoint).

```
Structure:
  ┌─────────────────────┐
  │  [logo] CollaBrains  │
  │─────────────────────│
  │  ◉ Home             │
  │  ✓ Tasks       [3]  │
  │  ✉ Mail        [2]  │
  │  📄 Docs            │
  │  📷 Photos          │
  │  📅 Calendar        │
  │─────────────────────│
  │  [avatar] Jan D.    │
  │  [logout icon]      │
  └─────────────────────┘
Width: 240px fixed, full height, border-r
```

Nav items: same routes as AppShell bottom nav.  
Active item: blue background tint + bold text.  
Badges: same unread mail + open tasks counts as AppShell.

#### `portal/components/layout/Header.tsx`
Top bar, visible on all dashboard pages.

```
Structure:
  ┌──────────────────────────────────────────────┐
  │ [menu icon mobile] [page title]   [🔔] [av] │
  └──────────────────────────────────────────────┘
Height: 56px, border-b, sticky top-0
```

- Page title: derived from current route (Docs, Mail, etc.)
- Bell icon: links to `/dashboard` (notification feed in HomeTab)
- Avatar: `<Avatar>` with user initials, click → profile menu (logout, settings)
- Mobile: shows hamburger → slides in a drawer with same nav as Sidebar

#### `portal/app/dashboard/layout.tsx` (upgrade)
```tsx
<div className="flex h-screen bg-slate-50 dark:bg-slate-900">
  <Sidebar />                    {/* hidden on mobile */}
  <div className="flex flex-1 flex-col overflow-hidden">
    <Header />
    <main className="flex-1 overflow-y-auto p-4 md:p-6">
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </main>
  </div>
</div>
```

AppShell.tsx becomes mobile-only (`md:hidden`), retaining the bottom nav for phones.

---

### 3. Dark Mode

**Implementation:**
- Tailwind config: `darkMode: 'class'`
- `<html>` class toggled by a `useDarkMode()` hook
- Hook: reads from `localStorage` on mount; falls back to `prefers-color-scheme`
- Toggle: added to ProfileTab (sun/moon icon button)
- Preference persisted in localStorage (not synced to server — local-only)

**Colour mapping:**
| Light | Dark | Usage |
|-------|------|-------|
| `bg-white` | `dark:bg-slate-800` | Cards |
| `bg-slate-50` | `dark:bg-slate-900` | Page background |
| `text-slate-900` | `dark:text-slate-100` | Body text |
| `text-slate-500` | `dark:text-slate-400` | Secondary text |
| `border-slate-200` | `dark:border-slate-700` | Borders |

---

### 4. Page-by-page Refactor

Each existing page is updated to use the new primitives. The logic stays identical — only the visual markup changes.

| Page | Card used? | Button used? | Badge used? |
|------|-----------|-------------|------------|
| HomeTab | ✅ stats tiles, activity items | ✅ action buttons | ✅ notification status |
| DocsPage | ✅ document cards | ✅ filter chips, view toggle | ✅ doc type tags |
| MailClient | ✅ message rows | ✅ pagination | ✅ unread indicator |
| TasksClient | ✅ task cards | ✅ tab buttons | ✅ status (open/done/overdue) |
| CalendarClient | ✅ event cards | ✅ add event | ✅ today indicator |
| ProfileTab | ✅ settings sections | ✅ save, logout | — |
| PhotosGallery | — (image grid) | ✅ load more | — |

---

## Non-goals

- Custom font change — Geist (current) stays
- Animation library — Tailwind transitions only
- Component library migration (no shadcn, Radix, etc.)
- Server-side dark mode (avoids flash-of-unstyled-content complexity)

---

## Testing

1. Desktop (≥768px): sidebar visible, bottom nav hidden
2. Mobile (<768px): bottom nav visible, sidebar hidden
3. Dark mode toggle in profile: persists across page refresh
4. All pages render correctly in dark mode (no white-on-white text)
5. `<Card>`, `<Button>`, `<Badge>` render all variants without errors
6. Header shows correct page title on each route

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
- `portal/app/dashboard/layout.tsx`
- `portal/app/dashboard/AppShell.tsx` (mobile-only)
- `portal/app/dashboard/HomeTab.tsx`
- `portal/app/dashboard/docs/page.tsx`
- `portal/app/dashboard/docs/[id]/page.tsx`
- `portal/app/dashboard/mail/MailClient.tsx`
- `portal/app/dashboard/tasks/TasksClient.tsx`
- `portal/app/dashboard/calendar/CalendarClient.tsx`
- `portal/app/dashboard/profile/ProfileTab.tsx`
- `portal/tailwind.config.ts` (add darkMode: 'class')

**Add dependency:**
- `class-variance-authority` (via npm)
