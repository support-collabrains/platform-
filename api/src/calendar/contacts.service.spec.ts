// Covers: addressbookUrl validation (rejects path-traversal / slash chars),
// ensureAddressbook (MKCOL, swallows errors),
// getContacts (PROPFIND, parses CardDAV XML with all fields, empty on error),
// createContact (PUT returns uid, includes optional fields),
// escapeVCardValue via createContact (strips CRLF injection, escapes \\ , ;),
// unfoldVCard via getContacts (handles folded lines),
// parseVCard via getContacts (null when FN missing)

import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { ContactsService } from './contacts.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeService(overrides: Record<string, string> = {}): ContactsService {
  const cfg: Record<string, string> = { RADICALE_URL: 'http://radicale:5232', ...overrides };
  return new ContactsService({ get: (k: string) => cfg[k] ?? '' } as unknown as ConfigService);
}

const PROPFIND_FULL = `<?xml version="1.0" ?>
<D:multistatus xmlns:D="DAV:" xmlns:CR="urn:ietf:params:xml:ns:carddav">
  <D:response>
    <CR:address-data>BEGIN:VCARD
VERSION:3.0
UID:uid-1
FN:Alice Smith
EMAIL:alice@example.com
TEL:+31611111111
ORG:ACME Corp
END:VCARD</CR:address-data>
  </D:response>
</D:multistatus>`;

const PROPFIND_MINIMAL = `<?xml version="1.0" ?>
<D:multistatus xmlns:D="DAV:" xmlns:CR="urn:ietf:params:xml:ns:carddav">
  <D:response>
    <CR:address-data>BEGIN:VCARD
VERSION:3.0
UID:uid-2
FN:Bob
END:VCARD</CR:address-data>
  </D:response>
</D:multistatus>`;

const PROPFIND_NO_FN = `<?xml version="1.0" ?>
<D:multistatus xmlns:D="DAV:" xmlns:CR="urn:ietf:params:xml:ns:carddav">
  <D:response>
    <CR:address-data>BEGIN:VCARD
VERSION:3.0
UID:uid-3
EMAIL:noname@example.com
END:VCARD</CR:address-data>
  </D:response>
</D:multistatus>`;

const PROPFIND_FOLDED = `<?xml version="1.0" ?>
<D:multistatus xmlns:D="DAV:" xmlns:CR="urn:ietf:params:xml:ns:carddav">
  <D:response>
    <CR:address-data>BEGIN:VCARD
VERSION:3.0
UID:uid-4
FN:Char
 lotte
END:VCARD</CR:address-data>
  </D:response>
</D:multistatus>`;

describe('ContactsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('username validation (via ensureAddressbook / getContacts)', () => {
    it('throws for username containing /', async () => {
      await expect(makeService().ensureAddressbook('alice/bob')).rejects.toThrow('Invalid username');
    });

    it('throws for username starting with ..', async () => {
      await expect(makeService().getContacts('../admin')).rejects.toThrow('Invalid username');
    });

    it('throws for username containing @', async () => {
      await expect(makeService().ensureAddressbook('a@b')).rejects.toThrow('Invalid username');
    });

    it('accepts alphanumeric username', async () => {
      mockedAxios.request.mockResolvedValue({ status: 207, data: '' });
      await expect(makeService().ensureAddressbook('alice123')).resolves.toBeUndefined();
    });

    it('accepts username with dots, dashes, underscores', async () => {
      mockedAxios.request.mockResolvedValue({ status: 207, data: '' });
      await expect(makeService().ensureAddressbook('alice.bob-c_d')).resolves.toBeUndefined();
    });
  });

  describe('ensureAddressbook()', () => {
    it('sends MKCOL to the user addressbook URL', async () => {
      mockedAxios.request.mockResolvedValueOnce({ status: 201, data: '' });
      await makeService().ensureAddressbook('alice');
      expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'MKCOL', url: 'http://radicale:5232/alice/contacts/' }),
      );
    });

    it('sends XML body declaring addressbook resource type', async () => {
      mockedAxios.request.mockResolvedValueOnce({ status: 201, data: '' });
      await makeService().ensureAddressbook('alice');
      const opts = mockedAxios.request.mock.calls[0][0] as { data: string };
      expect(opts.data).toContain('addressbook');
    });

    it('does not throw when MKCOL fails (collection may already exist)', async () => {
      mockedAxios.request.mockRejectedValueOnce(new Error('already exists'));
      await expect(makeService().ensureAddressbook('alice')).resolves.toBeUndefined();
    });
  });

  describe('getContacts()', () => {
    it('calls ensureAddressbook before PROPFIND', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' }) // MKCOL
        .mockResolvedValueOnce({ data: '' });              // PROPFIND
      await makeService().getContacts('alice');
      const methods = mockedAxios.request.mock.calls.map((c) => (c[0] as { method: string }).method);
      expect(methods).toEqual(['MKCOL', 'PROPFIND']);
    });

    it('sends PROPFIND with Depth:1 header', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ data: '' });
      await makeService().getContacts('alice');
      const opts = mockedAxios.request.mock.calls[1][0] as { headers: Record<string, string> };
      expect(opts.headers['Depth']).toBe('1');
    });

    it('parses full contact from CardDAV response', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ data: PROPFIND_FULL });
      const contacts = await makeService().getContacts('alice');
      expect(contacts).toHaveLength(1);
      expect(contacts[0]).toMatchObject({
        uid: 'uid-1',
        fullName: 'Alice Smith',
        email: 'alice@example.com',
        phone: '+31611111111',
        organization: 'ACME Corp',
      });
    });

    it('parses minimal contact with only FN', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ data: PROPFIND_MINIMAL });
      const contacts = await makeService().getContacts('alice');
      expect(contacts[0].fullName).toBe('Bob');
      expect(contacts[0].email).toBeUndefined();
    });

    it('skips vCard entries without FN', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ data: PROPFIND_NO_FN });
      const contacts = await makeService().getContacts('alice');
      expect(contacts).toHaveLength(0);
    });

    it('unfolds folded vCard lines', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ data: PROPFIND_FOLDED });
      const contacts = await makeService().getContacts('alice');
      expect(contacts[0].fullName).toBe('Charlotte');
    });

    it('returns empty array on PROPFIND network error', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockRejectedValueOnce(new Error('timeout'));
      const contacts = await makeService().getContacts('alice');
      expect(contacts).toEqual([]);
    });

    it('returns empty array for empty response body', async () => {
      mockedAxios.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ data: '' });
      const contacts = await makeService().getContacts('alice');
      expect(contacts).toEqual([]);
    });
  });

  describe('createContact()', () => {
    it('returns a UID string containing @collabrains', async () => {
      mockedAxios.request.mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      const uid = await makeService().createContact('alice', { fullName: 'Bob' });
      expect(typeof uid).toBe('string');
      expect(uid).toContain('@collabrains');
    });

    it('PUTs vCard to addressbook URL with .vcf extension', async () => {
      mockedAxios.request.mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createContact('alice', { fullName: 'Bob' });
      const putUrl = mockedAxios.put.mock.calls[0][0] as string;
      expect(putUrl).toMatch(/http:\/\/radicale:5232\/alice\/contacts\/.+\.vcf/);
    });

    it('generates valid vCard 3.0 with BEGIN/END', async () => {
      mockedAxios.request.mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createContact('alice', { fullName: 'Carol' });
      const vcard = mockedAxios.put.mock.calls[0][1] as string;
      expect(vcard).toContain('BEGIN:VCARD');
      expect(vcard).toContain('VERSION:3.0');
      expect(vcard).toContain('FN:Carol');
      expect(vcard).toContain('END:VCARD');
    });

    it('includes EMAIL, TEL, ORG when provided', async () => {
      mockedAxios.request.mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createContact('alice', {
        fullName: 'Dave',
        email: 'd@example.com',
        phone: '+316',
        organization: 'Acme',
      });
      const vcard = mockedAxios.put.mock.calls[0][1] as string;
      expect(vcard).toContain('EMAIL:d@example.com');
      expect(vcard).toContain('TEL:+316');
      expect(vcard).toContain('ORG:Acme');
    });

    it('omits optional fields when not provided', async () => {
      mockedAxios.request.mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createContact('alice', { fullName: 'Eve' });
      const vcard = mockedAxios.put.mock.calls[0][1] as string;
      expect(vcard).not.toContain('EMAIL:');
      expect(vcard).not.toContain('TEL:');
      expect(vcard).not.toContain('ORG:');
    });

    it('strips CR/LF from fullName (CRLF injection prevention)', async () => {
      mockedAxios.request.mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createContact('alice', { fullName: 'Injected\r\nX-Evil:bad' });
      const vcard = mockedAxios.put.mock.calls[0][1] as string;
      // CRLF is replaced by a space — no separate injected property line is created
      const lines = vcard.split('\r\n');
      const hasInjectedPropertyLine = lines.some((l) => l.startsWith('X-Evil'));
      expect(hasInjectedPropertyLine).toBe(false);
      // FN line stays a single unbroken line
      const fnLine = lines.find((l) => l.startsWith('FN:'));
      expect(fnLine).toBeDefined();
    });

    it('escapes backslash, comma, and semicolon per RFC 6350', async () => {
      mockedAxios.request.mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createContact('alice', { fullName: 'A\\B,C;D' });
      const vcard = mockedAxios.put.mock.calls[0][1] as string;
      // After escaping: backslash → \\, comma → \,, semicolon → \;
      expect(vcard).toContain('FN:A\\\\B\\,C\\;D');
    });

    it('uses text/vcard content type', async () => {
      mockedAxios.request.mockResolvedValueOnce({ status: 201, data: '' });
      mockedAxios.put.mockResolvedValueOnce({ data: '' });
      await makeService().createContact('alice', { fullName: 'Frank' });
      const opts = mockedAxios.put.mock.calls[0][2] as { headers: Record<string, string> };
      expect(opts.headers['Content-Type']).toContain('text/vcard');
    });
  });
});
