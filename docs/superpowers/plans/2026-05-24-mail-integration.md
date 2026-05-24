# Mail Integration (Subsystem B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed a full IMAP/SMTP mail client in the CollaBrains dashboard, with Signal notifications for new mail and an out-of-office toggle.

**Architecture:** NestJS (`api/src/mail/`) proxies all IMAP/SMTP on behalf of the logged-in user using credentials stored in Authentik user attributes. The portal calls `/users/me/mail/*` REST endpoints via Next.js API proxy routes. No credentials reach the browser.

**Tech Stack:** `imapflow` (IMAP), `nodemailer` (SMTP), `mailparser` (MIME parsing), `dompurify` + `jsdom` (HTML sanitization), BullMQ-less `setInterval` poller (Signal digest), Next.js App Router server + client components, Tailwind CSS.

---

## Key Context (read before implementing)

- **Working directory:** `/srv/platform`
- **Auth pattern:** `InternalSecretGuard` reads `process.env.INTERNAL_API_SECRET` and compares to `x-internal-secret` header. See `api/src/users-me/internal-secret.guard.ts`.
- **Authentik token:** `AUTHENTIK_BOOTSTRAP_TOKEN` env var. API base: `http://authentik-server:9000`.
- **Authentik user attributes** are stored via `axios.patch('/api/v3/core/users/{pk}/', { attributes: {...} })`. Always merge — never overwrite the whole object.
- **Mailcow URL:** `http://nginx-mailcow:8080` (internal Docker). API key: `MAILCOW_API_KEY`. The API container is on both `platform` and `mailcow-network`.
- **IMAP host:** `nginx-mailcow`, port `143` (plain, no TLS — internal Docker network).
- **SMTP host:** `nginx-mailcow`, port `587` (STARTTLS, `tls.rejectUnauthorized: false`).
- **Portal proxy pattern:** client components call `/api/me/...` (Next.js route handlers), which forward to `INTERNAL_API_URL` with `x-internal-secret` and `x-authentik-uid` headers. See `portal/app/api/me/preferences/route.ts`.
- **Server components** call `INTERNAL_API_URL` directly. See `portal/app/dashboard/components/DocumentsList.tsx`.
- **Run API tests:** `cd api && npm test -- --testPathPattern=<file> --no-coverage` from `/srv/platform`.
- **Build and restart:** `docker compose build api && docker compose up -d api` from `/srv/platform`.
- **Get API IP:** `docker inspect platform-api-1 --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}'`

---

## File Map

### API — new files

| File | Responsibility |
|---|---|
| `api/src/mail/mail.dto.ts` | DTOs and response interfaces for all endpoints |
| `api/src/mail/mail-imap.service.ts` | IMAP: credentials, folder list, message list, message detail, mark read, delete |
| `api/src/mail/mail-imap.service.spec.ts` | Unit tests for sanitizeHtml and credential helpers |
| `api/src/mail/mail-smtp.service.ts` | SMTP send via nodemailer |
| `api/src/mail/mail-digest.service.ts` | 15-min poller: check new unread mail, notify via Signal |
| `api/src/mail/mail.controller.ts` | REST controller under `users/me/mail` with `InternalSecretGuard` |
| `api/src/mail/mail.module.ts` | NestJS module wiring all mail providers |

### API — modified files

| File | Change |
|---|---|
| `api/src/users/users.service.ts` | `createMailcowMailbox` stores IMAP password in Authentik on mailbox creation |
| `api/src/users-me/users-me.service.ts` | Add `mail_signal_notify` to `UserPreferences` |
| `api/src/app.module.ts` | Import `MailModule` |

### Portal — new files

| File | Responsibility |
|---|---|
| `portal/app/api/me/mail/stats/route.ts` | Proxy GET stats |
| `portal/app/api/me/mail/messages/route.ts` | Proxy GET message list |
| `portal/app/api/me/mail/messages/[uid]/route.ts` | Proxy GET + DELETE single message |
| `portal/app/api/me/mail/messages/[uid]/seen/route.ts` | Proxy POST mark-as-seen |
| `portal/app/api/me/mail/send/route.ts` | Proxy POST send |
| `portal/app/api/me/mail/vacation/route.ts` | Proxy GET + PATCH vacation |
| `portal/app/dashboard/components/MailSummary.tsx` | Dashboard card: unread count + recent senders |
| `portal/app/dashboard/mail/page.tsx` | Mail inbox page (server component layout) |
| `portal/app/dashboard/mail/components/FolderList.tsx` | Sidebar folder tabs with unread counts |
| `portal/app/dashboard/mail/components/MessageList.tsx` | Scrollable message list rows (client component) |
| `portal/app/dashboard/mail/components/MessageView.tsx` | Message detail: headers + sanitized body in iframe |
| `portal/app/dashboard/mail/components/ComposeModal.tsx` | Slide-up compose panel (client component) |

### Portal — modified files

| File | Change |
|---|---|
| `portal/app/dashboard/page.tsx` | Add `<MailSummary>` Suspense block |
| `portal/app/dashboard/components/PreferencesPanel.tsx` | Add mail Signal notify toggle + vacation section |

---

## Task 1: Store IMAP password during mailbox creation

**Files:**
- Modify: `api/src/users/users.service.ts`

- [ ] **Step 1: Read the current file**

```bash
cat /srv/platform/api/src/users/users.service.ts
```

- [ ] **Step 2: Add `storeMailPassword` private method**

Add this method to `UsersService` (after `createMailcowMailbox`):

```typescript
private async storeMailPassword(authentikPk: number, password: string): Promise<void> {
  const url = this.config.get('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
  const token = this.config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
  try {
    const { data: user } = await axios.get(`${url}/api/v3/core/users/${authentikPk}/`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8_000,
    });
    await axios.patch(
      `${url}/api/v3/core/users/${authentikPk}/`,
      { attributes: { ...(user.attributes ?? {}), mail_imap_password: password } },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 8_000 },
    );
  } catch (err) {
    this.logger.error(`Failed to store mail password for pk=${authentikPk}: ${(err as Error).message}`);
  }
}
```

- [ ] **Step 3: Update `onboardUser` to pass pk to `createMailcowMailbox`**

Change the call inside `onboardUser` from:
```typescript
await this.createMailcowMailbox(user.email, user.name);
```
to:
```typescript
await this.createMailcowMailbox(user.email, user.name, authentikPk);
```

- [ ] **Step 4: Update `createMailcowMailbox` signature and call `storeMailPassword`**

Change the method signature and add the store call after creation:

```typescript
private async createMailcowMailbox(email: string, name: string, authentikPk: number): Promise<void> {
  const url = this.config.get('MAILCOW_URL') ?? 'http://nginx-mailcow:8080';
  const apiKey = this.config.get('MAILCOW_API_KEY') ?? '';
  if (!apiKey) return;

  const [local, domain] = email.split('@');
  const api = axios.create({ baseURL: url, headers: { 'X-API-Key': apiKey } });

  try {
    const { data: existing } = await api.get(`/api/v1/get/mailbox/${email}`);
    if (existing && !Array.isArray(existing)) {
      this.logger.log(`Mailbox already exists: ${email}`);
      return;
    }
    const tmp = `${Math.random().toString(36).slice(2)}Aa1!`;
    await api.post('/api/v1/add/mailbox', {
      local_part: local,
      domain,
      name,
      password: tmp,
      password2: tmp,
      quota: 3072,
      active: 1,
      force_pw_update: 0,
    });
    this.logger.log(`Created mailbox: ${email}`);
    await this.storeMailPassword(authentikPk, tmp);
  } catch (err) {
    this.logger.error(`Failed to create mailbox ${email}: ${(err as Error).message}`);
  }
}
```

- [ ] **Step 5: Commit**

```bash
cd /srv/platform
git add api/src/users/users.service.ts
git commit -m "fix: store IMAP password in Authentik on mailbox creation"
```

---

## Task 2: Install API dependencies

**Files:**
- Modify: `api/package.json` (via npm)

- [ ] **Step 1: Install packages**

```bash
cd /srv/platform/api
npm install imapflow mailparser nodemailer @types/nodemailer dompurify jsdom @types/dompurify @types/jsdom
```

Expected: all packages added to `dependencies` / `devDependencies` in `package.json`, no audit errors that block the build.

- [ ] **Step 2: Verify installed**

```bash
ls node_modules/imapflow node_modules/mailparser node_modules/nodemailer node_modules/dompurify node_modules/jsdom
```

Expected: all five directories exist.

- [ ] **Step 3: Commit**

```bash
cd /srv/platform
git add api/package.json api/package-lock.json
git commit -m "chore(api): add imapflow, mailparser, nodemailer, dompurify, jsdom"
```

---

## Task 3: Create `mail.dto.ts`

**Files:**
- Create: `api/src/mail/mail.dto.ts`

- [ ] **Step 1: Create the file**

```typescript
// api/src/mail/mail.dto.ts
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';

export class SendMailDto {
  @IsEmail()
  to!: string;

  @IsNotEmpty()
  @IsString()
  subject!: string;

  @IsString()
  bodyHtml!: string;
}

export class VacationDto {
  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;
}

export interface FolderStat {
  name: string;
  unread: number;
}

export interface MailStats {
  unread: number;
  folders: FolderStat[];
}

export interface MailMessage {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
  hasAttachment: boolean;
}

export interface MailDetail {
  uid: number;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  seen: boolean;
  bodyHtml: string;
  bodyText: string;
}

export interface VacationState {
  active: boolean;
  subject: string;
  body: string;
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add api/src/mail/mail.dto.ts
git commit -m "feat(mail): add mail DTOs and response interfaces"
```

---

## Task 4: Create `mail-imap.service.ts`

**Files:**
- Create: `api/src/mail/mail-imap.service.ts`

- [ ] **Step 1: Create the file**

```typescript
// api/src/mail/mail-imap.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser, AddressObject } from 'mailparser';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import axios from 'axios';
import type { MailStats, MailMessage, MailDetail, FolderStat, VacationState } from './mail.dto';

const { window: purifyWindow } = new JSDOM('');
const DOMPurify = createDOMPurify(purifyWindow as unknown as Window);

@Injectable()
export class MailImapService {
  private readonly logger = new Logger(MailImapService.name);
  private readonly authentikUrl: string;
  private readonly authentikToken: string;
  private readonly mailcowUrl: string;
  private readonly mailcowApiKey: string;
  private readonly imapHost: string;

  constructor(private readonly config: ConfigService) {
    this.authentikUrl = config.get('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
    this.authentikToken = config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
    this.mailcowUrl = config.get('MAILCOW_URL') ?? 'http://nginx-mailcow:8080';
    this.mailcowApiKey = config.get('MAILCOW_API_KEY') ?? '';
    this.imapHost = 'nginx-mailcow';
  }

  // ── Credentials ───────────────────────────────────────────────────────────

  async getCredentials(uid: string): Promise<{ user: string; pass: string }> {
    const { data: authUser } = await axios.get(
      `${this.authentikUrl}/api/v3/core/users/${uid}/`,
      { headers: { Authorization: `Bearer ${this.authentikToken}` }, timeout: 8_000 },
    );

    const email = authUser.email as string;
    let password = (authUser.attributes as Record<string, string>)?.mail_imap_password;

    if (!password) {
      this.logger.log(`No IMAP password stored for ${email} — resetting via Mailcow`);
      password = `${Math.random().toString(36).slice(2)}Aa1!`;
      await this.resetMailcowPassword(email, password);
      await this.storePasswordInAuthentik(uid, authUser.attributes ?? {}, password);
    }

    return { user: email, pass: password };
  }

  private async resetMailcowPassword(email: string, password: string): Promise<void> {
    await axios.post(
      `${this.mailcowUrl}/api/v1/edit/mailbox`,
      [{ attr: { password, password2: password }, items: [email] }],
      { headers: { 'X-API-Key': this.mailcowApiKey }, timeout: 10_000 },
    );
  }

  private async storePasswordInAuthentik(
    uid: string,
    existingAttrs: Record<string, string>,
    password: string,
  ): Promise<void> {
    await axios.patch(
      `${this.authentikUrl}/api/v3/core/users/${uid}/`,
      { attributes: { ...existingAttrs, mail_imap_password: password } },
      { headers: { Authorization: `Bearer ${this.authentikToken}` }, timeout: 8_000 },
    );
  }

  // ── Client factory ────────────────────────────────────────────────────────

  createClient(credentials: { user: string; pass: string }): ImapFlow {
    return new ImapFlow({
      host: this.imapHost,
      port: 143,
      secure: false,
      auth: credentials,
      tls: { rejectUnauthorized: false },
      logger: false,
    });
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats(uid: string): Promise<MailStats> {
    const creds = await this.getCredentials(uid);
    const client = this.createClient(creds);
    await client.connect();
    try {
      const allFolders = await client.list();
      const primary = new Set(['INBOX', 'Sent', 'Drafts', 'Trash']);
      const folders: FolderStat[] = [];
      let totalUnread = 0;

      for (const folder of allFolders) {
        const status = await client.mailboxStatus(folder.path, ['unseen']);
        const unread = status.unseen ?? 0;
        if (unread > 0 || primary.has(folder.path) || primary.has(folder.name)) {
          folders.push({ name: folder.path, unread });
        }
        if (folder.name === 'INBOX' || folder.path === 'INBOX') {
          totalUnread = unread;
        }
      }

      return { unread: totalUnread, folders };
    } finally {
      await client.logout();
    }
  }

  // ── Message list ──────────────────────────────────────────────────────────

  async getMessages(
    uid: string,
    folder: string,
    page: number,
    limit: number,
  ): Promise<{ messages: MailMessage[]; total: number }> {
    const creds = await this.getCredentials(uid);
    const client = this.createClient(creds);
    await client.connect();
    try {
      const status = await client.mailboxStatus(folder, ['messages']);
      const total = status.messages ?? 0;
      if (total === 0) return { messages: [], total: 0 };

      await client.mailboxOpen(folder);

      // Fetch most-recent messages: sequence range (descending)
      const rangeEnd = total - (page - 1) * limit;
      const rangeStart = Math.max(1, rangeEnd - limit + 1);

      const messages: MailMessage[] = [];
      for await (const msg of client.fetch(`${rangeStart}:${rangeEnd}`, {
        envelope: true,
        flags: true,
      })) {
        const addr = msg.envelope?.from?.[0];
        messages.push({
          uid: msg.uid,
          from: addr ? (addr.name || addr.address || '') : '',
          subject: msg.envelope?.subject ?? '(no subject)',
          date: msg.envelope?.date?.toISOString() ?? '',
          seen: msg.flags.has('\\Seen'),
          hasAttachment: false,
        });
      }

      return { messages: messages.reverse(), total };
    } finally {
      await client.logout();
    }
  }

  // ── Message detail ────────────────────────────────────────────────────────

  async getMessage(uid: string, folder: string, msgUid: number): Promise<MailDetail> {
    const creds = await this.getCredentials(uid);
    const client = this.createClient(creds);
    await client.connect();
    try {
      await client.mailboxOpen(folder);
      const msg = await client.fetchOne(
        String(msgUid),
        { source: true, flags: true, envelope: true },
        { uid: true },
      );
      if (!msg || !msg.source) throw new NotFoundException('Message not found');

      const parsed = await simpleParser(msg.source);
      const toAddr = parsed.to as AddressObject | undefined;
      const ccAddr = parsed.cc as AddressObject | undefined;

      return {
        uid: msgUid,
        from: parsed.from?.text ?? '',
        to: toAddr?.text ?? '',
        cc: ccAddr?.text ?? '',
        subject: parsed.subject ?? '(no subject)',
        date: parsed.date?.toISOString() ?? '',
        seen: msg.flags.has('\\Seen'),
        bodyHtml: this.sanitizeHtml(parsed.html || ''),
        bodyText: parsed.text ?? '',
      };
    } finally {
      await client.logout();
    }
  }

  sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html, {
      FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button', 'meta', 'link'],
      FORBID_ATTR: ['style', 'onload', 'onerror', 'onclick', 'onmouseover', 'srcset'],
    });
  }

  // ── Mark seen ─────────────────────────────────────────────────────────────

  async markSeen(uid: string, folder: string, msgUid: number): Promise<void> {
    const creds = await this.getCredentials(uid);
    const client = this.createClient(creds);
    await client.connect();
    try {
      await client.mailboxOpen(folder, { readOnly: false });
      await client.messageFlagsAdd(String(msgUid), ['\\Seen'], { uid: true });
    } finally {
      await client.logout();
    }
  }

  // ── Delete / trash ────────────────────────────────────────────────────────

  async deleteMessage(uid: string, folder: string, msgUid: number): Promise<void> {
    const creds = await this.getCredentials(uid);
    const client = this.createClient(creds);
    await client.connect();
    try {
      await client.mailboxOpen(folder, { readOnly: false });
      if (folder.toLowerCase() === 'trash') {
        await client.messageDelete(String(msgUid), { uid: true });
      } else {
        await client.messageMove(String(msgUid), 'Trash', { uid: true });
      }
    } finally {
      await client.logout();
    }
  }

  // ── Vacation ──────────────────────────────────────────────────────────────

  async getVacation(uid: string): Promise<VacationState> {
    const creds = await this.getCredentials(uid);
    try {
      const { data } = await axios.get(
        `${this.mailcowUrl}/api/v1/get/mailbox/${creds.user}`,
        { headers: { 'X-API-Key': this.mailcowApiKey }, timeout: 10_000 },
      );
      return {
        active: data.vacation_active === '1' || data.vacation_active === 1,
        subject: data.vacation_subject ?? '',
        body: data.vacation_body ?? '',
      };
    } catch {
      return { active: false, subject: '', body: '' };
    }
  }

  async setVacation(uid: string, active: boolean, subject: string, body: string): Promise<VacationState> {
    const creds = await this.getCredentials(uid);
    await axios.post(
      `${this.mailcowUrl}/api/v1/edit/mailbox`,
      [{
        attr: {
          vacation_active: active ? '1' : '0',
          vacation_subject: subject,
          vacation_body: body,
        },
        items: [creds.user],
      }],
      { headers: { 'X-API-Key': this.mailcowApiKey }, timeout: 10_000 },
    );
    return { active, subject, body };
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add api/src/mail/mail-imap.service.ts
git commit -m "feat(mail): add MailImapService — IMAP client with credential management"
```

---

## Task 5: Write and run unit tests for `MailImapService`

**Files:**
- Create: `api/src/mail/mail-imap.service.spec.ts`

- [ ] **Step 1: Create the spec file**

```typescript
// api/src/mail/mail-imap.service.spec.ts
import { MailImapService } from './mail-imap.service';
import { ConfigService } from '@nestjs/config';

function makeService(): MailImapService {
  const config = {
    get: (key: string) => {
      const map: Record<string, string> = {
        AUTHENTIK_URL: 'http://auth:9000',
        AUTHENTIK_BOOTSTRAP_TOKEN: 'token',
        MAILCOW_URL: 'http://mailcow:8080',
        MAILCOW_API_KEY: 'key',
      };
      return map[key] ?? '';
    },
  } as unknown as ConfigService;
  return new MailImapService(config);
}

describe('MailImapService', () => {
  let service: MailImapService;

  beforeEach(() => {
    service = makeService();
  });

  describe('sanitizeHtml', () => {
    it('removes script tags', () => {
      const result = service.sanitizeHtml('<p>Hello</p><script>alert(1)</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('Hello');
    });

    it('removes onclick attributes', () => {
      const result = service.sanitizeHtml('<a onclick="alert(1)" href="#">click</a>');
      expect(result).not.toContain('onclick');
    });

    it('removes style tags', () => {
      const result = service.sanitizeHtml('<style>body{color:red}</style><p>text</p>');
      expect(result).not.toContain('<style>');
    });

    it('removes onload attributes', () => {
      const result = service.sanitizeHtml('<img onload="fetch(/*...*/)" src="x">');
      expect(result).not.toContain('onload');
    });

    it('preserves safe content', () => {
      const result = service.sanitizeHtml('<p><strong>Hello</strong> <em>world</em></p>');
      expect(result).toContain('<strong>Hello</strong>');
      expect(result).toContain('<em>world</em>');
    });

    it('returns empty string for empty input', () => {
      expect(service.sanitizeHtml('')).toBe('');
    });
  });

  describe('createClient', () => {
    it('creates an ImapFlow instance with correct host and port', () => {
      const client = service.createClient({ user: 'a@b.com', pass: 'secret' });
      expect(client).toBeDefined();
      // ImapFlow instance has connect/logout methods
      expect(typeof client.connect).toBe('function');
      expect(typeof client.logout).toBe('function');
    });
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd /srv/platform/api
npm test -- --testPathPattern=mail-imap.service.spec --no-coverage
```

Expected: all 6 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /srv/platform
git add api/src/mail/mail-imap.service.spec.ts
git commit -m "test(mail): unit tests for MailImapService.sanitizeHtml and createClient"
```

---

## Task 6: Create `mail-smtp.service.ts`

**Files:**
- Create: `api/src/mail/mail-smtp.service.ts`

- [ ] **Step 1: Create the file**

```typescript
// api/src/mail/mail-smtp.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailImapService } from './mail-imap.service';

@Injectable()
export class MailSmtpService {
  private readonly logger = new Logger(MailSmtpService.name);
  private readonly smtpHost: string;

  constructor(
    private readonly config: ConfigService,
    private readonly imapService: MailImapService,
  ) {
    this.smtpHost = 'nginx-mailcow';
  }

  async sendMail(
    uid: string,
    to: string,
    subject: string,
    bodyHtml: string,
  ): Promise<void> {
    const creds = await this.imapService.getCredentials(uid);

    const transporter = nodemailer.createTransport({
      host: this.smtpHost,
      port: 587,
      secure: false,
      auth: { user: creds.user, pass: creds.pass },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: creds.user,
      to,
      subject,
      html: bodyHtml,
      text: bodyHtml.replace(/<[^>]+>/g, ''),
    });

    this.logger.log(`Sent mail from ${creds.user} to ${to}`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add api/src/mail/mail-smtp.service.ts
git commit -m "feat(mail): add MailSmtpService — send via Mailcow SMTP submission"
```

---

## Task 7: Create `mail-digest.service.ts`

**Files:**
- Create: `api/src/mail/mail-digest.service.ts`

- [ ] **Step 1: Create the file**

```typescript
// api/src/mail/mail-digest.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { NotificationsService } from '../notifications/notifications.service';
import { MailImapService } from './mail-imap.service';

const DIGEST_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class MailDigestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailDigestService.name);
  private readonly authentikUrl: string;
  private readonly authentikToken: string;
  private readonly portalOrigin: string;
  private poller: ReturnType<typeof setInterval>;

  constructor(
    private readonly config: ConfigService,
    private readonly imapService: MailImapService,
    private readonly notifications: NotificationsService,
  ) {
    this.authentikUrl = config.get('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
    this.authentikToken = config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
    this.portalOrigin = config.get('PORTAL_ORIGIN') ?? '';
  }

  onModuleInit() {
    this.poller = setInterval(() => void this.runDigest(), DIGEST_INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.poller);
  }

  async runDigest(): Promise<void> {
    const { data } = await axios.get(`${this.authentikUrl}/api/v3/core/users/`, {
      headers: { Authorization: `Bearer ${this.authentikToken}` },
      params: { type: 'internal', page_size: 100 },
      timeout: 10_000,
    });

    for (const user of data.results as Array<{ pk: number; username: string; email: string; attributes: Record<string, string> }>) {
      const attrs = user.attributes ?? {};
      if (attrs.mail_signal_notify !== 'true') continue;
      const phones = [attrs.phone, attrs.phone2].filter((p): p is string => !!p?.startsWith('+'));
      if (!phones.length) continue;

      try {
        await this.notifyUser(user.pk, user.email, attrs, phones);
      } catch (err) {
        this.logger.warn(`Mail digest error for ${user.username}: ${(err as Error).message}`);
      }
    }
  }

  private async notifyUser(
    pk: number,
    email: string,
    attrs: Record<string, string>,
    phones: string[],
  ): Promise<void> {
    const creds = { user: email, pass: attrs.mail_imap_password ?? '' };
    if (!creds.pass) return; // credentials not yet set up

    const client = this.imapService.createClient(creds);
    await client.connect();

    try {
      const status = await client.mailboxStatus('INBOX', ['uidnext']);
      const uidNext = status.uidNext ?? 1;
      const highWater = Math.max(0, uidNext - 1);
      const lastUid = parseInt(attrs.mail_digest_last_uid ?? '0');

      if (highWater <= lastUid) return; // no new messages since last check

      // Fetch new messages to check which are unread
      await client.mailboxOpen('INBOX');
      const newUnseen: string[] = [];

      for await (const msg of client.fetch(`${lastUid + 1}:${highWater}`, {
        envelope: true,
        flags: true,
      }, { uid: true })) {
        if (!msg.flags.has('\\Seen')) {
          const from = msg.envelope?.from?.[0];
          newUnseen.push(from?.name || from?.address || 'Onbekend');
        }
      }

      // Advance watermark AFTER fetch so a failed fetch doesn't silently drop notifications
      await this.updateWatermark(String(pk), attrs, String(highWater));

      if (!newUnseen.length) return;

      const lang = (attrs.language ?? 'nl') as 'nl' | 'de' | 'en';
      const text = this.buildMessage(lang, newUnseen, this.portalOrigin);

      for (const phone of phones) {
        await this.notifications.sendToNumber(phone, text);
      }

      this.logger.log(`Mail digest sent to ${phones.join(', ')}: ${newUnseen.length} new messages`);
    } finally {
      await client.logout();
    }
  }

  private async updateWatermark(
    uid: string,
    attrs: Record<string, string>,
    highWater: string,
  ): Promise<void> {
    await axios.patch(
      `${this.authentikUrl}/api/v3/core/users/${uid}/`,
      { attributes: { ...attrs, mail_digest_last_uid: highWater } },
      { headers: { Authorization: `Bearer ${this.authentikToken}` }, timeout: 8_000 },
    );
  }

  buildMessage(lang: 'nl' | 'de' | 'en', senders: string[], portalOrigin: string): string {
    const count = senders.length;
    const senderList = senders.slice(0, 3).join('\n');
    const url = `${portalOrigin}/dashboard/mail`;

    if (lang === 'de') {
      return `📧 ${count} neue${count === 1 ? '' : ' '} Nachricht${count === 1 ? '' : 'en'}\n\n${senderList}\n\nMail öffnen: ${url}`;
    }
    if (lang === 'en') {
      return `📧 ${count} new message${count === 1 ? '' : 's'}\n\n${senderList}\n\nOpen mail: ${url}`;
    }
    return `📧 ${count} nieuw${count === 1 ? '' : 'e'} bericht${count === 1 ? '' : 'en'}\n\n${senderList}\n\nOpen mail: ${url}`;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add api/src/mail/mail-digest.service.ts
git commit -m "feat(mail): add MailDigestService — Signal notify for new mail every 15 min"
```

---

## Task 8: Create `mail.controller.ts`, `mail.module.ts`, register in `app.module.ts`

**Files:**
- Create: `api/src/mail/mail.controller.ts`
- Create: `api/src/mail/mail.module.ts`
- Modify: `api/src/app.module.ts`

- [ ] **Step 1: Create `mail.controller.ts`**

```typescript
// api/src/mail/mail.controller.ts
import {
  Body, Controller, Delete, Get, Headers, HttpCode,
  NotFoundException, Param, ParseIntPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { InternalSecretGuard } from '../users-me/internal-secret.guard';
import { MailImapService } from './mail-imap.service';
import { MailSmtpService } from './mail-smtp.service';
import { SendMailDto, VacationDto } from './mail.dto';

@Controller('users/me/mail')
@UseGuards(InternalSecretGuard)
export class MailController {
  constructor(
    private readonly imap: MailImapService,
    private readonly smtp: MailSmtpService,
  ) {}

  @Get('stats')
  async stats(@Headers('x-authentik-uid') uid: string) {
    return this.imap.getStats(uid);
  }

  @Get('messages')
  async list(
    @Headers('x-authentik-uid') uid: string,
    @Query('folder') folder: string = 'INBOX',
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.imap.getMessages(uid, folder, parseInt(page), parseInt(limit));
  }

  @Get('messages/:uid')
  async detail(
    @Headers('x-authentik-uid') authentikUid: string,
    @Param('uid', ParseIntPipe) msgUid: number,
    @Query('folder') folder: string = 'INBOX',
  ) {
    return this.imap.getMessage(authentikUid, folder, msgUid);
  }

  @Post('messages/:uid/seen')
  @HttpCode(200)
  async markSeen(
    @Headers('x-authentik-uid') uid: string,
    @Param('uid', ParseIntPipe) msgUid: number,
    @Query('folder') folder: string = 'INBOX',
  ) {
    await this.imap.markSeen(uid, folder, msgUid);
    return { ok: true };
  }

  @Delete('messages/:uid')
  @HttpCode(200)
  async deleteMessage(
    @Headers('x-authentik-uid') uid: string,
    @Param('uid', ParseIntPipe) msgUid: number,
    @Query('folder') folder: string = 'INBOX',
  ) {
    await this.imap.deleteMessage(uid, folder, msgUid);
    return { ok: true };
  }

  @Post('send')
  @HttpCode(200)
  async send(
    @Headers('x-authentik-uid') uid: string,
    @Body() dto: SendMailDto,
  ) {
    await this.smtp.sendMail(uid, dto.to, dto.subject, dto.bodyHtml);
    return { ok: true };
  }

  @Get('vacation')
  async getVacation(@Headers('x-authentik-uid') uid: string) {
    return this.imap.getVacation(uid);
  }

  @Patch('vacation')
  @HttpCode(200)
  async setVacation(
    @Headers('x-authentik-uid') uid: string,
    @Body() dto: VacationDto,
  ) {
    return this.imap.setVacation(uid, dto.active, dto.subject ?? '', dto.body ?? '');
  }
}
```

- [ ] **Step 2: Create `mail.module.ts`**

```typescript
// api/src/mail/mail.module.ts
import { Module } from '@nestjs/common';
import { MailImapService } from './mail-imap.service';
import { MailSmtpService } from './mail-smtp.service';
import { MailDigestService } from './mail-digest.service';
import { MailController } from './mail.controller';
import { InternalSecretGuard } from '../users-me/internal-secret.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [MailImapService, MailSmtpService, MailDigestService, InternalSecretGuard],
  controllers: [MailController],
})
export class MailModule {}
```

- [ ] **Step 3: Check what NotificationsModule exports**

```bash
cat /srv/platform/api/src/notifications/notifications.module.ts
```

If `NotificationsService` is not exported, add `exports: [NotificationsService]` to `NotificationsModule`. If it already exports, skip.

- [ ] **Step 4: Register `MailModule` in `app.module.ts`**

Add to the imports array in `api/src/app.module.ts`:

```typescript
import { MailModule } from './mail/mail.module';
```

And add `MailModule` to the `imports` array alongside the existing modules.

- [ ] **Step 5: Commit**

```bash
cd /srv/platform
git add api/src/mail/mail.controller.ts api/src/mail/mail.module.ts api/src/app.module.ts api/src/notifications/
git commit -m "feat(mail): wire MailController, MailModule into app"
```

---

## Task 9: Add `mail_signal_notify` preference to `users-me`

**Files:**
- Modify: `api/src/users-me/users-me.service.ts`

- [ ] **Step 1: Add `mail_signal_notify` to `UserPreferences`**

In `api/src/users-me/users-me.service.ts`, change the `UserPreferences` interface from:

```typescript
export interface UserPreferences {
  signal_doc_notify: boolean;
  signal_digest_mode: boolean;
  language: UserLanguage;
}
```

to:

```typescript
export interface UserPreferences {
  signal_doc_notify: boolean;
  signal_digest_mode: boolean;
  language: UserLanguage;
  mail_signal_notify: boolean;
}
```

- [ ] **Step 2: Update `parsePreferences`**

Change from:

```typescript
parsePreferences(attributes: Record<string, string>): UserPreferences {
  const lang = attributes.language as UserLanguage;
  return {
    signal_doc_notify: attributes.signal_doc_notify !== 'false',
    signal_digest_mode: attributes.signal_digest_mode === 'true',
    language: ['nl', 'de', 'en'].includes(lang) ? lang : 'nl',
  };
}
```

to:

```typescript
parsePreferences(attributes: Record<string, string>): UserPreferences {
  const lang = attributes.language as UserLanguage;
  return {
    signal_doc_notify: attributes.signal_doc_notify !== 'false',
    signal_digest_mode: attributes.signal_digest_mode === 'true',
    language: ['nl', 'de', 'en'].includes(lang) ? lang : 'nl',
    mail_signal_notify: attributes.mail_signal_notify === 'true',
  };
}
```

- [ ] **Step 3: Update `updatePreferences` to handle the new key**

Add inside the `updatePreferences` method, after the existing `if` blocks:

```typescript
if (prefs.mail_signal_notify !== undefined)
  attrs.mail_signal_notify = String(prefs.mail_signal_notify);
```

- [ ] **Step 4: Commit**

```bash
cd /srv/platform
git add api/src/users-me/users-me.service.ts
git commit -m "feat(mail): add mail_signal_notify preference"
```

---

## Task 10: Build API and smoke-test the new endpoints

**Files:** none (build and test only)

- [ ] **Step 1: Build the API image**

```bash
cd /srv/platform
docker compose build api 2>&1 | tail -20
```

Expected: `Successfully built <hash>` with no TypeScript errors. If there are compilation errors, fix them before continuing.

- [ ] **Step 2: Start the API container**

```bash
docker compose up -d api
sleep 8
```

- [ ] **Step 3: Verify bootstrap state**

```bash
source /srv/platform/.env
API_IP=$(docker inspect platform-api-1 --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}')
curl -s http://${API_IP}:3001/bootstrap/state | jq '{state,isReady}'
```

Expected: `{"state":"READY","isReady":true}`

- [ ] **Step 4: Test `GET /users/me/mail/stats`**

```bash
source /srv/platform/.env
API_IP=$(docker inspect platform-api-1 --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}')
curl -s \
  -H "x-internal-secret: ${INTERNAL_API_SECRET}" \
  -H "x-authentik-uid: 7" \
  http://${API_IP}:3001/users/me/mail/stats | jq .
```

Expected: `{"unread": <number>, "folders": [...]}` — if IMAP connection succeeds. If IMAP is unreachable (Mailcow not running), expect an error response — that is OK for now; verify the API itself started correctly.

- [ ] **Step 5: Test `GET /users/me/preferences` includes `mail_signal_notify`**

```bash
source /srv/platform/.env
API_IP=$(docker inspect platform-api-1 --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}')
curl -s \
  -H "x-internal-secret: ${INTERNAL_API_SECRET}" \
  -H "x-authentik-uid: 7" \
  http://${API_IP}:3001/users/me/preferences | jq .
```

Expected: response includes `"mail_signal_notify": false`.

- [ ] **Step 6: Commit (no code changes — but tag the smoke-tested state)**

If any bugs were fixed during smoke testing, commit those fixes now.

---

## Task 11: Create portal API proxy routes for `/api/me/mail/*`

**Files:**
- Create: `portal/app/api/me/mail/stats/route.ts`
- Create: `portal/app/api/me/mail/messages/route.ts`
- Create: `portal/app/api/me/mail/messages/[uid]/route.ts`
- Create: `portal/app/api/me/mail/messages/[uid]/seen/route.ts`
- Create: `portal/app/api/me/mail/send/route.ts`
- Create: `portal/app/api/me/mail/vacation/route.ts`

The proxy pattern is: read `x-authentik-uid` from the incoming request headers (set by Traefik → Authentik forward auth), add `x-internal-secret`, forward to the API. See `portal/app/api/me/preferences/route.ts` for the established pattern.

- [ ] **Step 1: Create shared helper in `portal/app/api/me/mail/_helpers.ts`**

```typescript
// portal/app/api/me/mail/_helpers.ts
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const SECRET = process.env.INTERNAL_API_SECRET ?? '';

export async function mailHeaders() {
  const hdrs = await headers();
  return {
    'x-internal-secret': SECRET,
    'x-authentik-uid': hdrs.get('x-authentik-uid') ?? '',
  };
}

export function apiUrl(path: string, search?: string): string {
  return `${API}/users/me/mail${path}${search ? '?' + search : ''}`;
}

export async function proxyGet(path: string, searchParams?: URLSearchParams) {
  const fwd = await mailHeaders();
  const res = await fetch(apiUrl(path, searchParams?.toString()), {
    headers: fwd,
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

- [ ] **Step 2: Create `stats/route.ts`**

```typescript
// portal/app/api/me/mail/stats/route.ts
import { proxyGet } from '../_helpers';

export async function GET() {
  return proxyGet('/stats');
}
```

- [ ] **Step 3: Create `messages/route.ts`**

```typescript
// portal/app/api/me/mail/messages/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { mailHeaders, apiUrl } from '../_helpers';

export async function GET(req: NextRequest) {
  const fwd = await mailHeaders();
  const res = await fetch(apiUrl('/messages', req.nextUrl.searchParams.toString()), {
    headers: fwd,
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

- [ ] **Step 4: Create `messages/[uid]/route.ts`**

```typescript
// portal/app/api/me/mail/messages/[uid]/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { mailHeaders, apiUrl } from '../../_helpers';

export async function GET(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const fwd = await mailHeaders();
  const search = req.nextUrl.searchParams.toString();
  const res = await fetch(apiUrl(`/messages/${uid}`, search), {
    headers: fwd,
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const fwd = await mailHeaders();
  const search = req.nextUrl.searchParams.toString();
  const res = await fetch(apiUrl(`/messages/${uid}`, search), {
    method: 'DELETE',
    headers: fwd,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

- [ ] **Step 5: Create `messages/[uid]/seen/route.ts`**

```typescript
// portal/app/api/me/mail/messages/[uid]/seen/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { mailHeaders, apiUrl } from '../../../_helpers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const fwd = await mailHeaders();
  const search = req.nextUrl.searchParams.toString();
  const res = await fetch(apiUrl(`/messages/${uid}/seen`, search), {
    method: 'POST',
    headers: fwd,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

- [ ] **Step 6: Create `send/route.ts`**

```typescript
// portal/app/api/me/mail/send/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { mailHeaders, apiUrl } from '../_helpers';

export async function POST(req: NextRequest) {
  const body = await req.json() as unknown;
  const fwd = await mailHeaders();
  const res = await fetch(apiUrl('/send'), {
    method: 'POST',
    headers: { ...fwd, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

- [ ] **Step 7: Create `vacation/route.ts`**

```typescript
// portal/app/api/me/mail/vacation/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { mailHeaders, apiUrl } from '../_helpers';

export async function GET() {
  const fwd = await mailHeaders();
  const res = await fetch(apiUrl('/vacation'), { headers: fwd, cache: 'no-store' });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() as unknown;
  const fwd = await mailHeaders();
  const res = await fetch(apiUrl('/vacation'), {
    method: 'PATCH',
    headers: { ...fwd, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

- [ ] **Step 8: Commit**

```bash
cd /srv/platform
git add portal/app/api/me/mail/
git commit -m "feat(portal): add API proxy routes for /api/me/mail/*"
```

---

## Task 12: Create `MailSummary` dashboard card

**Files:**
- Create: `portal/app/dashboard/components/MailSummary.tsx`
- Modify: `portal/app/dashboard/page.tsx`

- [ ] **Step 1: Create `MailSummary.tsx`**

```typescript
// portal/app/dashboard/components/MailSummary.tsx
import Link from 'next/link';
import { Mail } from 'lucide-react';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

interface MailStats {
  unread: number;
  folders: { name: string; unread: number }[];
}

interface MailMessage {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}

export default async function MailSummary({ uid }: { uid: string }) {
  let stats: MailStats = { unread: 0, folders: [] };
  let recent: MailMessage[] = [];

  try {
    const headers = { 'x-internal-secret': INTERNAL_API_SECRET, 'x-authentik-uid': uid };
    const [statsRes, msgsRes] = await Promise.all([
      fetch(`${INTERNAL_API_URL}/users/me/mail/stats`, { headers, cache: 'no-store' }),
      fetch(`${INTERNAL_API_URL}/users/me/mail/messages?folder=INBOX&page=1&limit=3`, { headers, cache: 'no-store' }),
    ]);
    if (statsRes.ok) stats = await statsRes.json() as MailStats;
    if (msgsRes.ok) ({ messages: recent } = await msgsRes.json() as { messages: MailMessage[] });
  } catch { /* use defaults */ }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <Mail size={15} className="text-slate-400" />
        Mail
        {stats.unread > 0 && (
          <span className="ml-auto bg-blue-600 text-white text-xs font-semibold rounded-full px-2 py-0.5">
            {stats.unread}
          </span>
        )}
      </h2>

      {recent.length === 0 ? (
        <p className="text-sm text-slate-400">Geen berichten.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {recent.map((msg) => (
            <li key={msg.uid} className="py-2 flex items-center gap-2">
              {!msg.seen && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
              {msg.seen && <span className="w-2 h-2 flex-shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className={`text-sm truncate ${msg.seen ? 'text-slate-500' : 'text-slate-800 font-medium'}`}>
                  {msg.from}
                </p>
                <p className="text-xs text-slate-400 truncate">{msg.subject}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/dashboard/mail"
        className="mt-3 block text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        Alle berichten →
      </Link>
    </section>
  );
}
```

- [ ] **Step 2: Add `MailSummary` to `portal/app/dashboard/page.tsx`**

Add the import at the top with the other component imports:

```typescript
import MailSummary from './components/MailSummary';
```

Add a new `<Suspense>` block as the first section (before `DocumentsList`):

```typescript
<Suspense fallback={<SectionSkeleton />}>
  <MailSummary uid={uid} />
</Suspense>
```

- [ ] **Step 3: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/components/MailSummary.tsx portal/app/dashboard/page.tsx
git commit -m "feat(portal): add MailSummary card to dashboard"
```

---

## Task 13: Create `/dashboard/mail` — `FolderList` and `MessageList`

**Files:**
- Create: `portal/app/dashboard/mail/components/FolderList.tsx`
- Create: `portal/app/dashboard/mail/components/MessageList.tsx`

- [ ] **Step 1: Create `FolderList.tsx`**

```typescript
// portal/app/dashboard/mail/components/FolderList.tsx
'use client';

interface Folder {
  name: string;
  unread: number;
}

const FOLDER_LABELS: Record<string, string> = {
  INBOX: 'Inbox',
  Sent: 'Verzonden',
  Drafts: 'Concepten',
  Trash: 'Prullenbak',
};

interface Props {
  folders: Folder[];
  activeFolder: string;
  onSelect: (folder: string) => void;
}

export default function FolderList({ folders, activeFolder, onSelect }: Props) {
  const ordered = [
    ...['INBOX', 'Sent', 'Drafts', 'Trash']
      .map((name) => folders.find((f) => f.name === name))
      .filter((f): f is Folder => !!f),
    ...folders.filter((f) => !['INBOX', 'Sent', 'Drafts', 'Trash'].includes(f.name)),
  ];

  return (
    <nav className="w-44 flex-shrink-0 border-r border-slate-100 pr-2">
      <ul className="space-y-0.5">
        {ordered.map((folder) => (
          <li key={folder.name}>
            <button
              onClick={() => onSelect(folder.name)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                activeFolder === folder.name
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="truncate">{FOLDER_LABELS[folder.name] ?? folder.name}</span>
              {folder.unread > 0 && (
                <span className="ml-1 text-xs font-bold text-blue-600">{folder.unread}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Create `MessageList.tsx`**

```typescript
// portal/app/dashboard/mail/components/MessageList.tsx
'use client';

import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

interface Message {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}

interface Props {
  messages: Message[];
  selectedUid: number | null;
  onSelect: (msg: Message) => void;
}

export default function MessageList({ messages, selectedUid, onSelect }: Props) {
  if (messages.length === 0) {
    return <p className="p-4 text-sm text-slate-400">Geen berichten in deze map.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-y-auto">
      {messages.map((msg) => (
        <li key={msg.uid}>
          <button
            onClick={() => onSelect(msg)}
            className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
              selectedUid === msg.uid ? 'bg-blue-50' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              {!msg.seen && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
              {msg.seen && <span className="w-2 h-2 flex-shrink-0" />}
              <span className={`text-sm truncate flex-1 ${msg.seen ? 'text-slate-500' : 'text-slate-800 font-semibold'}`}>
                {msg.from}
              </span>
              <span className="text-xs text-slate-400 flex-shrink-0">
                {formatDistanceToNow(new Date(msg.date), { addSuffix: true, locale: nl })}
              </span>
            </div>
            <p className={`text-xs mt-0.5 truncate pl-4 ${msg.seen ? 'text-slate-400' : 'text-slate-600'}`}>
              {msg.subject}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Install `date-fns` in portal (if not already present)**

```bash
cd /srv/platform/portal
grep date-fns package.json || npm install date-fns
```

- [ ] **Step 4: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/mail/components/FolderList.tsx portal/app/dashboard/mail/components/MessageList.tsx portal/package*.json
git commit -m "feat(portal/mail): add FolderList and MessageList components"
```

---

## Task 14: Create `MessageView` and `ComposeModal`

**Files:**
- Create: `portal/app/dashboard/mail/components/MessageView.tsx`
- Create: `portal/app/dashboard/mail/components/ComposeModal.tsx`

- [ ] **Step 1: Create `MessageView.tsx`**

```typescript
// portal/app/dashboard/mail/components/MessageView.tsx
'use client';

import { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';

interface MailDetail {
  uid: number;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  seen: boolean;
  bodyHtml: string;
  bodyText: string;
}

interface Props {
  msgUid: number;
  folder: string;
  onClose: () => void;
  onDeleted: () => void;
}

export default function MessageView({ msgUid, folder, onClose, onDeleted }: Props) {
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/me/mail/messages/${msgUid}?folder=${encodeURIComponent(folder)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: MailDetail) => {
        setDetail(d);
        // Mark as seen
        void fetch(`/api/me/mail/messages/${msgUid}/seen?folder=${encodeURIComponent(folder)}`, { method: 'POST' });
      })
      .finally(() => setLoading(false));
  }, [msgUid, folder]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/me/mail/messages/${msgUid}?folder=${encodeURIComponent(folder)}`, { method: 'DELETE' });
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 p-6 animate-pulse">
        <div className="h-4 w-48 bg-slate-200 rounded mb-3" />
        <div className="h-3 w-full bg-slate-100 rounded mb-2" />
        <div className="h-3 w-3/4 bg-slate-100 rounded" />
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="border-b border-slate-100 p-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-800 truncate">{detail.subject}</h2>
          <p className="text-sm text-slate-500 mt-0.5">Van: {detail.from}</p>
          {detail.to && <p className="text-xs text-slate-400">Aan: {detail.to}</p>}
          {detail.cc && <p className="text-xs text-slate-400">CC: {detail.cc}</p>}
          <p className="text-xs text-slate-400">{new Date(detail.date).toLocaleString('nl-NL')}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
            title="Verwijderen"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            title="Sluiten"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {detail.bodyHtml ? (
          <iframe
            srcDoc={detail.bodyHtml}
            sandbox="allow-same-origin"
            className="w-full h-full border-0 min-h-96"
            title="E-mailinhoud"
          />
        ) : (
          <pre className="p-4 text-sm text-slate-700 whitespace-pre-wrap font-sans">{detail.bodyText}</pre>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `ComposeModal.tsx`**

```typescript
// portal/app/dashboard/mail/components/ComposeModal.tsx
'use client';

import { useState } from 'react';
import { X, Send } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSent: () => void;
}

export default function ComposeModal({ onClose, onSent }: Props) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSend() {
    if (!to || !subject) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/me/mail/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, subject, bodyHtml: body.replace(/\n/g, '<br>') }),
      });
      if (!res.ok) {
        setError('Verzenden mislukt. Probeer het opnieuw.');
        return;
      }
      onSent();
    } catch {
      setError('Verzenden mislukt. Probeer het opnieuw.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md pointer-events-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-sm">Nieuw bericht</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-2 p-4">
          <input
            type="email"
            placeholder="Aan"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Onderwerp"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            placeholder="Schrijf je bericht..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={handleSend}
            disabled={sending || !to || !subject}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
            {sending ? 'Verzenden...' : 'Verzenden'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/mail/components/MessageView.tsx portal/app/dashboard/mail/components/ComposeModal.tsx
git commit -m "feat(portal/mail): add MessageView and ComposeModal components"
```

---

## Task 15: Create `/dashboard/mail/page.tsx`

**Files:**
- Create: `portal/app/dashboard/mail/page.tsx`

This is the main mail page. It is a server component that fetches initial data; the interactive state (selected folder/message, compose modal) is managed by a client component wrapper.

- [ ] **Step 1: Create `MailClient.tsx` (client wrapper for interactive state)**

```typescript
// portal/app/dashboard/mail/components/MailClient.tsx
'use client';

import { useState, useCallback } from 'react';
import { PenSquare } from 'lucide-react';
import FolderList from './FolderList';
import MessageList from './MessageList';
import MessageView from './MessageView';
import ComposeModal from './ComposeModal';

interface Folder { name: string; unread: number }
interface Message { uid: number; from: string; subject: string; date: string; seen: boolean }

interface Props {
  initialFolders: Folder[];
  initialMessages: Message[];
  initialFolder: string;
}

export default function MailClient({ initialFolders, initialMessages, initialFolder }: Props) {
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [activeFolder, setActiveFolder] = useState(initialFolder);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadFolder = useCallback(async (folder: string) => {
    setActiveFolder(folder);
    setSelectedUid(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/me/mail/messages?folder=${encodeURIComponent(folder)}&page=1&limit=20`);
      if (res.ok) {
        const data = await res.json() as { messages: Message[] };
        setMessages(data.messages);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function handleMessageSelected(msg: Message) {
    setSelectedUid(msg.uid);
    // Optimistically mark as seen in the list
    setMessages((prev) => prev.map((m) => m.uid === msg.uid ? { ...m, seen: true } : m));
  }

  function handleDeleted() {
    setMessages((prev) => prev.filter((m) => m.uid !== selectedUid));
    setSelectedUid(null);
  }

  return (
    <div className="flex flex-1 min-h-0 bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Folder sidebar */}
      <div className="p-3">
        <FolderList folders={folders} activeFolder={activeFolder} onSelect={loadFolder} />
      </div>

      {/* Message list */}
      <div className="w-72 border-r border-slate-100 flex flex-col min-h-0">
        {loading ? (
          <div className="p-4 animate-pulse space-y-3">
            {[1,2,3].map((i) => <div key={i} className="h-10 bg-slate-100 rounded" />)}
          </div>
        ) : (
          <MessageList
            messages={messages}
            selectedUid={selectedUid}
            onSelect={handleMessageSelected}
          />
        )}
      </div>

      {/* Message detail */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedUid ? (
          <MessageView
            msgUid={selectedUid}
            folder={activeFolder}
            onClose={() => setSelectedUid(null)}
            onDeleted={handleDeleted}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Selecteer een bericht
          </div>
        )}
      </div>

      {/* Compose button */}
      <button
        onClick={() => setComposing(true)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 transition-colors"
        title="Nieuw bericht"
      >
        <PenSquare size={20} />
      </button>

      {/* Compose modal */}
      {composing && (
        <ComposeModal
          onClose={() => setComposing(false)}
          onSent={() => { setComposing(false); void loadFolder(activeFolder); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `portal/app/dashboard/mail/page.tsx`**

```typescript
// portal/app/dashboard/mail/page.tsx
import { headers } from 'next/headers';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import MailClient from './components/MailClient';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';

export default async function MailPage() {
  const hdrs = await headers();
  const uid = hdrs.get('x-authentik-uid') ?? '';
  const fwdHeaders = { 'x-internal-secret': INTERNAL_API_SECRET, 'x-authentik-uid': uid };

  let folders: { name: string; unread: number }[] = [];
  let messages: { uid: number; from: string; subject: string; date: string; seen: boolean }[] = [];

  try {
    const [statsRes, msgsRes] = await Promise.all([
      fetch(`${INTERNAL_API_URL}/users/me/mail/stats`, { headers: fwdHeaders, cache: 'no-store' }),
      fetch(`${INTERNAL_API_URL}/users/me/mail/messages?folder=INBOX&page=1&limit=20`, { headers: fwdHeaders, cache: 'no-store' }),
    ]);
    if (statsRes.ok) ({ folders } = await statsRes.json() as { unread: number; folders: typeof folders });
    if (msgsRes.ok) ({ messages } = await msgsRes.json() as { messages: typeof messages; total: number });
  } catch { /* empty fallback */ }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-4 flex flex-col">
      <div className="max-w-6xl mx-auto flex flex-col flex-1 gap-4 w-full">
        <div className="flex items-center gap-3 py-2">
          <Link href="/dashboard" className="text-slate-400 hover:text-slate-600 transition">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="font-semibold text-slate-800">Mail</h1>
        </div>

        <MailClient
          initialFolders={folders}
          initialMessages={messages}
          initialFolder="INBOX"
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/mail/
git commit -m "feat(portal/mail): add /dashboard/mail page with full inbox UI"
```

---

## Task 16: Add mail preferences to `PreferencesPanel`

**Files:**
- Modify: `portal/app/dashboard/components/PreferencesPanel.tsx`

- [ ] **Step 1: Update the `UserPreferences` interface in `PreferencesPanel.tsx`**

Change from:

```typescript
interface UserPreferences {
  signal_doc_notify: boolean;
  signal_digest_mode: boolean;
  language: 'nl' | 'de' | 'en';
}
```

to:

```typescript
interface UserPreferences {
  signal_doc_notify: boolean;
  signal_digest_mode: boolean;
  language: 'nl' | 'de' | 'en';
  mail_signal_notify: boolean;
}
```

And update the defaults:

```typescript
let prefs: UserPreferences = { signal_doc_notify: true, signal_digest_mode: false, language: 'nl', mail_signal_notify: false };
```

- [ ] **Step 2: Add `VacationPanel` client component inline (or as a separate file)**

Create `portal/app/dashboard/components/VacationPanel.tsx`:

```typescript
// portal/app/dashboard/components/VacationPanel.tsx
'use client';

import { useState, useEffect } from 'react';

interface VacationState {
  active: boolean;
  subject: string;
  body: string;
}

export default function VacationPanel() {
  const [state, setState] = useState<VacationState>({ active: false, subject: '', body: '' });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/me/mail/vacation', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: VacationState) => { setState(d); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  async function save(next: Partial<VacationState>) {
    const updated = { ...state, ...next };
    setState(updated);
    setSaving(true);
    try {
      await fetch('/api/me/mail/vacation', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <div className="h-8 bg-slate-100 rounded animate-pulse" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Afwezig melding</p>
          <p className="text-xs text-slate-400 mt-0.5">Automatisch antwoord bij afwezigheid.</p>
        </div>
        <button
          role="switch"
          aria-checked={state.active}
          onClick={() => void save({ active: !state.active })}
          className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${state.active ? 'bg-blue-600' : 'bg-slate-200'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${state.active ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {state.active && (
        <div className="space-y-2 pl-2 border-l-2 border-blue-200">
          <input
            type="text"
            placeholder="Onderwerp (bijv. Afwezig van 24 t/m 31 mei)"
            value={state.subject}
            onChange={(e) => setState((s) => ({ ...s, subject: e.target.value }))}
            onBlur={() => void save({ subject: state.subject })}
            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            placeholder="Bericht..."
            value={state.body}
            onChange={(e) => setState((s) => ({ ...s, body: e.target.value }))}
            onBlur={() => void save({ body: state.body })}
            rows={3}
            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {saving && <p className="text-xs text-slate-400">Opslaan...</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add mail section to `PreferencesPanel.tsx`**

Add these imports at the top of `PreferencesPanel.tsx`:

```typescript
import VacationPanel from './VacationPanel';
```

Add a new `<div>` section inside the `divide-y divide-slate-100` div, after the existing toggles section (after the closing `</div>` of `pt-3 space-y-3`):

```typescript
<div className="pt-3 space-y-3">
  <PreferenceToggle
    label="Signal-melding bij nieuwe mail"
    description="Ontvang een Signal-bericht bij nieuwe ongelezen e-mail (elke 15 min gecontroleerd)."
    preferenceKey="mail_signal_notify"
    initialValue={prefs.mail_signal_notify}
  />
  <VacationPanel />
</div>
```

- [ ] **Step 4: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/components/PreferencesPanel.tsx portal/app/dashboard/components/VacationPanel.tsx
git commit -m "feat(portal): add mail Signal notify toggle and vacation panel to preferences"
```

---

## Task 17: Build portal, deploy, and smoke-test

**Files:** none (build, deploy, and verify)

- [ ] **Step 1: Build portal image**

```bash
cd /srv/platform
docker compose build portal 2>&1 | tail -20
```

Expected: `Successfully built <hash>` with no TypeScript errors.

- [ ] **Step 2: Restart API and portal**

```bash
docker compose up -d api portal
sleep 8
```

- [ ] **Step 3: Verify API health**

```bash
source /srv/platform/.env
API_IP=$(docker inspect platform-api-1 --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}')
curl -s http://${API_IP}:3001/bootstrap/state | jq '{state,isReady}'
```

Expected: `{"state":"READY","isReady":true}`

- [ ] **Step 4: Test `mail_signal_notify` in preferences**

```bash
source /srv/platform/.env
API_IP=$(docker inspect platform-api-1 --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}')
curl -s -H "x-internal-secret: ${INTERNAL_API_SECRET}" -H "x-authentik-uid: 7" \
  http://${API_IP}:3001/users/me/preferences | jq '{mail_signal_notify}'
```

Expected: `{"mail_signal_notify": false}`

- [ ] **Step 5: Test PATCH mail_signal_notify**

```bash
source /srv/platform/.env
API_IP=$(docker inspect platform-api-1 --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}')
curl -s -X PATCH \
  -H "x-internal-secret: ${INTERNAL_API_SECRET}" \
  -H "x-authentik-uid: 7" \
  -H "content-type: application/json" \
  -d '{"mail_signal_notify":true}' \
  http://${API_IP}:3001/users/me/preferences | jq '{mail_signal_notify}'
```

Expected: `{"mail_signal_notify": true}`

```bash
# Reset
curl -s -X PATCH \
  -H "x-internal-secret: ${INTERNAL_API_SECRET}" \
  -H "x-authentik-uid: 7" \
  -H "content-type: application/json" \
  -d '{"mail_signal_notify":false}' \
  http://${API_IP}:3001/users/me/preferences | jq '{mail_signal_notify}'
```

- [ ] **Step 6: Test mail stats endpoint**

```bash
source /srv/platform/.env
API_IP=$(docker inspect platform-api-1 --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}')
curl -s -H "x-internal-secret: ${INTERNAL_API_SECRET}" -H "x-authentik-uid: 7" \
  http://${API_IP}:3001/users/me/mail/stats | jq .
```

Expected: either `{"unread": <n>, "folders": [...]}` on success, or an error with Mailcow connection details (if Mailcow IMAP is not accessible from the API container at this moment).

- [ ] **Step 7: Take screenshot of dashboard mail page**

```bash
source /srv/platform/.env
mkdir -p /root/.claude/jobs/b7ebd919/screenshots
chromium --headless --no-sandbox --disable-gpu \
  --screenshot=/root/.claude/jobs/b7ebd919/screenshots/mail-page.png \
  --window-size=1280,900 \
  "https://portal.${PRIMARY_DOMAIN}/dashboard/mail" 2>/dev/null
echo "Screenshot saved"
```

- [ ] **Step 8: Final commit with run-platform smoke script note**

```bash
cd /srv/platform
git status
# If there are no uncommitted changes, just tag completion
git log --oneline -5
```

All 17 tasks complete. The mail module is live.
