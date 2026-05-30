// Covers: onModuleInit (calls setVapidDetails when both keys set, warns when missing),
// getVapidPublicKey (returns configured key or empty string),
// saveSubscription (repo.upsert with correct data),
// sendToUser (skips when vapid not configured; sends to all subscriptions;
//   removes 410 Gone endpoints; does not remove non-410 failures)

import * as webpush from 'web-push';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { PushService } from './push.service';
import { PushSubscription } from './push-subscription.entity';

jest.mock('web-push');
const mockedWebpush = webpush as jest.Mocked<typeof webpush>;

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: (k: string) => ({
      VAPID_PUBLIC_KEY: 'pubkey',
      VAPID_PRIVATE_KEY: 'privkey',
      ADMIN_EMAIL: 'admin@test.com',
      ...overrides,
    }[k] ?? ''),
  } as unknown as ConfigService;
}

describe('PushService', () => {
  let repo: jest.Mocked<Pick<Repository<PushSubscription>, 'upsert' | 'find' | 'delete'>>;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = {
      upsert: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
  });

  function makeService(configOverrides: Record<string, string> = {}): PushService {
    const svc = new PushService(
      makeConfig(configOverrides),
      repo as unknown as Repository<PushSubscription>,
    );
    svc.onModuleInit();
    return svc;
  }

  // ── onModuleInit ─────────────────────────────────────────────────────────

  describe('onModuleInit()', () => {
    it('calls setVapidDetails when both keys are configured', () => {
      makeService();
      expect(mockedWebpush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:admin@test.com',
        'pubkey',
        'privkey',
      );
    });

    it('does not call setVapidDetails when public key is missing', () => {
      makeService({ VAPID_PUBLIC_KEY: '' });
      expect(mockedWebpush.setVapidDetails).not.toHaveBeenCalled();
    });

    it('does not call setVapidDetails when private key is missing', () => {
      makeService({ VAPID_PRIVATE_KEY: '' });
      expect(mockedWebpush.setVapidDetails).not.toHaveBeenCalled();
    });

    it('sets vapidConfigured flag so sendToUser works', async () => {
      const sub = { endpoint: 'https://push.example.com/1', keys: { p256dh: 'k', auth: 'a' } };
      repo.find.mockResolvedValue([sub] as PushSubscription[]);
      mockedWebpush.sendNotification.mockResolvedValue({});
      const svc = makeService();
      await svc.sendToUser('alice', 'hi', 'there');
      expect(mockedWebpush.sendNotification).toHaveBeenCalledTimes(1);
    });
  });

  // ── getVapidPublicKey ────────────────────────────────────────────────────

  describe('getVapidPublicKey()', () => {
    it('returns the configured VAPID public key', () => {
      expect(makeService().getVapidPublicKey()).toBe('pubkey');
    });

    it('returns empty string when VAPID_PUBLIC_KEY is not set', () => {
      expect(makeService({ VAPID_PUBLIC_KEY: '' }).getVapidPublicKey()).toBe('');
    });
  });

  // ── saveSubscription ─────────────────────────────────────────────────────

  describe('saveSubscription()', () => {
    it('upserts with username, endpoint and keys', async () => {
      const svc = makeService();
      await svc.saveSubscription('alice', {
        endpoint: 'https://push.example.com/sub1',
        keys: { p256dh: 'p256', auth: 'auth1' },
      });
      expect(repo.upsert).toHaveBeenCalledWith(
        {
          username: 'alice',
          endpoint: 'https://push.example.com/sub1',
          keys: { p256dh: 'p256', auth: 'auth1' },
        },
        ['endpoint'],
      );
    });

    it('conflicts on endpoint (upsert conflict target)', async () => {
      const svc = makeService();
      await svc.saveSubscription('bob', {
        endpoint: 'https://push.example.com/sub2',
        keys: { p256dh: 'k2', auth: 'a2' },
      });
      const [, conflictTarget] = (repo.upsert as jest.Mock).mock.calls[0] as [unknown, string[]];
      expect(conflictTarget).toEqual(['endpoint']);
    });
  });

  // ── sendToUser ───────────────────────────────────────────────────────────

  describe('sendToUser()', () => {
    it('does nothing when VAPID keys are not configured', async () => {
      const svc = makeService({ VAPID_PUBLIC_KEY: '' });
      await svc.sendToUser('alice', 'title', 'body');
      expect(repo.find).not.toHaveBeenCalled();
      expect(mockedWebpush.sendNotification).not.toHaveBeenCalled();
    });

    it('finds subscriptions for the given username', async () => {
      repo.find.mockResolvedValue([]);
      const svc = makeService();
      await svc.sendToUser('alice', 'title', 'body');
      expect(repo.find).toHaveBeenCalledWith({ where: { username: 'alice' } });
    });

    it('sends notification to each subscription', async () => {
      const subs = [
        { endpoint: 'https://push.example.com/1', keys: { p256dh: 'k1', auth: 'a1' } },
        { endpoint: 'https://push.example.com/2', keys: { p256dh: 'k2', auth: 'a2' } },
      ] as PushSubscription[];
      repo.find.mockResolvedValue(subs);
      mockedWebpush.sendNotification.mockResolvedValue({});
      const svc = makeService();
      await svc.sendToUser('alice', 'Hello', 'World');
      expect(mockedWebpush.sendNotification).toHaveBeenCalledTimes(2);
      expect(mockedWebpush.sendNotification).toHaveBeenCalledWith(
        { endpoint: subs[0].endpoint, keys: subs[0].keys },
        JSON.stringify({ title: 'Hello', body: 'World' }),
      );
    });

    it('sends JSON-stringified title + body as payload', async () => {
      repo.find.mockResolvedValue([
        { endpoint: 'ep', keys: { p256dh: 'k', auth: 'a' } } as PushSubscription,
      ]);
      mockedWebpush.sendNotification.mockResolvedValue({});
      await makeService().sendToUser('alice', 'My Title', 'My Body');
      const payload = mockedWebpush.sendNotification.mock.calls[0][1] as string;
      expect(JSON.parse(payload)).toEqual({ title: 'My Title', body: 'My Body' });
    });

    it('removes subscription endpoints that returned 410 Gone', async () => {
      const subs = [
        { endpoint: 'https://push.example.com/gone', keys: { p256dh: 'k1', auth: 'a1' } },
      ] as PushSubscription[];
      repo.find.mockResolvedValue(subs);
      const goneErr = Object.assign(new Error('Gone'), { statusCode: 410 });
      mockedWebpush.sendNotification.mockRejectedValueOnce(goneErr);
      await makeService().sendToUser('alice', 'hi', 'there');
      expect(repo.delete).toHaveBeenCalledWith({ endpoint: subs[0].endpoint });
    });

    it('does not delete subscriptions that fail with non-410 status codes', async () => {
      repo.find.mockResolvedValue([
        { endpoint: 'ep', keys: { p256dh: 'k', auth: 'a' } } as PushSubscription,
      ]);
      mockedWebpush.sendNotification.mockRejectedValueOnce(
        Object.assign(new Error('Internal Error'), { statusCode: 500 }),
      );
      await makeService().sendToUser('alice', 'hi', 'there');
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('does not delete subscriptions that fail without a statusCode', async () => {
      repo.find.mockResolvedValue([
        { endpoint: 'ep', keys: { p256dh: 'k', auth: 'a' } } as PushSubscription,
      ]);
      mockedWebpush.sendNotification.mockRejectedValueOnce(new Error('generic error'));
      await makeService().sendToUser('alice', 'hi', 'there');
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('continues sending to remaining subscriptions after partial failures', async () => {
      const subs = [
        { endpoint: 'ep1', keys: { p256dh: 'k1', auth: 'a1' } },
        { endpoint: 'ep2', keys: { p256dh: 'k2', auth: 'a2' } },
      ] as PushSubscription[];
      repo.find.mockResolvedValue(subs);
      mockedWebpush.sendNotification
        .mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }))
        .mockResolvedValueOnce({});
      await makeService().sendToUser('alice', 'hi', 'there');
      // First sub deleted (410), second succeeded
      expect(repo.delete).toHaveBeenCalledTimes(1);
      expect(mockedWebpush.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('does not throw when all subscriptions fail', async () => {
      repo.find.mockResolvedValue([
        { endpoint: 'ep', keys: { p256dh: 'k', auth: 'a' } } as PushSubscription,
      ]);
      mockedWebpush.sendNotification.mockRejectedValueOnce(new Error('fail'));
      await expect(makeService().sendToUser('alice', 'hi', 'there')).resolves.toBeUndefined();
    });
  });
});
