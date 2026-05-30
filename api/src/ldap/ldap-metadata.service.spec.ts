// Covers: getAttributes (cache hit bypasses Authentik, cache miss → fetch + setex,
//   Redis unavailable falls through, empty results → {}),
// setAttributes (GET by username, PATCH with merged attrs, cache invalidated,
//   throws on user not found, non-fatal when del fails),
// setAttributesByPk (GET by pk, PATCH with merged attrs, cache invalidated by username),
// invalidate (del cache key, non-fatal on Redis error)

import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { LdapMetadataService } from './ldap-metadata.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  on: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => jest.fn().mockImplementation(() => mockRedis));

function makeService(overrides: Record<string, string> = {}): LdapMetadataService {
  const cfg: Record<string, string> = {
    AUTHENTIK_URL: 'http://auth:9000',
    AUTHENTIK_BOOTSTRAP_TOKEN: 'token',
    QUEUE_REDIS_URL: 'redis://queue-redis:6379',
    ...overrides,
  };
  return new LdapMetadataService({ get: (k: string) => cfg[k] ?? '' } as unknown as ConfigService);
}

describe('LdapMetadataService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
  });

  // ── getAttributes ────────────────────────────────────────────────────────

  describe('getAttributes()', () => {
    it('returns parsed cache value when Redis has data (Authentik not called)', async () => {
      const cached = { signalPhone: '+31611', language: 'nl' };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cached));
      const svc = makeService();
      const attrs = await svc.getAttributes('alice');
      expect(attrs).toEqual(cached);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('fetches from Authentik on cache miss', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ attributes: { signalPhone: '+31611' } }] },
      });
      const svc = makeService();
      const attrs = await svc.getAttributes('alice');
      expect(attrs.signalPhone).toBe('+31611');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://auth:9000/api/v3/core/users/',
        expect.objectContaining({ params: { username: 'alice', page_size: 1 } }),
      );
    });

    it('sends Bearer token auth header to Authentik', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { results: [{ attributes: {} }] } });
      await makeService().getAttributes('alice');
      const headers = (mockedAxios.get.mock.calls[0][1] as { headers: Record<string, string> }).headers;
      expect(headers.Authorization).toBe('Bearer token');
    });

    it('caches Authentik response in Redis with 5-minute TTL', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ attributes: { language: 'nl' } }] },
      });
      await makeService().getAttributes('alice');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'ldap:user:alice:attrs',
        300,
        JSON.stringify({ language: 'nl' }),
      );
    });

    it('falls through to Authentik when Redis.get throws', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis down'));
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ attributes: { phone: '+31622' } }] },
      });
      const attrs = await makeService().getAttributes('alice');
      expect(attrs.phone).toBe('+31622');
    });

    it('returns {} when Authentik results array is empty', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { results: [] } });
      const attrs = await makeService().getAttributes('alice');
      expect(attrs).toEqual({});
    });

    it('does not throw when Redis.setex fails (non-fatal)', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { results: [{ attributes: {} }] } });
      mockRedis.setex.mockRejectedValueOnce(new Error('Redis error'));
      await expect(makeService().getAttributes('alice')).resolves.toBeDefined();
    });

    it('uses correct cache key pattern ldap:user:<username>:attrs', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({}));
      await makeService().getAttributes('bob');
      expect(mockRedis.get).toHaveBeenCalledWith('ldap:user:bob:attrs');
    });
  });

  // ── setAttributes ────────────────────────────────────────────────────────

  describe('setAttributes()', () => {
    it('fetches user by username then PATCHes with merged attributes', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 42, attributes: { language: 'nl' } }] },
      });
      mockedAxios.patch.mockResolvedValueOnce({ data: {} });
      await makeService().setAttributes('alice', { signalPhone: '+31611' });
      expect(mockedAxios.patch).toHaveBeenCalledWith(
        'http://auth:9000/api/v3/core/users/42/',
        { attributes: { language: 'nl', signalPhone: '+31611' } },
        expect.any(Object),
      );
    });

    it('patch overrides existing attribute value', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 5, attributes: { language: 'nl' } }] },
      });
      mockedAxios.patch.mockResolvedValueOnce({ data: {} });
      await makeService().setAttributes('alice', { language: 'de' });
      const patchBody = (mockedAxios.patch.mock.calls[0][1] as { attributes: { language: string } });
      expect(patchBody.attributes.language).toBe('de');
    });

    it('throws Error when user is not found in Authentik', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { results: [] } });
      await expect(makeService().setAttributes('ghost', {})).rejects.toThrow('User not found: ghost');
    });

    it('invalidates cache after successful patch', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 42, attributes: {} }] },
      });
      mockedAxios.patch.mockResolvedValueOnce({ data: {} });
      await makeService().setAttributes('alice', { language: 'de' });
      expect(mockRedis.del).toHaveBeenCalledWith('ldap:user:alice:attrs');
    });

    it('does not throw when cache del fails after successful patch', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { results: [{ pk: 42, attributes: {} }] },
      });
      mockedAxios.patch.mockResolvedValueOnce({ data: {} });
      mockRedis.del.mockRejectedValueOnce(new Error('Redis error'));
      await expect(makeService().setAttributes('alice', {})).resolves.toBeUndefined();
    });
  });

  // ── setAttributesByPk ────────────────────────────────────────────────────

  describe('setAttributesByPk()', () => {
    it('GETs user by pk then PATCHes with merged attributes', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { pk: 7, username: 'bob', attributes: { language: 'nl' } },
      });
      mockedAxios.patch.mockResolvedValueOnce({ data: {} });
      await makeService().setAttributesByPk(7, { phone: '+316' });
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://auth:9000/api/v3/core/users/7/',
        expect.any(Object),
      );
      expect(mockedAxios.patch).toHaveBeenCalledWith(
        'http://auth:9000/api/v3/core/users/7/',
        { attributes: { language: 'nl', phone: '+316' } },
        expect.any(Object),
      );
    });

    it('invalidates cache for the fetched username after patch', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { pk: 7, username: 'bob', attributes: {} },
      });
      mockedAxios.patch.mockResolvedValueOnce({ data: {} });
      await makeService().setAttributesByPk(7, {});
      expect(mockRedis.del).toHaveBeenCalledWith('ldap:user:bob:attrs');
    });

    it('does not throw when cache del fails after successful patch', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { pk: 7, username: 'bob', attributes: {} },
      });
      mockedAxios.patch.mockResolvedValueOnce({ data: {} });
      mockRedis.del.mockRejectedValueOnce(new Error('Redis error'));
      await expect(makeService().setAttributesByPk(7, {})).resolves.toBeUndefined();
    });
  });

  // ── invalidate ───────────────────────────────────────────────────────────

  describe('invalidate()', () => {
    it('deletes the cache key for the given username', async () => {
      await makeService().invalidate('alice');
      expect(mockRedis.del).toHaveBeenCalledWith('ldap:user:alice:attrs');
    });

    it('does not throw when Redis.del throws (non-fatal)', async () => {
      mockRedis.del.mockRejectedValueOnce(new Error('Redis error'));
      await expect(makeService().invalidate('alice')).resolves.toBeUndefined();
    });

    it('uses correct cache key prefix for different usernames', async () => {
      await makeService().invalidate('charlie');
      expect(mockRedis.del).toHaveBeenCalledWith('ldap:user:charlie:attrs');
    });
  });
});
