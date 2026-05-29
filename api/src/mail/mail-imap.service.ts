// api/src/mail/mail-imap.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as mysql2 from 'mysql2/promise';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import axios from 'axios';
import type { MailStats, MailMessage, MailDetail, FolderStat, VacationState } from './mail.dto';

const { window: purifyWindow } = new JSDOM('');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DOMPurify = createDOMPurify(purifyWindow as any);

@Injectable()
export class MailImapService {
  private readonly logger = new Logger(MailImapService.name);
  private readonly authentikUrl: string;
  private readonly authentikToken: string;
  private readonly mailcowUrl: string;
  private readonly mailcowApiKey: string;
  private readonly imapHost: string;
  private readonly mailcowDb: { host: string; database: string; user: string; password: string };

  constructor(private readonly config: ConfigService) {
    this.authentikUrl = config.get('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
    this.authentikToken = config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
    this.mailcowUrl = config.get('MAILCOW_URL') ?? 'http://nginx-mailcow:8080';
    this.mailcowApiKey = config.get('MAILCOW_API_KEY') ?? '';
    this.imapHost = config.get('IMAP_HOST') ?? 'dovecot-mailcow';
    this.mailcowDb = {
      host: config.get('MAILCOW_DB_HOST') ?? 'mysql-mailcow',
      database: config.get('MAILCOW_DB_NAME') ?? 'mailcow',
      user: config.get('MAILCOW_DB_USER') ?? 'mailcow',
      password: config.get('MAILCOW_DB_PASS') ?? '',
    };
  }

  // ── Credentials ───────────────────────────────────────────────────────────

  async getCredentials(username: string): Promise<{ user: string; pass: string }> {
    const { data: listData } = await axios.get<{ results: Array<{ pk: number; email: string; attributes: Record<string, string> }> }>(
      `${this.authentikUrl}/api/v3/core/users/`,
      { headers: { Authorization: `Bearer ${this.authentikToken}` }, params: { username, page_size: 1 }, timeout: 8_000 },
    );
    const authUser = listData.results?.[0];
    if (!authUser) throw new Error(`User not found: ${username}`);

    const email = authUser.email as string;
    let password = (authUser.attributes as Record<string, string>)?.mail_imap_password;

    if (!password) {
      password = crypto.randomBytes(16).toString('base64url') + 'Aa1!';
      const mailboxExists = await this.checkMailboxExists(email);
      if (mailboxExists) {
        this.logger.log(`Resetting IMAP password for ${email} (mailbox exists, no stored password)`);
        await this.resetMailcowPassword(email, password);
      } else {
        this.logger.log(`Creating missing mailbox for ${email} and storing password`);
        await this.createMailboxViaApi(email, password);
      }
      await this.storePasswordInAuthentik(String(authUser.pk), authUser.attributes ?? {}, password);
    }

    return { user: email, pass: password };
  }

  private async checkMailboxExists(email: string): Promise<boolean> {
    try {
      const { data } = await axios.get(`${this.mailcowUrl}/api/v1/get/mailbox/${email}`, {
        headers: { 'X-API-Key': this.mailcowApiKey },
        timeout: 8_000,
      });
      return data && !Array.isArray(data) && typeof data === 'object' && 'username' in data;
    } catch {
      return false;
    }
  }

  private async createMailboxViaApi(email: string, password: string): Promise<void> {
    const [local, domain] = email.split('@');
    try {
      await axios.post(`${this.mailcowUrl}/api/v1/add/mailbox`, {
        local_part: local,
        domain,
        name: local,
        password,
        password2: password,
        quota: 3072,
        active: 1,
        force_pw_update: 0,
      }, {
        headers: { 'X-API-Key': this.mailcowApiKey },
        timeout: 15_000,
      });
      this.logger.log(`Created missing mailbox: ${email}`);
    } catch (err) {
      this.logger.error(`Failed to create mailbox ${email}: ${(err as Error).message}`);
      throw err;
    }
  }

  private async resetMailcowPassword(email: string, password: string): Promise<void> {
    const hash = await bcrypt.hash(password, 10);
    const conn = await mysql2.createConnection({
      host: this.mailcowDb.host,
      database: this.mailcowDb.database,
      user: this.mailcowDb.user,
      password: this.mailcowDb.password,
    });
    try {
      await conn.execute(
        'UPDATE mailbox SET password = ? WHERE username = ?',
        [`{BLF-CRYPT}${hash}`, email],
      );
    } finally {
      await conn.end();
    }
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
        const status = await client.status(folder.path, { unseen: true });
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
      const status = await client.status(folder, { messages: true });
      const total = status.messages ?? 0;
      if (total === 0) return { messages: [], total: 0 };

      await client.mailboxOpen(folder);

      // Fetch most-recent messages: sequence range (descending)
      const rangeEnd = total - (page - 1) * limit;
      if (rangeEnd < 1) return { messages: [], total };
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
          seen: msg.flags?.has('\\Seen') ?? false,
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
      const toAddr = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
      const ccAddr = Array.isArray(parsed.cc) ? parsed.cc[0] : parsed.cc;

      return {
        uid: msgUid,
        from: parsed.from?.text ?? '',
        to: toAddr?.text ?? '',
        cc: ccAddr?.text ?? '',
        subject: parsed.subject ?? '(no subject)',
        date: parsed.date?.toISOString() ?? '',
        seen: msg.flags?.has('\\Seen') ?? false,
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
    } catch (err) {
      this.logger.warn(`getVacation Mailcow request failed: ${(err as Error).message}`);
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
