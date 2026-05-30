// Covers: ensureUserAndWorkflow orchestration, ensureUser (skip/create, name split),
// ensureMailAccount (skip/create — flags hardcoded mail.cbrains.de), ensureMailRule (skip/create),
// ensureWorkflow (skip/create with full nested trigger+action objects)
//
// BUG DOCUMENTED: paperless.service.ts:49 — Math.random() used for password generation.
//   Not cryptographically secure. Use crypto.randomBytes(16).toString('base64url') instead.
//   Reference: mail-imap.service.ts uses the correct pattern.
//
// BUG DOCUMENTED: paperless.service.ts:68 — imap_server is hardcoded as 'mail.cbrains.de'.
//   Should be: this.config.get('MAIL_IMAP_HOST') ?? 'dovecot-mailcow'

import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { PaperlessService } from './paperless.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeService(): PaperlessService {
  const cfg = {
    get: (k: string) => ({ PAPERLESS_INTERNAL_URL: 'http://paperless:8000', PAPERLESS_API_TOKEN: 'tok', MAIL_IMAP_HOST: 'mail.cbrains.de' }[k] ?? ''),
  } as unknown as ConfigService;
  return new PaperlessService(cfg);
}

function makeInstance() {
  return {
    get: jest.fn(),
    post: jest.fn(),
  };
}

describe('PaperlessService', () => {
  let service: PaperlessService;
  let instance: ReturnType<typeof makeInstance>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
    instance = makeInstance();
    mockedAxios.create.mockReturnValue(instance as ReturnType<typeof axios.create>);
  });

  // ── ensureUserAndWorkflow ─────────────────────────────────────────────────

  describe('ensureUserAndWorkflow()', () => {
    it('calls ensureUser then ensureWorkflow', async () => {
      instance.get
        .mockResolvedValueOnce({ data: { results: [{ id: 5, username: 'alice' }] } }) // ensureUser: exists
        .mockResolvedValueOnce({ data: { results: [] } }) // ensureWorkflow: listWorkflows
        .mockResolvedValueOnce({ data: {} }); // trigger GET stub
      instance.post.mockResolvedValue({ data: { id: 10 } });

      await service.ensureUserAndWorkflow('alice', 'alice@test.com', 'Alice Smith');

      // ensureUser was called (GET /api/users/)
      expect(instance.get.mock.calls[0][0]).toContain('/api/users/');
    });

    it('calls ensureMailAccount only when mailPassword is provided', async () => {
      instance.get
        .mockResolvedValueOnce({ data: { results: [{ id: 5, username: 'alice' }] } }) // ensureUser: exists
        .mockResolvedValueOnce({ data: { results: [] } }) // ensureWorkflow: list
        .mockResolvedValueOnce({ data: {} }); // trigger GET stub
      instance.post.mockResolvedValue({ data: { id: 10 } });

      await service.ensureUserAndWorkflow('alice', 'alice@test.com', 'Alice Smith');

      // No mail_accounts GET call
      const urls = instance.get.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes('mail_accounts'))).toBe(false);
    });

    it('calls ensureMailAccount when mailPassword is provided', async () => {
      // GETs in order: ensureUser (users), ensureWorkflow (workflows),
      //                ensureMailAccount (mail_accounts), ensureMailRule (mail_rules)
      instance.get
        .mockResolvedValueOnce({ data: { results: [{ id: 5, username: 'alice' }] } }) // ensureUser
        .mockResolvedValueOnce({ data: { results: [] } }) // ensureWorkflow: list workflows
        .mockResolvedValueOnce({ data: { results: [] } }) // ensureMailAccount: list accounts
        .mockResolvedValueOnce({ data: { results: [] } }); // ensureMailRule: list rules
      instance.post.mockResolvedValue({ data: { id: 10 } });

      await service.ensureUserAndWorkflow('alice', 'alice@test.com', 'Alice', 'mailpw');
      const urls = instance.get.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes('mail_accounts'))).toBe(true);
    });
  });

  // ── ensureUser ────────────────────────────────────────────────────────────

  describe('ensureUser', () => {
    it('returns existing user id when username matches', async () => {
      instance.get.mockResolvedValueOnce({ data: { results: [{ id: 7, username: 'alice' }] } });
      const id = await (service as unknown as { ensureUser: (u: string, e: string, n: string) => Promise<number> })
        ['ensureUser']('alice', 'alice@test.com', 'Alice');
      expect(id).toBe(7);
      expect(instance.post).not.toHaveBeenCalled();
    });

    it('creates user when username not found', async () => {
      instance.get.mockResolvedValueOnce({ data: { results: [] } });
      instance.post.mockResolvedValueOnce({ data: { id: 12 } });
      const id = await (service as unknown as { ensureUser: (u: string, e: string, n: string) => Promise<number> })
        ['ensureUser']('alice', 'alice@test.com', 'Alice Smith');
      expect(id).toBe(12);
    });

    it('splits name into first_name and last_name correctly', async () => {
      instance.get.mockResolvedValueOnce({ data: { results: [] } });
      instance.post.mockResolvedValueOnce({ data: { id: 1 } });
      await (service as unknown as { ensureUser: (u: string, e: string, n: string) => Promise<number> })
        ['ensureUser']('alice', 'alice@test.com', 'Alice Van Smith');
      const payload = instance.post.mock.calls[0][1] as { first_name: string; last_name: string };
      expect(payload.first_name).toBe('Alice');
      expect(payload.last_name).toBe('Van Smith');
    });

    it('uses username as first_name when name is empty', async () => {
      instance.get.mockResolvedValueOnce({ data: { results: [] } });
      instance.post.mockResolvedValueOnce({ data: { id: 1 } });
      await (service as unknown as { ensureUser: (u: string, e: string, n: string) => Promise<number> })
        ['ensureUser']('alice', 'alice@test.com', '');
      const payload = instance.post.mock.calls[0][1] as { first_name: string };
      expect(payload.first_name).toBe('alice');
    });

    it('assigns user to group [1]', async () => {
      instance.get.mockResolvedValueOnce({ data: { results: [] } });
      instance.post.mockResolvedValueOnce({ data: { id: 1 } });
      await (service as unknown as { ensureUser: (u: string, e: string, n: string) => Promise<number> })
        ['ensureUser']('alice', 'alice@test.com', 'Alice');
      expect((instance.post.mock.calls[0][1] as { groups: number[] }).groups).toEqual([1]);
    });

    // TODO (SECURITY BUG): paperless.service.ts:49 — Math.random() is NOT cryptographically secure.
    // The Paperless user password is generated as `Math.random().toString(36).slice(2)}Aa1!`
    // Fix: replace with crypto.randomBytes(16).toString('base64url') + 'Aa1!'
    // Evidence: mail-imap.service.ts already uses the correct crypto.randomBytes pattern.
    it('TODO BUG: password generation uses Math.random (not crypto-secure)', async () => {
      instance.get.mockResolvedValueOnce({ data: { results: [] } });
      instance.post.mockResolvedValueOnce({ data: { id: 1 } });
      await (service as unknown as { ensureUser: (u: string, e: string, n: string) => Promise<number> })
        ['ensureUser']('alice', 'alice@test.com', 'Alice');
      // This test documents the current behavior — not a security endorsement
      const pw = (instance.post.mock.calls[0][1] as { password: string }).password;
      expect(pw).toMatch(/Aa1!$/); // suffix is present; base is Math.random (insecure)
    });
  });

  // ── ensureMailAccount ─────────────────────────────────────────────────────

  describe('ensureMailAccount', () => {
    it('skips creation when account already exists, calls ensureMailRule', async () => {
      instance.get
        .mockResolvedValueOnce({ data: { results: [{ id: 3, username: 'alice@test.com' }] } }) // mail_accounts
        .mockResolvedValueOnce({ data: { results: [] } }); // mail_rules
      instance.post.mockResolvedValue({ data: {} });

      await (service as unknown as { ensureMailAccount: (u: string, e: string, o: number, p: string) => Promise<void> })
        ['ensureMailAccount']('alice', 'alice@test.com', 5, 'pw');

      // POST to mail_accounts should NOT have been called
      const postUrls = instance.post.mock.calls.map((c) => c[0] as string);
      expect(postUrls.some((u) => u.includes('mail_accounts'))).toBe(false);
    });

    // TODO (CONFIG BUG): paperless.service.ts:68 — imap_server is hardcoded as 'mail.cbrains.de'
    // Fix: this.config.get('MAIL_IMAP_HOST') ?? 'dovecot-mailcow'
    it('TODO BUG: creates account with hardcoded imap_server mail.cbrains.de', async () => {
      instance.get
        .mockResolvedValueOnce({ data: { results: [] } }) // no existing accounts
        .mockResolvedValueOnce({ data: { results: [] } }); // mail_rules
      instance.post.mockResolvedValue({ data: { id: 8 } });

      await (service as unknown as { ensureMailAccount: (u: string, e: string, o: number, p: string) => Promise<void> })
        ['ensureMailAccount']('alice', 'alice@test.com', 5, 'pw');

      const payload = instance.post.mock.calls[0][1] as { imap_server: string; imap_port: number; imap_security: number };
      expect(payload.imap_server).toBe('mail.cbrains.de'); // documents the hardcoded value
      expect(payload.imap_port).toBe(993);
      expect(payload.imap_security).toBe(2);
    });
  });

  // ── ensureMailRule ────────────────────────────────────────────────────────

  describe('ensureMailRule', () => {
    it('skips creation when rule already exists', async () => {
      instance.get.mockResolvedValueOnce({ data: { results: [{ name: 'Email alice → import' }] } });
      await (service as unknown as { ensureMailRule: (u: string, a: number, o: number) => Promise<void> })
        ['ensureMailRule']('alice', 1, 5);
      expect(instance.post).not.toHaveBeenCalled();
    });

    it('creates rule with correct name format and action', async () => {
      instance.get.mockResolvedValueOnce({ data: { results: [] } });
      instance.post.mockResolvedValueOnce({ data: {} });
      await (service as unknown as { ensureMailRule: (u: string, a: number, o: number) => Promise<void> })
        ['ensureMailRule']('alice', 1, 5);
      const payload = instance.post.mock.calls[0][1] as { name: string; action: number; folder: string; assign_owner_from_rule: boolean };
      expect(payload.name).toBe('Email alice → import');
      expect(payload.action).toBe(3);
      expect(payload.folder).toBe('INBOX');
      expect(payload.assign_owner_from_rule).toBe(true);
    });
  });

  // ── ensureWorkflow ────────────────────────────────────────────────────────

  describe('ensureWorkflow', () => {
    it('skips creation when workflow already exists', async () => {
      instance.get.mockResolvedValueOnce({ data: { results: [{ name: 'Consume folder → alice' }] } });
      await (service as unknown as { ensureWorkflow: (u: string, o: number) => Promise<void> })
        ['ensureWorkflow']('alice', 5);
      expect(instance.post).not.toHaveBeenCalled();
    });

    it('creates trigger with correct filter_path', async () => {
      instance.get.mockResolvedValueOnce({ data: { results: [] } }); // list workflows
      instance.post
        .mockResolvedValueOnce({ data: { id: 1, type: 1 } })  // trigger
        .mockResolvedValueOnce({ data: { id: 2, type: 1 } })  // action
        .mockResolvedValueOnce({ data: {} });                   // workflow
      await (service as unknown as { ensureWorkflow: (u: string, o: number) => Promise<void> })
        ['ensureWorkflow']('alice', 5);
      const triggerPayload = instance.post.mock.calls[0][1] as { filter_path: string };
      expect(triggerPayload.filter_path).toBe('*/consume/alice/*');
    });

    it('posts workflow with nested trigger and action objects', async () => {
      instance.get.mockResolvedValueOnce({ data: { results: [] } });
      const triggerObj = { id: 1, type: 1 };
      const actionObj = { id: 2, type: 1 };
      instance.post
        .mockResolvedValueOnce({ data: triggerObj })
        .mockResolvedValueOnce({ data: actionObj })
        .mockResolvedValueOnce({ data: {} });
      await (service as unknown as { ensureWorkflow: (u: string, o: number) => Promise<void> })
        ['ensureWorkflow']('alice', 5);
      const wfPayload = instance.post.mock.calls[2][1] as { triggers: unknown[]; actions: unknown[]; name: string };
      expect(wfPayload.triggers[0]).toEqual(triggerObj);
      expect(wfPayload.actions[0]).toEqual(actionObj);
      expect(wfPayload.name).toBe('Consume folder → alice');
    });
  });
});
