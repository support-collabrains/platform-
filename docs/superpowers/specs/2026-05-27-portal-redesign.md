# Portal Redesign — Implementation Spec

**Goal:** Replace the fragmented portal with a single-shell app: bottom-tab navigation, full responsiveness, logout always reachable, all features in one cohesive UX.

**Architecture:** One persistent app shell (`app/dashboard/layout.tsx`) renders a sticky bottom nav bar. Each tab is a Next.js route. No hard page navigations between features — everything lives within `/dashboard/*`. The mail client stays as an inline client component; documents and profile become their own dedicated tab pages.

**Tech Stack:** Next.js 16 app router, Tailwind CSS v4, lucide-react, existing API routes unchanged.

---

## Routes after redesign

| Route | Tab | Content |
|---|---|---|
| `/dashboard` | 🏠 Home | Activity feed (notifications), 3-stat row, quick doc list |
| `/dashboard/mail` | ✉️ Mail | Full IMAP mail client (MailClient.tsx, redesigned for mobile) |
| `/dashboard/docs` | 📄 Docs | Document list with search, links to Paperless |
| `/dashboard/profile` | 👤 Profiel | User info, toggle preferences, language picker, logout, admin link |

---

## File changes

### New: `app/dashboard/layout.tsx`
Server component. Reads `x-authentik-username` and `x-authentik-groups` headers. Renders `<AppShell>` which wraps children with a sticky bottom nav and a compact top header showing the current page title + avatar.

```
┌─────────────────────────────────┐
│ [icon] Page title          [S]  │  ← compact header (40px)
├─────────────────────────────────┤
│                                 │
│         {children}              │  ← scrollable content
│                                 │
├─────────────────────────────────┤
│  🏠    ✉️ ●  📄    👤          │  ← bottom nav (56px, safe-area aware)
└─────────────────────────────────┘
```

Bottom nav items: Home, Mail (with unread badge), Docs, Profiel. Active item has cyan underline indicator. Nav uses `usePathname()` to highlight current tab.

### Modified: `app/dashboard/page.tsx`
Remove DashboardClient import. Becomes a thin server component rendering `<HomeTab username={...} />`.

### New: `app/dashboard/HomeTab.tsx` (client component)
Replaces `DashboardClient.tsx`. Shows:
- 3-stat cards row: docs count, unread mail, unread notifications
- "Recente activiteit" list: notification feed with status badges (done/processing/failed)
- Empty state with icon when no activity

### Modified: `app/dashboard/mail/page.tsx`
Remove `<MailClient />` wrapper page. Becomes just `<MailClient />` directly (no extra layout since the shell provides the header).

### Modified: `app/dashboard/mail/MailClient.tsx`
Redesign for mobile-first:
- Remove internal back-arrow (shell handles navigation)
- Folder selector: horizontal scrollable chip row at top (not fixed-width sidebar)
- On mobile: message list fills full width; tapping a message navigates to detail view (push state, not split pane)
- On ≥768px tablet/desktop: restore 3-column layout (folders sidebar + list + detail)
- Pagination: "Load more" button at bottom of list instead of prev/next buttons

### New: `app/dashboard/docs/page.tsx`
Client component. Fetches `/api/me/documents`. Renders:
- Search input (client-side filter on title)
- Sorted list (newest first) with doc title, date, and arrow icon
- Tapping a doc opens Paperless URL in new tab: `https://docs.${NEXT_PUBLIC_PRIMARY_DOMAIN}/documents/{id}/`
- Empty state with icon

### New: `app/dashboard/profile/page.tsx`
Server component reading username + email from Authentik headers. Passes to `<ProfileTab>` client component. Shows:
- Avatar + username + email card
- Toggle list: `signal_doc_notify`, `signal_digest_mode`
- Language selector (NL/DE/EN)
- If admin: "Beheer" button linking to `/admin`
- "Uitloggen" button: red, links to `/outpost.goauthentik.io/sign_out`

### Modified: `app/layout.tsx`
No change needed.

### Delete: `app/dashboard/DashboardClient.tsx`
Replaced by `HomeTab.tsx`. Remove file.

### Delete: `app/dashboard/components/` (all files)
`DocumentsList.tsx`, `LanguageSelector.tsx`, `NotificationLog.tsx`, `PreferencesPanel.tsx`, `PreferenceToggle.tsx`, `ProfilePanel.tsx`, `TicketsList.tsx` — all unused after redesign, remove.

---

## AppShell component

`app/dashboard/AppShell.tsx` — client component (needs `usePathname`):

```typescript
'use client';
// Props: username, isAdmin, unreadMail (badge count from stats)
// Renders: top header + {children} + bottom nav
// Bottom nav reads pathname to set active tab
// Unread mail badge: fetched once on mount via /api/me/mail/stats, stored in context or prop
```

To avoid per-page stats fetches, the shell fetches `/api/me/mail/stats` once on mount and shows the unread count badge on the Mail tab. This is the only shared data fetch.

---

## Logout

Link to `/outpost.goauthentik.io/sign_out` — Authentik embedded outpost handles session invalidation and redirects to login. No API call needed.

---

## Responsive breakpoints

- `< 768px` (mobile): bottom nav, full-width content, mail list is full-screen, detail is push overlay
- `≥ 768px` (tablet/desktop): bottom nav becomes left sidebar (64px icon-only), mail uses 3-column layout

---

## No-change scope

- All existing `/api/me/*` Next.js route handlers: untouched
- NestJS API: untouched
- Admin page (`/admin`, `AdminClient.tsx`): untouched
- Setup wizard (`/setup`): untouched
- Bootstrap flow: untouched
