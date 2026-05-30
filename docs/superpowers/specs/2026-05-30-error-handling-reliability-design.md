# Error Handling & Reliability — Design Spec

**Date:** 2026-05-30  
**Status:** Approved  
**Scope:** CollaBrains portal — all dashboard pages

---

## Context

Almost every page in the portal uses bare `.catch(() => {})` on all fetch calls. When a backing service (Paperless, mail server, Radicale) is unavailable, the user sees an empty page with no explanation. This is the most critical quality gap in the current UI.

**Goal:** Every failed request shows a specific, actionable message. Users can retry without refreshing. No silent failures remain.

---

## Architecture

### New shared infrastructure (3 files)

#### `portal/components/ui/toast.tsx`
A lightweight toast notification system without external dependencies.

- `<Toaster />` — renders active toasts in a fixed portal at bottom-right
- `useToast()` hook — `{ toast, dismiss }` API
- Variants: `success`, `error`, `warning`, `info`
- Auto-dismiss: error toasts after 6s, success after 3s
- Manual dismiss: ×-button on each toast
- Max 4 toasts visible at once (oldest dismissed automatically)
- Accessible: `role="alert"`, `aria-live="polite"`

#### `portal/components/ui/error-boundary.tsx`
React class component `<ErrorBoundary>`.

- Props: `fallback?: ReactNode`, `onError?: (error, info) => void`
- Default fallback: card with error message + "Herlaad pagina" button
- Used as wrapper around each dashboard page route
- Also used for section-level isolation (e.g., wrap the activity feed independently from stats)

#### `portal/hooks/use-api-request.ts`
Drop-in replacement for raw `fetch()`.

```ts
function useApiRequest(): {
  request: <T>(url: string, options?: RequestInit & { retries?: number; timeoutMs?: number }) => Promise<T>;
  loading: boolean;
  error: string | null;
}
```

Behaviour:
- Default timeout: 10 000 ms (AbortController)
- Default retries: 2, with 800 ms delay between attempts
- On final failure: calls `toast.error()` with a human-readable message derived from the URL (e.g. `/api/me/documents` → "Documenten niet beschikbaar")
- Returns typed result or throws — caller decides whether to show inline error or let the boundary catch

---

### Changes to existing files

#### `portal/app/dashboard/layout.tsx`
- Import and render `<Toaster />` inside the layout
- Wrap each `{children}` slot with `<ErrorBoundary>`

#### `portal/app/dashboard/AppShell.tsx`
- Replace `.catch(() => {})` with `useApiRequest()` for badge counts
- Add a subtle offline indicator (grey dot → "Verbinding verbroken") when all fetches fail

#### Per-page updates (7 files)

Each file (`HomeTab`, `MailClient`, `DocsPage`, `CalendarClient`, `TasksClient`, `ProfileTab`, `docs/[id]/page.tsx`) receives:

| Change | Detail |
|--------|--------|
| Replace `.catch(() => {})` | Use `useApiRequest()` with named error messages |
| Add retry button | Shown in empty-state when fetch fails; re-runs the load function |
| Service-specific messages | e.g. "Mail niet bereikbaar" vs "Paperless reageert niet" |
| Profile: add loading skeleton | 3 skeleton rows while LDAP profile loads |
| Document detail: metadata skeleton | Show skeleton in header while metadata loads |
| HomeTab: show "geen agenda" | Fix the missing empty state for 0 calendar events |
| Timeout state | After 8s still loading: show "Duurt langer dan normaal…" warning |

---

## Error Message Catalogue

| Endpoint prefix | Toast message |
|-----------------|---------------|
| `/api/me/documents` | "Paperless niet bereikbaar" |
| `/api/me/document-types` | "Documenttypes niet beschikbaar" |
| `/api/mail/*` | "Mailserver niet bereikbaar" |
| `/api/me/calendar/*` | "Kalender niet beschikbaar" |
| `/api/me/tickets` | "Taken niet beschikbaar" |
| `/api/me/profile` | "Profieldata niet beschikbaar" |
| `/api/me/ldap-profile` | "Instellingen niet beschikbaar" |
| `/api/gateway/*` | "Service tijdelijk niet bereikbaar" |
| (fallback) | "Fout bij laden — probeer opnieuw" |

---

## Non-goals

- No global state management (Redux, Zustand) — not needed for this scope
- No service worker / offline caching — separate concern
- No request deduplication — the existing fetch pattern is adequate

---

## Testing

1. Stop the `paperless` container → documents page must show "Paperless niet bereikbaar" banner with retry button
2. Stop the mail account (disable IMAP) → mail page shows specific error, not empty list
3. All pages must render without crashing when API returns 500
4. Toast must auto-dismiss after timeout
5. Profile loading skeleton visible for ≥200ms (can simulate with throttled network)

---

## File Map

**Create:**
- `portal/components/ui/toast.tsx`
- `portal/components/ui/error-boundary.tsx`
- `portal/hooks/use-api-request.ts`

**Modify:**
- `portal/app/dashboard/layout.tsx`
- `portal/app/dashboard/AppShell.tsx`
- `portal/app/dashboard/HomeTab.tsx`
- `portal/app/dashboard/mail/MailClient.tsx`
- `portal/app/dashboard/docs/page.tsx`
- `portal/app/dashboard/docs/[id]/page.tsx`
- `portal/app/dashboard/calendar/CalendarClient.tsx`
- `portal/app/dashboard/tasks/TasksClient.tsx`
- `portal/app/dashboard/profile/ProfileTab.tsx`
