// Covers: resolveUser (found/not-found), getDocuments (success/fail-silent),
// getNotifications (empty phones / finds docs from docRepo / fallback '—'),
// parsePreferences (all defaults and overrides), updatePreferences (partial merge, invalid lang ignored),
// getPhonesFromAttributes (filters '+', handles missing), getProfile (role from groups header),
// checkTotp (true/false/error-silent)

import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { UsersMeService } from './users-me.service';
import { DocDocument, DocNotification } from '../documents/document.entity';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeConfig(): ConfigService {
  return {
    get: (k: string) => ({
      AUTHENTIK_URL: 'http://auth:9000',
      AUTHENTIK_BOOTSTRAP_TOKEN: 'token',
      PAPERLESS_INTERNAL_URL: 'http://paperless:8000',
      PAPERLESS_API_TOKEN: 'ptok',
    }[k] ?? ''),
  } as unknown as ConfigService;
}

function makeDocRepo(): jest.Mocked<Repository<DocDocument>> {
  return {
    findBy: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<Repository<DocDocument>>;
}

function makeNotifRepo(): jest.Mocked<Repository<DocNotification>> {
  return { find: jest.fn() } as unknown as jest.Mocked<Repository<DocNotification>>;
}

describe('UsersMeService', () => {
  let service: UsersMeService;
  let docRepo: jest.Mocked<Repository<DocDocument>>;
  let notifRepo: jest.Mocked<Repository<DocNotification>>;

  beforeEach(() => {
    jest.clearAllMocks();
    docRepo = makeDocRepo();
    notifRepo = makeNotifRepo();
    service = new UsersMeService(makeConfig(), docRepo, notifRepo);
  });

  // ── resolveUser ───────────────────────────────────────────────────────────

  describe('resolveUser()', () => {
    it('returns first result from Authentik search', async () => {
      const user = { pk: 1, username: 'alice', name: 'Alice', email: 'a@t.com', groups_obj: [], attributes: {} };
      mockedAxios.get.mockResolvedValueOnce({ data: { results: [user] } }) as jest.MockedFunction<typeof axios.get>;
      const result = await service.resolveUser('alice');
      expect(result.pk).toBe(1);
    });

    it('throws Error when user not found', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { results: [] } }) as jest.MockedFunction<typeof axios.get>;
      await expect(service.resolveUser('nobody')).rejects.toThrow('Authentik user not found: nobody');
    });
  });

  // ── getDocuments ──────────────────────────────────────────────────────────

  describe('getDocuments()', () => {
    it('queries Paperless with owner__username param', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { results: [{ id: 1, title: 'Doc', created: '2024' }] } }) as jest.MockedFunction<typeof axios.get>;
      const docs = await service.getDocuments('alice');
      expect(docs).toHaveLength(1);
      expect((mockedAxios.get as jest.Mock).mock.calls[0][1]).toMatchObject({ params: { owner__username: 'alice' } });
    });

    it('returns empty array on network error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('timeout')) as jest.MockedFunction<typeof axios.get>;
      const docs = await service.getDocuments('alice');
      expect(docs).toEqual([]);
    });
  });

  // ── getNotifications ──────────────────────────────────────────────────────

  describe('getNotifications()', () => {
    it('returns empty array when phones array is empty', async () => {
      const result = await service.getNotifications([]);
      expect(result).toEqual([]);
      expect(notifRepo.find).not.toHaveBeenCalled();
    });

    it('queries notifRepo with In(phones) and enriches with doc titles', async () => {
      notifRepo.find.mockResolvedValueOnce([
        { id: 'n1', documentId: 'd1', phone: '+31', status: 'done', createdAt: new Date() } as DocNotification,
      ]);
      docRepo.findBy.mockResolvedValueOnce([
        { id: 'd1', title: 'Invoice', paperlessId: 1, owner: 'alice', createdAt: new Date() } as DocDocument,
      ]);
      const result = await service.getNotifications(['+31']);
      expect(result[0].documentTitle).toBe('Invoice');
    });

    it('returns \'—\' as documentTitle when document not found in db', async () => {
      notifRepo.find.mockResolvedValueOnce([
        { id: 'n1', documentId: 'd-missing', phone: '+31', status: 'done', createdAt: new Date() } as DocNotification,
      ]);
      docRepo.findBy.mockResolvedValueOnce([]);
      const result = await service.getNotifications(['+31']);
      expect(result[0].documentTitle).toBe('—');
    });

    it('limits to 20 results ordered DESC', async () => {
      notifRepo.find.mockResolvedValueOnce([]);
      docRepo.findBy.mockResolvedValueOnce([]);
      await service.getNotifications(['+31']);
      expect(notifRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' }, take: 20 }),
      );
    });
  });

  // ── parsePreferences ──────────────────────────────────────────────────────

  describe('parsePreferences()', () => {
    it('defaults signal_doc_notify to true when attribute absent', () => {
      expect(service.parsePreferences({}).signal_doc_notify).toBe(true);
    });

    it('returns signal_doc_notify:false when attribute is "false"', () => {
      expect(service.parsePreferences({ signal_doc_notify: 'false' }).signal_doc_notify).toBe(false);
    });

    it('returns signal_digest_mode:true only when attribute is "true"', () => {
      expect(service.parsePreferences({ signal_digest_mode: 'true' }).signal_digest_mode).toBe(true);
      expect(service.parsePreferences({ signal_digest_mode: 'false' }).signal_digest_mode).toBe(false);
      expect(service.parsePreferences({}).signal_digest_mode).toBe(false);
    });

    it('defaults language to nl when attribute is invalid', () => {
      expect(service.parsePreferences({ language: 'fr' }).language).toBe('nl');
    });

    it('accepts nl, de, en as valid languages', () => {
      for (const lang of ['nl', 'de', 'en'] as const) {
        expect(service.parsePreferences({ language: lang }).language).toBe(lang);
      }
    });
  });

  // ── updatePreferences ─────────────────────────────────────────────────────

  describe('updatePreferences()', () => {
    const baseUser = { pk: 1, username: 'alice', name: 'Alice', email: 'a@t.com', groups_obj: [], attributes: { language: 'nl' } };

    it('merges new preference values into existing attributes', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { results: [baseUser] } }) as jest.MockedFunction<typeof axios.get>;
      mockedAxios.patch.mockResolvedValueOnce({ data: {} }) as jest.MockedFunction<typeof axios.patch>;
      await service.updatePreferences('alice', { signal_doc_notify: false });
      const patchPayload = (mockedAxios.patch as jest.Mock).mock.calls[0][1] as { attributes: Record<string, string> };
      expect(patchPayload.attributes.signal_doc_notify).toBe('false');
      expect(patchPayload.attributes.language).toBe('nl'); // preserved
    });

    it('ignores invalid language values', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { results: [baseUser] } }) as jest.MockedFunction<typeof axios.get>;
      mockedAxios.patch.mockResolvedValueOnce({ data: {} }) as jest.MockedFunction<typeof axios.patch>;
      await service.updatePreferences('alice', { language: 'fr' as unknown as 'nl' });
      const patchPayload = (mockedAxios.patch as jest.Mock).mock.calls[0][1] as { attributes: Record<string, string> };
      // language not updated because 'fr' is invalid
      expect(patchPayload.attributes.language).toBe('nl');
    });
  });

  // ── getPhonesFromAttributes ───────────────────────────────────────────────

  describe('getPhonesFromAttributes()', () => {
    it('returns only values starting with +', () => {
      expect(service.getPhonesFromAttributes({ phone: '+31611', phone2: 'notphone' })).toEqual(['+31611']);
    });

    it('returns both phone and phone2 when both start with +', () => {
      expect(service.getPhonesFromAttributes({ phone: '+31', phone2: '+49' })).toEqual(['+31', '+49']);
    });

    it('returns empty array when no phone attributes', () => {
      expect(service.getPhonesFromAttributes({})).toEqual([]);
    });
  });

  // ── getProfile ────────────────────────────────────────────────────────────

  describe('getProfile()', () => {
    it('sets role admin when x-authentik-groups header includes platform-admins', async () => {
      const user = { pk: 1, username: 'alice', name: 'Alice', email: 'a@t.com', groups_obj: [], attributes: {} };
      mockedAxios.get = jest.fn()
        .mockResolvedValueOnce({ data: { results: [user] } })  // resolveUser
        .mockResolvedValueOnce({ data: { count: 1 } })          // checkTotp
      const profile = await service.getProfile('alice', 'platform-admins,other-group');
      expect(profile.role).toBe('admin');
    });

    it('sets role user when groups header does not include platform-admins', async () => {
      const user = { pk: 1, username: 'alice', name: 'Alice', email: 'a@t.com', groups_obj: [], attributes: {} };
      mockedAxios.get = jest.fn()
        .mockResolvedValueOnce({ data: { results: [user] } })
        .mockResolvedValueOnce({ data: { count: 0 } })
      const profile = await service.getProfile('alice', 'some-group');
      expect(profile.role).toBe('user');
    });

    it('includes totpEnabled from checkTotp result', async () => {
      const user = { pk: 1, username: 'alice', name: 'Alice', email: 'a@t.com', groups_obj: [], attributes: {} };
      mockedAxios.get = jest.fn()
        .mockResolvedValueOnce({ data: { results: [user] } })
        .mockResolvedValueOnce({ data: { count: 2 } })
      const profile = await service.getProfile('alice', '');
      expect(profile.totpEnabled).toBe(true);
    });
  });

  // ── checkTotp (private, tested via getProfile) ────────────────────────────

  describe('checkTotp (via getProfile)', () => {
    it('returns false when TOTP API throws (silent fail)', async () => {
      const user = { pk: 1, username: 'alice', name: 'Alice', email: 'a@t.com', groups_obj: [], attributes: {} };
      mockedAxios.get = jest.fn()
        .mockResolvedValueOnce({ data: { results: [user] } })
        .mockRejectedValueOnce(new Error('500'))
      const profile = await service.getProfile('alice', '');
      expect(profile.totpEnabled).toBe(false);
    });
  });
});
