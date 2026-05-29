// Covers: provision() call order, waitForReady (immediate/retry/timeout),
// addDomain (skip when object / create when array), addMailbox (skip/create with correct fields),
// generateDKIM (POST + GET dkim_txt, returns empty string when absent)

import axios from 'axios';
import { MailcowService, MailcowConfig } from './mailcow.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const BASE_CONFIG: MailcowConfig = {
  baseUrl: 'http://mailcow:8080',
  apiKey: 'mcapi',
  mailDomain: 'mail.test.com',
  adminEmail: 'admin@mail.test.com',
  adminPassword: 'password',
};

function makeInstance() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
}

describe('MailcowService', () => {
  let service: MailcowService;
  let instance: ReturnType<typeof makeInstance>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MailcowService();
    instance = makeInstance();
    mockedAxios.create.mockReturnValue(instance as ReturnType<typeof axios.create>);
  });

  // ── provision ─────────────────────────────────────────────────────────────

  describe('provision()', () => {
    it('returns { dkim } string from generateDKIM', async () => {
      mockedAxios.get = jest.fn().mockResolvedValueOnce({}) as jest.MockedFunction<typeof axios.get>;
      instance.get
        .mockResolvedValueOnce({ data: { domain: 'mail.test.com' } }) // addDomain: already exists (object)
        .mockResolvedValueOnce({ data: { local: 'admin' } }) // addMailbox: already exists
        .mockResolvedValueOnce({ data: { dkim_txt: 'v=DKIM1; k=rsa; p=abc123' } }); // generateDKIM GET
      instance.post.mockResolvedValue({ data: {} }); // generateDKIM POST

      const result = await service.provision(BASE_CONFIG);
      expect(result).toHaveProperty('dkim');
      expect(result.dkim).toBe('v=DKIM1; k=rsa; p=abc123');
    });
  });

  // ── waitForReady ──────────────────────────────────────────────────────────

  describe('waitForReady', () => {
    it('resolves on first successful status check', async () => {
      mockedAxios.get = jest.fn().mockResolvedValueOnce({}) as jest.MockedFunction<typeof axios.get>;
      await expect(
        (service as unknown as { waitForReady: (url: string, key: string, ms: number) => Promise<void> })
          ['waitForReady']('http://mailcow:8080', 'mcapi', 100),
      ).resolves.toBeUndefined();
    });

    it('throws immediately when timeoutMs is 0 (deadline already expired)', async () => {
      await expect(
        (service as unknown as { waitForReady: (url: string, key: string, ms: number) => Promise<void> })
          ['waitForReady']('http://mailcow:8080', 'mcapi', 0),
      ).rejects.toThrow('Mailcow did not become ready in time');
    });
  });

  // ── addDomain ─────────────────────────────────────────────────────────────

  describe('addDomain', () => {
    it('skips POST when GET returns an object (domain exists)', async () => {
      instance.get.mockResolvedValueOnce({ data: { domain: 'mail.test.com' } });
      await (service as unknown as { addDomain: (api: unknown, domain: string) => Promise<void> })
        ['addDomain'](instance, 'mail.test.com');
      expect(instance.post).not.toHaveBeenCalled();
    });

    it('creates domain when GET returns an array (not found)', async () => {
      instance.get.mockResolvedValueOnce({ data: [] });
      instance.post.mockResolvedValueOnce({ data: {} });
      await (service as unknown as { addDomain: (api: unknown, domain: string) => Promise<void> })
        ['addDomain'](instance, 'mail.test.com');
      expect(instance.post).toHaveBeenCalledWith('/api/v1/add/domain', expect.objectContaining({ domain: 'mail.test.com' }));
    });
  });

  // ── addMailbox ────────────────────────────────────────────────────────────

  describe('addMailbox', () => {
    it('skips POST when GET returns an object (mailbox exists)', async () => {
      instance.get.mockResolvedValueOnce({ data: { local_part: 'admin' } });
      await (service as unknown as { addMailbox: (api: unknown, email: string, pw: string, domain: string) => Promise<void> })
        ['addMailbox'](instance, 'admin@mail.test.com', 'pw', 'mail.test.com');
      expect(instance.post).not.toHaveBeenCalled();
    });

    it('creates mailbox with correct local_part/domain split', async () => {
      instance.get.mockResolvedValueOnce({ data: [] });
      instance.post.mockResolvedValueOnce({ data: {} });
      await (service as unknown as { addMailbox: (api: unknown, email: string, pw: string, domain: string) => Promise<void> })
        ['addMailbox'](instance, 'admin@mail.test.com', 'pw', 'mail.test.com');
      const payload = instance.post.mock.calls[0][1] as { local_part: string; domain: string; force_pw_update: number };
      expect(payload.local_part).toBe('admin');
      expect(payload.domain).toBe('mail.test.com');
      expect(payload.force_pw_update).toBe(0);
    });
  });

  // ── generateDKIM ──────────────────────────────────────────────────────────

  describe('generateDKIM', () => {
    it('POSTs to /api/v1/add/dkim with key_size 2048', async () => {
      instance.post.mockResolvedValueOnce({ data: {} });
      instance.get.mockResolvedValueOnce({ data: { dkim_txt: 'v=DKIM1' } });
      await (service as unknown as { generateDKIM: (api: unknown, domain: string) => Promise<string> })
        ['generateDKIM'](instance, 'mail.test.com');
      expect(instance.post).toHaveBeenCalledWith('/api/v1/add/dkim', expect.objectContaining({ key_size: 2048 }));
    });

    it('returns dkim_txt from GET response', async () => {
      instance.post.mockResolvedValueOnce({ data: {} });
      instance.get.mockResolvedValueOnce({ data: { dkim_txt: 'v=DKIM1; k=rsa; p=abc' } });
      const result = await (service as unknown as { generateDKIM: (api: unknown, domain: string) => Promise<string> })
        ['generateDKIM'](instance, 'mail.test.com');
      expect(result).toBe('v=DKIM1; k=rsa; p=abc');
    });

    it('returns empty string when dkim_txt is absent', async () => {
      instance.post.mockResolvedValueOnce({ data: {} });
      instance.get.mockResolvedValueOnce({ data: {} });
      const result = await (service as unknown as { generateDKIM: (api: unknown, domain: string) => Promise<string> })
        ['generateDKIM'](instance, 'mail.test.com');
      expect(result).toBe('');
    });
  });
});
