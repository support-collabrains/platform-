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
});
