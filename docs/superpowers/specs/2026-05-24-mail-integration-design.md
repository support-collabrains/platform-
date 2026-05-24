# Mail Integration (Subsystem B) — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Embed a full IMAP/SMTP mail client inside the CollaBrains dashboard, with Signal notifications for new mail and an out-of-office toggle.

**Architecture:** NestJS proxies all IMAP/SMTP operations on behalf of the logged-in user. Credentials are stored in Authentik user attributes. The portal renders the inbox UI via REST calls to `/users/me/mail/*`. No mail credentials ever reach the browser.

**Tech Stack:** `imapflow` (IMAP), `nodemailer` (SMTP), `dompurify` + `jsdom` (HTML sanitization), BullMQ (Signal digest job), Next.js App Router, Tailwind CSS.

---

## Existing Infrastructure

- Mailcow runs at `http://nginx-mailcow:8080` (internal) / `https://mail.cbrains.de` (external).
- Each user gets a `username@cbrains.de` mailbox created during onboarding (`users.service.ts → createMailcowMailbox`).
- **Gap:** The random IMAP password is generated but not stored — it must be fixed as Task 1.
- Authentik user attributes already store `signal_doc_notify`, `signal_digest_mode`, `language`. The same mechanism stores `mail_imap_password` and `mail_signal_notify`.
- IMAP host: `nginx-mailcow`, port `143` (STARTTLS) — reachable from the `mailcow-network` Docker network (the `api` service is already on both `platform` and `mailcow-network`).
- SMTP host: `nginx-mailcow`, port `587` (STARTTLS) — reachable from the `mailcow-network` Docker network.
- Mailcow admin API key: `MAILCOW_API_KEY` env var. Admin API base: `http://nginx-mailcow:8080`.

---

## File Structure

### API (`api/src/mail/`)

| File | Responsibility |
|---|---|
| `mail.module.ts` | NestJS module; imports HttpModule, BullModule queue `mail-digest` |
| `mail.controller.ts` | REST endpoints under `/users/me/mail/*`; applies existing `InternalAuthGuard` |
| `mail-imap.service.ts` | IMAP operations via `imapflow`: list folders, fetch messages, mark read, trash |
| `mail-smtp.service.ts` | Send mail via `nodemailer`; saves copy to Sent folder |
| `mail-digest.processor.ts` | BullMQ repeatable job: check unseen mail → Signal notification |
| `mail.dto.ts` | DTOs: `SendMailDto`, `VacationDto`, query params |

### Authentik credential flow

`users.service.ts → createMailcowMailbox` is modified to:
1. Return the generated `tmp` password.
2. PATCH the Authentik user (`/api/v3/core/users/{pk}/`) to store `attributes.mail_imap_password = tmp`.

`mail-imap.service.ts` exposes `getCredentials(authentikUid)`:
1. Fetch Authentik user → `attributes.mail_imap_password` and `email`.
2. Return `{ user: email, password }`.

### Portal (`portal/app/dashboard/mail/`)

| File | Responsibility |
|---|---|
| `page.tsx` | Server component: fetches stats, renders layout |
| `components/FolderList.tsx` | Sidebar with folder names + unread counts |
| `components/MessageList.tsx` | Left pane: message rows (from, subject, date, unread dot) |
| `components/MessageView.tsx` | Right pane: headers + body in `<iframe srcdoc>` |
| `components/ComposeModal.tsx` | Slide-up compose panel (to / subject / body) |

### Dashboard integration

`portal/app/dashboard/components/MailSummary.tsx` — new Suspense section on `/dashboard` showing unread count and 3 most recent senders, linking to `/dashboard/mail`.

`portal/app/dashboard/components/PreferencesPanel.tsx` — add "Mail" preference section: Signal-notify toggle + out-of-office toggle + auto-reply fields.

---

## API Endpoints

All routes require headers: `x-internal-secret` (validates against `INTERNAL_API_SECRET` env var) + `x-authentik-uid` (Authentik numeric user pk). This is the existing `InternalAuthGuard` pattern.

### Stats

```
GET /users/me/mail/stats
Response: { unread: number, folders: [{ name: string, unread: number }] }
```

### Message list

```
GET /users/me/mail/messages?folder=INBOX&page=1&limit=20
Response: {
  messages: [{ uid: number, from: string, subject: string, date: string, seen: boolean, hasAttachment: boolean }],
  total: number
}
```

`folder` defaults to `INBOX`. `page` and `limit` default to 1 and 20.

### Message detail

```
GET /users/me/mail/messages/:uid?folder=INBOX
Response: {
  uid: number, from: string, to: string, cc: string,
  subject: string, date: string, seen: boolean,
  bodyHtml: string,   ← sanitized with DOMPurify, all external resources stripped
  bodyText: string    ← plain-text fallback
}
```

### Mark as read

```
POST /users/me/mail/messages/:uid/seen?folder=INBOX
Response: { ok: true }
```

### Delete (move to trash)

```
DELETE /users/me/mail/messages/:uid?folder=INBOX
Response: { ok: true }
```

If folder is `Trash`, the message is permanently deleted instead.

### Send

```
POST /users/me/mail/send
Body: { to: string, subject: string, bodyHtml: string, replyToUid?: number }
Response: { ok: true }
```

Sends via `nodemailer` SMTP. `from` is set to the user's Mailcow address. After sending, appends the message to the `Sent` IMAP folder.

### Vacation / out-of-office

```
GET  /users/me/mail/vacation
Response: { active: boolean, subject: string, body: string }

PATCH /users/me/mail/vacation
Body: { active: boolean, subject?: string, body?: string }
Response: { active: boolean, subject: string, body: string }
```

Reads/writes the Mailcow mailbox vacation responder via `PUT /api/v1/edit/mailbox` with fields `vacation_active`, `vacation_subject`, `vacation_body`.

---

## Signal Digest

A BullMQ repeatable job (`MailDigestJob`) runs every 15 minutes for users with `mail_signal_notify: true`.

**Job flow:**
1. Fetch all users from Authentik with `mail_signal_notify` attribute set to `true`.
2. For each user, open IMAP, search `UNSEEN SINCE <15 minutes ago>`.
3. If new messages found: send Signal message in user's preferred language.
4. Close IMAP connection.

**Signal message (nl):**
```
📧 {count} nieuw(e) bericht(en)

{sender1} — {subject1}
{sender2} — {subject2}
...

Open mail: https://portal.cbrains.de/dashboard/mail
```

**Preference key:** `mail_signal_notify: boolean` — stored in Authentik user attributes. Default: `false`. Toggled in PreferencesPanel under a new "Mail" section.

---

## Frontend — `/dashboard/mail`

### Layout (desktop)

Three-column layout inside the existing dashboard shell:

```
┌─────────────────────────────────────────────────────────┐
│ ← Welkom, username                                       │
├──────────┬─────────────────────┬───────────────────────-┤
│ INBOX 12 │ Jan de Vries        │ Onderwerp              │
│ Sent     │ Factuur ontvangen   │                        │
│ Drafts   │ 24 mei              │ Van: jan@example.com   │
│ Trash    ├─────────────────────┤ Aan: you@cbrains.de    │
│          │ Belastingdienst     │                        │
│          │ Aanslag 2025        │ <sanitized HTML body>  │
│          │ 23 mei              │                        │
│          │ ...                 │               ✏️ Opstellen │
└──────────┴─────────────────────┴────────────────────────┘
```

### Layout (mobile)

Stack navigation via URL state: `/dashboard/mail` → message list → `/dashboard/mail?uid=123&folder=INBOX` → message detail. Back button in header.

### Compose modal

Floating `✏️ Opstellen` button (bottom-right). Click opens slide-up panel:
- To: (text input)
- Subject: (text input)
- Body: (`<textarea>`, plain text — no rich editor in V1)
- Send button

### Message body rendering

`bodyHtml` is rendered inside `<iframe srcdoc={bodyHtml} sandbox="allow-same-origin" />`. External images are blocked (`sandbox` prevents requests). Links open in `_blank`.

---

## Dashboard Summary Card (`MailSummary`)

Added as the first `<Suspense>` section in `/dashboard/page.tsx`, before `DocumentsList`.

Displays:
- Unread count badge
- Up to 3 most recent unread senders + subjects
- "Alle berichten →" link to `/dashboard/mail`

---

## Credential Migration (Existing Users)

For users whose mailbox was created before this fix, `mail_imap_password` will be missing from Authentik attributes.

**Handled in `MailImapService.getCredentials(uid)`:** If `mail_imap_password` is absent, reset the Mailcow mailbox password via `PUT /api/v1/edit/mailbox` (admin API), store the new password in Authentik, and proceed. This is a one-time self-healing step per user on first IMAP access.

---

## Dependencies to Install

```bash
# API
npm install imapflow nodemailer @types/nodemailer dompurify jsdom @types/dompurify @types/jsdom
```

---

## Out of Scope for Subsystem B

- Rich HTML composer (WYSIWYG) — plain textarea only
- Attachment upload/download — deferred to Subsystem E
- Multi-account support — each user has exactly one `@cbrains.de` mailbox
- Push notifications — deferred to Subsystem G (PWA)
- IMAP connection pooling / keep-alive — per-request connections only (simplest correct approach)
