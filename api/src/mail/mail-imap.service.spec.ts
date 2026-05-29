// api/src/mail/mail-imap.service.spec.ts
// Original: sanitizeHtml, createClient
// Added: getCredentials (existing password / generate+reset), resetMailcowPassword (bcrypt+BLF-CRYPT, close in finally),
// storePasswordInAuthentik, getStats (totalUnread from INBOX, logout in finally),
// getMessages (empty / pagination), markSeen, deleteMessage (trash/move), getVacation, setVacation
//
// jest.mock calls below are hoisted before imports by Jest, so they prevent loading ESM-only jsdom deps
// that are triggered by the module-level `new JSDOM('')` call in mail-imap.service.ts.

jest.mock('jsdom', () => ({
  JSDOM: class MockJSDOM {
    window = { document: {}, Node: {}, Element: {}, HTMLElement: {} };
  },
}));
jest.mock('dompurify', () => {
  // __esModule: true tells Jest this is an ES module mock so `default` is the default export
  const sanitizer = (_win: unknown) => ({
    sanitize: (html: string, opts?: { FORBID_TAGS?: string[]; FORBID_ATTR?: string[] }) => {
      if (!html) return '';
      let result = html;
      for (const tag of opts?.FORBID_TAGS ?? []) {
        result = result.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
        result = result.replace(new RegExp(`<${tag}[^>]*\\/?>`, 'gi'), '');
      }
      for (const attr of opts?.FORBID_ATTR ?? []) {
        result = result.replace(new RegExp(` ${attr}="[^"]*"`, 'gi'), '');
        result = result.replace(new RegExp(` ${attr}='[^']*'`, 'gi'), '');
        result = result.replace(new RegExp(` ${attr}\\b`, 'gi'), '');
      }
      return result;
    },
  });
  return { __esModule: true, default: sanitizer };
});
jest.mock('axios');
jest.mock('bcrypt', () => ({ hash: jest.fn() }));
jest.mock('mysql2/promise', () => ({ createConnection: jest.fn() }));

import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { MailImapService } from './mail-imap.service';
import { ConfigService } from '@nestjs/config';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

function makeService(): MailImapService {
  const config = {
    get: (key: string) => {
      const map: Record<string, string> = {
        AUTHENTIK_URL: 'http://auth:9000',
        AUTHENTIK_BOOTSTRAP_TOKEN: 'token',
        MAILCOW_URL: 'http://mailcow:8080',
        MAILCOW_API_KEY: 'key',
        IMAP_HOST: 'dovecot-mailcow',
        MAILCOW_DB_HOST: 'mysql-mailcow',
        MAILCOW_DB_NAME: 'mailcow',
        MAILCOW_DB_USER: 'mailcow',
        MAILCOW_DB_PASS: 'pw',
      };
      return map[key] ?? '';
    },
  } as unknown as ConfigService;
  return new MailImapService(config);
}

function makeImapClient(overrides: Partial<{
  list: jest.Mock; status: jest.Mock; mailboxOpen: jest.Mock;
  fetch: jest.Mock; fetchOne: jest.Mock; messageFlagsAdd: jest.Mock;
  messageMove: jest.Mock; messageDelete: jest.Mock; connect: jest.Mock; logout: jest.Mock;
}> = {}) {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([]),
    status: jest.fn().mockResolvedValue({ unseen: 0, messages: 0 }),
    mailboxOpen: jest.fn().mockResolvedValue({}),
    fetch: jest.fn().mockReturnValue((async function* () {})()),
    fetchOne: jest.fn().mockResolvedValue(null),
    messageFlagsAdd: jest.fn().mockResolvedValue(undefined),
    messageMove: jest.fn().mockResolvedValue(undefined),
    messageDelete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('MailImapService', () => {
  let service: MailImapService;

  beforeEach(() => {
    jest.clearAllMocks();
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
      const result = service.sanitizeHtml('<img onload="fetch(/**/)" src="x">');
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
    it('creates an ImapFlow instance with connect and logout methods', () => {
      const client = service.createClient({ user: 'a@b.com', pass: 'secret' });
      expect(client).toBeDefined();
      expect(typeof client.connect).toBe('function');
      expect(typeof client.logout).toBe('function');
    });
  });

  // ── getCredentials ────────────────────────────────────────────────────────

  describe('getCredentials()', () => {
    it('returns existing mail_imap_password from Authentik attributes', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 1, email: 'alice@test.com', attributes: { mail_imap_password: 'stored-pw' } }] },
      }) as jest.MockedFunction<typeof axios.get>;
      const creds = await service.getCredentials('alice');
      expect(creds).toEqual({ user: 'alice@test.com', pass: 'stored-pw' });
    });

    it('generates new password when attribute missing, resets Mailcow and stores in Authentik', async () => {
      const mysql2 = jest.requireMock('mysql2/promise') as { createConnection: jest.Mock };
      const mockConn = { execute: jest.fn().mockResolvedValue([{}]), end: jest.fn().mockResolvedValue(undefined) };
      (mysql2.createConnection as jest.Mock).mockResolvedValue(mockConn);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$hash');

      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 1, email: 'alice@test.com', attributes: {} }] },
      }) as jest.MockedFunction<typeof axios.get>;
      mockedAxios.patch.mockResolvedValueOnce({ data: {} }) as jest.MockedFunction<typeof axios.patch>;

      const creds = await service.getCredentials('alice');
      expect(creds.user).toBe('alice@test.com');
      expect(creds.pass).toMatch(/Aa1!$/);
      expect(mockConn.execute).toHaveBeenCalledWith(
        'UPDATE mailbox SET password = ? WHERE username = ?',
        [expect.stringContaining('{BLF-CRYPT}'), 'alice@test.com'],
      );
      expect(mockedAxios.patch).toHaveBeenCalled();
    });

    it('throws Error when Authentik user not found', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { results: [] } }) as jest.MockedFunction<typeof axios.get>;
      await expect(service.getCredentials('nobody')).rejects.toThrow('User not found: nobody');
    });
  });

  // ── resetMailcowPassword ──────────────────────────────────────────────────

  describe('resetMailcowPassword', () => {
    it('closes MySQL connection in finally block even on error', async () => {
      const mysql2 = jest.requireMock('mysql2/promise') as { createConnection: jest.Mock };
      const mockConn = { execute: jest.fn().mockRejectedValue(new Error('DB error')), end: jest.fn().mockResolvedValue(undefined) };
      (mysql2.createConnection as jest.Mock).mockResolvedValue(mockConn);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$hash');

      await expect(
        (service as unknown as { resetMailcowPassword: (e: string, p: string) => Promise<void> })
          ['resetMailcowPassword']('alice@test.com', 'pw'),
      ).rejects.toThrow();
      expect(mockConn.end).toHaveBeenCalled();
    });

    it('prepends {BLF-CRYPT} to bcrypt hash', async () => {
      const mysql2 = jest.requireMock('mysql2/promise') as { createConnection: jest.Mock };
      const mockConn = { execute: jest.fn().mockResolvedValue([{}]), end: jest.fn().mockResolvedValue(undefined) };
      (mysql2.createConnection as jest.Mock).mockResolvedValue(mockConn);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$xyz');

      await (service as unknown as { resetMailcowPassword: (e: string, p: string) => Promise<void> })
        ['resetMailcowPassword']('alice@test.com', 'pw');

      const [storedHash] = mockConn.execute.mock.calls[0][1] as string[];
      expect(storedHash).toBe('{BLF-CRYPT}$2b$10$xyz');
    });
  });

  // ── getStats ──────────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('returns totalUnread from INBOX folder', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 1, email: 'a@t.com', attributes: { mail_imap_password: 'pw' } }] },
      }) as jest.MockedFunction<typeof axios.get>;

      const imapClient = makeImapClient({
        list: jest.fn().mockResolvedValue([{ path: 'INBOX', name: 'INBOX' }]),
        status: jest.fn().mockResolvedValue({ unseen: 5 }),
      });
      jest.spyOn(service, 'createClient').mockReturnValue(imapClient as unknown as ReturnType<typeof service.createClient>);

      const stats = await service.getStats('alice');
      expect(stats.unread).toBe(5);
    });

    it('calls client.logout() in finally block', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 1, email: 'a@t.com', attributes: { mail_imap_password: 'pw' } }] },
      }) as jest.MockedFunction<typeof axios.get>;

      const imapClient = makeImapClient({ list: jest.fn().mockResolvedValue([]) });
      jest.spyOn(service, 'createClient').mockReturnValue(imapClient as unknown as ReturnType<typeof service.createClient>);

      await service.getStats('alice');
      expect(imapClient.logout).toHaveBeenCalled();
    });
  });

  // ── getMessages ───────────────────────────────────────────────────────────

  describe('getMessages()', () => {
    it('returns empty array with total:0 when folder has no messages', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 1, email: 'a@t.com', attributes: { mail_imap_password: 'pw' } }] },
      }) as jest.MockedFunction<typeof axios.get>;
      const imapClient = makeImapClient({ status: jest.fn().mockResolvedValue({ messages: 0 }) });
      jest.spyOn(service, 'createClient').mockReturnValue(imapClient as unknown as ReturnType<typeof service.createClient>);

      const result = await service.getMessages('alice', 'INBOX', 1, 25);
      expect(result).toEqual({ messages: [], total: 0 });
    });

    it('reverses message order (most recent first)', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 1, email: 'a@t.com', attributes: { mail_imap_password: 'pw' } }] },
      }) as jest.MockedFunction<typeof axios.get>;

      const msgs = [
        { uid: 1, envelope: { from: [{ address: 'a@b.com', name: '' }], subject: 'First', date: new Date() }, flags: new Set() },
        { uid: 2, envelope: { from: [{ address: 'b@c.com', name: '' }], subject: 'Second', date: new Date() }, flags: new Set() },
      ];
      async function* gen() { for (const m of msgs) yield m; }

      const imapClient = makeImapClient({
        status: jest.fn().mockResolvedValue({ messages: 2 }),
        fetch: jest.fn().mockReturnValue(gen()),
      });
      jest.spyOn(service, 'createClient').mockReturnValue(imapClient as unknown as ReturnType<typeof service.createClient>);

      const result = await service.getMessages('alice', 'INBOX', 1, 25);
      expect(result.messages[0].uid).toBe(2); // reversed
    });
  });

  // ── markSeen ──────────────────────────────────────────────────────────────

  describe('markSeen()', () => {
    it('opens mailbox with readOnly:false and adds \\Seen flag', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 1, email: 'a@t.com', attributes: { mail_imap_password: 'pw' } }] },
      }) as jest.MockedFunction<typeof axios.get>;
      const imapClient = makeImapClient();
      jest.spyOn(service, 'createClient').mockReturnValue(imapClient as unknown as ReturnType<typeof service.createClient>);

      await service.markSeen('alice', 'INBOX', 42);
      expect(imapClient.mailboxOpen).toHaveBeenCalledWith('INBOX', { readOnly: false });
      expect(imapClient.messageFlagsAdd).toHaveBeenCalledWith('42', ['\\Seen'], { uid: true });
    });
  });

  // ── deleteMessage ─────────────────────────────────────────────────────────

  describe('deleteMessage()', () => {
    it('permanently deletes when folder is Trash', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 1, email: 'a@t.com', attributes: { mail_imap_password: 'pw' } }] },
      }) as jest.MockedFunction<typeof axios.get>;
      const imapClient = makeImapClient();
      jest.spyOn(service, 'createClient').mockReturnValue(imapClient as unknown as ReturnType<typeof service.createClient>);

      await service.deleteMessage('alice', 'Trash', 42);
      expect(imapClient.messageDelete).toHaveBeenCalledWith('42', { uid: true });
      expect(imapClient.messageMove).not.toHaveBeenCalled();
    });

    it('moves to Trash when folder is not trash', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 1, email: 'a@t.com', attributes: { mail_imap_password: 'pw' } }] },
      }) as jest.MockedFunction<typeof axios.get>;
      const imapClient = makeImapClient();
      jest.spyOn(service, 'createClient').mockReturnValue(imapClient as unknown as ReturnType<typeof service.createClient>);

      await service.deleteMessage('alice', 'INBOX', 42);
      expect(imapClient.messageMove).toHaveBeenCalledWith('42', 'Trash', { uid: true });
      expect(imapClient.messageDelete).not.toHaveBeenCalled();
    });
  });

  // ── getVacation ───────────────────────────────────────────────────────────

  describe('getVacation()', () => {
    it('returns active:true when vacation_active is "1"', async () => {
      mockedAxios.get = jest.fn()
        .mockResolvedValueOnce({ data: { results: [{ pk: 1, email: 'a@t.com', attributes: { mail_imap_password: 'pw' } }] } })
        .mockResolvedValueOnce({ data: { vacation_active: '1', vacation_subject: 'OOO', vacation_body: 'I am away' } })
      const state = await service.getVacation('alice');
      expect(state.active).toBe(true);
      expect(state.subject).toBe('OOO');
    });

    it('returns { active: false, subject: \'\', body: \'\' } on API failure', async () => {
      mockedAxios.get = jest.fn()
        .mockResolvedValueOnce({ data: { results: [{ pk: 1, email: 'a@t.com', attributes: { mail_imap_password: 'pw' } }] } })
        .mockRejectedValueOnce(new Error('timeout'))
      const state = await service.getVacation('alice');
      expect(state).toEqual({ active: false, subject: '', body: '' });
    });
  });

  // ── setVacation ───────────────────────────────────────────────────────────

  describe('setVacation()', () => {
    it('POSTs correct payload format and returns requested state', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 1, email: 'alice@test.com', attributes: { mail_imap_password: 'pw' } }] },
      }) as jest.MockedFunction<typeof axios.get>;
      mockedAxios.post.mockResolvedValueOnce({ data: {} }) as jest.MockedFunction<typeof axios.post>;

      const result = await service.setVacation('alice', true, 'Out of office', 'Back Monday');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/edit/mailbox'),
        [expect.objectContaining({ attr: expect.objectContaining({ vacation_active: '1' }), items: ['alice@test.com'] })],
        expect.any(Object),
      );
      expect(result).toEqual({ active: true, subject: 'Out of office', body: 'Back Monday' });
    });
  });
});
