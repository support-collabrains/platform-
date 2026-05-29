// Covers: sendToNumber (skip if no url/sender), send (skip if no recipient), sendToUsers,
// broadcast (admin + other users deduped), getAuthUserPhones (filters '+', empty on error)

import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const defaults: Record<string, string> = {
    SIGNAL_API_URL: 'http://signal:8080',
    SIGNAL_SENDER: '+31600000000',
    SIGNAL_RECIPIENT: '+31611111111',
    AUTHENTIK_URL: 'http://auth:9000',
    AUTHENTIK_BOOTSTRAP_TOKEN: 'token',
    ...overrides,
  };
  return { get: (k: string) => defaults[k] ?? '' } as unknown as ConfigService;
}

describe('NotificationsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('sendToNumber()', () => {
    it('does nothing when apiUrl is empty', async () => {
      const svc = new NotificationsService(makeConfig({ SIGNAL_API_URL: '' }));
      await svc.sendToNumber('+31', 'hi');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('does nothing when sender is empty', async () => {
      const svc = new NotificationsService(makeConfig({ SIGNAL_SENDER: '' }));
      await svc.sendToNumber('+31', 'hi');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('POSTs to /v2/send with correct payload', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: {} });
      const svc = new NotificationsService(makeConfig());
      await svc.sendToNumber('+31622', 'hello');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://signal:8080/v2/send',
        { message: 'hello', number: '+31600000000', recipients: ['+31622'] },
        expect.any(Object),
      );
    });

    it('logs warning but does not throw on failure', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('timeout'));
      const svc = new NotificationsService(makeConfig());
      await expect(svc.sendToNumber('+31', 'hi')).resolves.toBeUndefined();
    });
  });

  describe('send()', () => {
    it('does nothing when recipient is not configured', async () => {
      const svc = new NotificationsService(makeConfig({ SIGNAL_RECIPIENT: '' }));
      await svc.send('hi');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('delegates to sendToNumber with configured recipient', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: {} });
      const svc = new NotificationsService(makeConfig());
      await svc.send('hello');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/v2/send'),
        expect.objectContaining({ recipients: ['+31611111111'] }),
        expect.any(Object),
      );
    });
  });

  describe('sendToUsers()', () => {
    it('does nothing when apiUrl is missing', async () => {
      const svc = new NotificationsService(makeConfig({ SIGNAL_API_URL: '' }));
      await svc.sendToUsers('hi');
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('fetches Authentik users and sends to all phones', async () => {
      mockedAxios.get = jest.fn().mockResolvedValueOnce({
        data: { results: [{ attributes: { phone: '+31611', phone2: '+31622' } }, { attributes: { phone: '+49700' } }] },
      }) as jest.MockedFunction<typeof axios.get>;
      mockedAxios.post.mockResolvedValue({ data: {} });
      const svc = new NotificationsService(makeConfig());
      await svc.sendToUsers('broadcast');
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('broadcast()', () => {
    it('sends to admin recipient and other user phones (deduped)', async () => {
      mockedAxios.get = jest.fn().mockResolvedValueOnce({
        data: { results: [{ attributes: { phone: '+31611111111' } }, { attributes: { phone: '+49700' } }] },
      }) as jest.MockedFunction<typeof axios.get>;
      mockedAxios.post.mockResolvedValue({ data: {} });
      const svc = new NotificationsService(makeConfig());
      await svc.broadcast('hello everyone');
      // send() to recipient (+31611111111) + sendToNumber to +49700 (not +31611111111 again)
      const calls = (mockedAxios.post as jest.MockedFunction<typeof axios.post>).mock.calls;
      const recipients = calls.flatMap((c) => (c[1] as { recipients?: string[] }).recipients ?? []);
      expect(recipients).toContain('+31611111111');
      expect(recipients).toContain('+49700');
      expect(recipients.filter((r) => r === '+31611111111').length).toBe(1);
    });
  });

  describe('getAuthUserPhones()', () => {
    it('returns only values starting with +', async () => {
      mockedAxios.get = jest.fn().mockResolvedValueOnce({
        data: { results: [{ attributes: { phone: '+31611', phone2: 'nophone' } }, { attributes: {} }] },
      }) as jest.MockedFunction<typeof axios.get>;
      const svc = new NotificationsService(makeConfig());
      const phones = await svc.getAuthUserPhones();
      expect(phones).toEqual(['+31611']);
    });

    it('returns empty array on network error', async () => {
      mockedAxios.get = jest.fn().mockRejectedValueOnce(new Error('err')) as jest.MockedFunction<typeof axios.get>;
      const svc = new NotificationsService(makeConfig());
      expect(await svc.getAuthUserPhones()).toEqual([]);
    });
  });
});
