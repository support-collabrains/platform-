// Covers: onboardUser (skip non-internal, create dirs, mail domain match, paperless, notifications, phones),
// pollForNewUsers (skip existing dirs / onboard new), createMailcowMailbox (skip/create),
// storeMailPassword (fetch+merge+patch), createUserDirs (both subdirs)
//
// BUG DOCUMENTED: users.service.ts:149 — Math.random() used for mailbox password.
//   Not cryptographically secure. Fix: crypto.randomBytes(16).toString('base64url') + 'Aa1!'
//   mail-imap.service.ts:57 already uses the correct pattern.
//
// BUG DOCUMENTED: users.service.ts:deleteUser (in admin.service.ts) cascade missing —
//   deleting a user does NOT remove their Mailcow mailbox or Paperless account.

import axios from 'axios';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { PaperlessService } from './paperless.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LdapMetadataService } from '../ldap/ldap-metadata.service';

jest.mock('axios');
jest.mock('fs');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFs = fs as jest.Mocked<typeof fs>;

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: (k: string) => ({
      AUTHENTIK_URL: 'http://auth:9000',
      AUTHENTIK_BOOTSTRAP_TOKEN: 'token',
      PAPERLESS_DATA_DIR: '/data/paperless',
      MAIL_DOMAIN: 'mail.test.com',
      MAILCOW_URL: 'http://mailcow:8080',
      MAILCOW_API_KEY: 'mckey',
      ...overrides,
    }[k] ?? ''),
  } as unknown as ConfigService;
}

function makePaperless(): jest.Mocked<PaperlessService> {
  return { ensureUserAndWorkflow: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<PaperlessService>;
}

function makeNotifications(): jest.Mocked<NotificationsService> {
  return {
    broadcast: jest.fn().mockResolvedValue(undefined),
    sendToNumber: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<NotificationsService>;
}

function makeLdapMetadata(): jest.Mocked<LdapMetadataService> {
  return {
    setAttributesByPk: jest.fn().mockResolvedValue(undefined),
    getAttributes: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<LdapMetadataService>;
}

describe('UsersService', () => {
  let service: UsersService;
  let paperless: jest.Mocked<PaperlessService>;
  let notifications: jest.Mocked<NotificationsService>;
  let ldapMetadata: jest.Mocked<LdapMetadataService>;
  let instance: { get: jest.Mock; post: jest.Mock; patch: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    paperless = makePaperless();
    notifications = makeNotifications();
    ldapMetadata = makeLdapMetadata();
    service = new UsersService(makeConfig(), paperless, notifications, ldapMetadata);

    instance = { get: jest.fn(), post: jest.fn(), patch: jest.fn() };
    mockedAxios.create.mockReturnValue(instance as unknown as ReturnType<typeof axios.create>);

    // Default fs behavior
    mockedFs.existsSync.mockReturnValue(false);
    (mockedFs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    jest.spyOn(fs, 'chownSync').mockImplementation(() => {});
  });

  // ── onboardUser ───────────────────────────────────────────────────────────

  describe('onboardUser()', () => {
    it('skips provisioning for non-internal user type', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { pk: 1, username: 'svc', email: 'svc@test.com', type: 'service_account', name: 'SVC', attributes: {} },
      }) as jest.MockedFunction<typeof axios.get>;

      await service.onboardUser(1);
      expect(paperless.ensureUserAndWorkflow).not.toHaveBeenCalled();
    });

    it('creates consume and export directories for new user', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { pk: 1, username: 'alice', email: 'alice@other.com', type: 'internal', name: 'Alice', attributes: {} },
      }) as jest.MockedFunction<typeof axios.get>;
      paperless.ensureUserAndWorkflow.mockResolvedValue(undefined);

      await service.onboardUser(1);
      const dirs = (mockedFs.mkdirSync as jest.Mock).mock.calls.map((c) => c[0] as string);
      expect(dirs.some((d) => d.includes('consume/alice'))).toBe(true);
      expect(dirs.some((d) => d.includes('export/alice'))).toBe(true);
    });

    it('creates Mailcow mailbox when email domain matches MAIL_DOMAIN', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { pk: 1, username: 'alice', email: 'alice@mail.test.com', type: 'internal', name: 'Alice', attributes: {} },
      }) as jest.MockedFunction<typeof axios.get>;
      instance.get.mockResolvedValueOnce({ data: [] }); // mailbox check: not found
      instance.post.mockResolvedValueOnce({ data: {} }); // create mailbox
      // storeMailPassword calls
      mockedAxios.get.mockResolvedValueOnce({ data: { attributes: {} } });
      mockedAxios.patch.mockResolvedValueOnce({ data: {} }) as jest.MockedFunction<typeof axios.patch>;

      await service.onboardUser(1);
      expect(instance.post).toHaveBeenCalledWith('/api/v1/add/mailbox', expect.any(Object));
    });

    it('skips Mailcow when email domain does not match MAIL_DOMAIN', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { pk: 1, username: 'alice', email: 'alice@gmail.com', type: 'internal', name: 'Alice', attributes: {} },
      }) as jest.MockedFunction<typeof axios.get>;

      await service.onboardUser(1);
      expect(instance.post).not.toHaveBeenCalled();
    });

    it('broadcasts notification after onboarding', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { pk: 1, username: 'alice', email: 'alice@other.com', type: 'internal', name: 'Alice', attributes: {} },
      }) as jest.MockedFunction<typeof axios.get>;
      await service.onboardUser(1);
      expect(notifications.broadcast).toHaveBeenCalledWith(expect.stringContaining('alice'));
    });

    it('sends welcome Signal message to phones starting with +', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { pk: 1, username: 'alice', email: 'alice@other.com', type: 'internal', name: 'Alice',
          attributes: { phone: '+31611', phone2: '+31622' } },
      }) as jest.MockedFunction<typeof axios.get>;
      await service.onboardUser(1);
      expect(notifications.sendToNumber).toHaveBeenCalledWith('+31611', expect.any(String));
      expect(notifications.sendToNumber).toHaveBeenCalledWith('+31622', expect.any(String));
    });

    it('handles Authentik fetch failure gracefully', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('500')) as jest.MockedFunction<typeof axios.get>;
      await expect(service.onboardUser(1)).resolves.toBeUndefined();
      expect(paperless.ensureUserAndWorkflow).not.toHaveBeenCalled();
    });
  });

  // ── pollForNewUsers ───────────────────────────────────────────────────────

  describe('pollForNewUsers (via onModuleInit)', () => {
    it('only onboards users where consume dir does not exist', async () => {
      mockedAxios.get = jest.fn()
        .mockResolvedValueOnce({
          data: {
            results: [
              { pk: 1, username: 'alice', type: 'internal' },
              { pk: 2, username: 'bob', type: 'internal' },
            ],
          },
        })
        // alice doesn't exist yet — onboardUser fetch
        .mockResolvedValueOnce({ data: { pk: 1, username: 'alice', email: 'a@other.com', type: 'internal', name: 'Alice', attributes: {} } })

      mockedFs.existsSync
        .mockReturnValueOnce(false) // alice: no consume dir → onboard
        .mockReturnValue(true);     // bob: has consume dir → skip

      await (service as unknown as { pollForNewUsers: () => Promise<void> })['pollForNewUsers']();
      expect(notifications.broadcast).toHaveBeenCalledTimes(1); // only alice
    });

    it('skips AnonymousUser', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 999, username: 'AnonymousUser', type: 'internal' }] },
      }) as jest.MockedFunction<typeof axios.get>;
      mockedFs.existsSync.mockReturnValue(false);
      await (service as unknown as { pollForNewUsers: () => Promise<void> })['pollForNewUsers']();
      expect(notifications.broadcast).not.toHaveBeenCalled();
    });
  });

  // ── createMailcowMailbox ──────────────────────────────────────────────────

  describe('createMailcowMailbox', () => {
    it('returns existing attributes.mail_imap_password when mailbox already exists', async () => {
      instance.get.mockResolvedValueOnce({ data: { username: 'alice@mail.test.com', local_part: 'alice' } }); // object with username = exists
      const result = await (service as unknown as {
        createMailcowMailbox: (e: string, n: string, pk: number, attrs: Record<string, string>) => Promise<string | undefined>
      })['createMailcowMailbox']('alice@mail.test.com', 'Alice', 1, { mail_imap_password: 'stored-pw' });
      expect(result).toBe('stored-pw');
    });

    // TODO (SECURITY BUG): password uses Math.random — not cryptographically secure
    it('TODO BUG: generates password with Math.random (not crypto-secure)', async () => {
      instance.get.mockResolvedValueOnce({ data: [] }); // not found
      instance.post.mockResolvedValueOnce({ data: {} });
      mockedAxios.get.mockResolvedValueOnce({ data: { attributes: {} } }) as jest.MockedFunction<typeof axios.get>;
      mockedAxios.patch.mockResolvedValueOnce({ data: {} }) as jest.MockedFunction<typeof axios.patch>;

      const result = await (service as unknown as {
        createMailcowMailbox: (e: string, n: string, pk: number, attrs: Record<string, string>) => Promise<string | undefined>
      })['createMailcowMailbox']('alice@mail.test.com', 'Alice', 1, {});

      expect(result).toBeDefined();
      expect(result).toMatch(/Aa1!$/); // Math.random suffix; insecure — see TODO above
    });

    it('returns undefined and does not throw on Mailcow API failure', async () => {
      instance.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const result = await (service as unknown as {
        createMailcowMailbox: (e: string, n: string, pk: number, attrs: Record<string, string>) => Promise<string | undefined>
      })['createMailcowMailbox']('alice@mail.test.com', 'Alice', 1, {});
      expect(result).toBeUndefined();
    });
  });

  // ── storeMailPassword ─────────────────────────────────────────────────────

  describe('storeMailPassword', () => {
    it('fetches user attributes and PATCHes with merged mail_imap_password', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { attributes: { language: 'nl' } },
      }) as jest.MockedFunction<typeof axios.get>;
      mockedAxios.patch.mockResolvedValueOnce({ data: {} }) as jest.MockedFunction<typeof axios.patch>;

      await (service as unknown as { storeMailPassword: (pk: number, pw: string) => Promise<void> })
        ['storeMailPassword'](1, 'newpw');

      expect(mockedAxios.patch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v3/core/users/1/'),
        { attributes: { language: 'nl', mail_imap_password: 'newpw' } },
        expect.any(Object),
      );
    });

    it('logs error but does not throw on failure', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('403')) as jest.MockedFunction<typeof axios.get>;
      await expect(
        (service as unknown as { storeMailPassword: (pk: number, pw: string) => Promise<void> })['storeMailPassword'](1, 'pw'),
      ).resolves.toBeUndefined();
    });
  });
});
