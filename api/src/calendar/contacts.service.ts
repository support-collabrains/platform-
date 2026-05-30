import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface Contact {
  uid: string;
  fullName: string;
  email?: string;
  phone?: string;
  organization?: string;
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get('RADICALE_URL') ?? 'http://radicale:5232';
  }

  private addressbookUrl(username: string): string {
    // Reject usernames that could traverse into other collections
    if (!/^[a-z0-9._-]+$/i.test(username)) throw new Error(`Invalid username: ${username}`);
    return `${this.baseUrl}/${encodeURIComponent(username)}/contacts/`;
  }

  async ensureAddressbook(username: string): Promise<void> {
    const url = this.addressbookUrl(username);
    try {
      await axios.request({
        method: 'MKCOL',
        url,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        data: `<?xml version="1.0" encoding="utf-8" ?>
<D:mkcol xmlns:D="DAV:" xmlns:CR="urn:ietf:params:xml:ns:carddav">
  <D:set><D:prop>
    <D:resourcetype><D:collection/><CR:addressbook/></D:resourcetype>
    <D:displayname>Contacts</D:displayname>
  </D:prop></D:set>
</D:mkcol>`,
        validateStatus: (s: number) => s < 500,
      });
    } catch {
      // collection may already exist — ignore
    }
  }

  async getContacts(username: string): Promise<Contact[]> {
    await this.ensureAddressbook(username);
    const url = this.addressbookUrl(username);

    try {
      const { data } = await axios.request<string>({
        method: 'PROPFIND',
        url,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          Depth: '1',
        },
        data: `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:CR="urn:ietf:params:xml:ns:carddav">
  <D:prop><D:getetag/><CR:address-data/></D:prop>
</D:propfind>`,
        responseType: 'text',
        validateStatus: (s: number) => s < 500,
      });

      return this.parseMultiStatus(data);
    } catch (err) {
      this.logger.warn(`CardDAV PROPFIND failed: ${String(err)}`);
      return [];
    }
  }

  async createContact(username: string, contact: Omit<Contact, 'uid'>): Promise<string> {
    await this.ensureAddressbook(username);
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@collabrains`;
    const url = `${this.addressbookUrl(username)}${uid}.vcf`;
    const vcard = this.buildVCard({ ...contact, uid });

    await axios.put(url, vcard, {
      headers: { 'Content-Type': 'text/vcard; charset=utf-8' },
    });
    return uid;
  }

  // ----- vCard 3.0 builder -----

  // Sanitize vCard field values: strip CR/LF (CRLF injection) and escape
  // special characters per RFC 6350 §3.4 (backslash, comma, semicolon).
  private escapeVCardValue(v: string): string {
    return v
      .replace(/[\r\n]+/g, ' ')         // strip line breaks — prevents CRLF injection
      .replace(/\\/g, '\\\\')            // escape backslash first
      .replace(/,/g, '\\,')             // escape comma
      .replace(/;/g, '\\;');            // escape semicolon
  }

  private buildVCard(contact: Contact): string {
    const esc = this.escapeVCardValue.bind(this);
    const lines: string[] = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `UID:${esc(contact.uid)}`,
      `FN:${esc(contact.fullName)}`,
    ];
    if (contact.email) lines.push(`EMAIL:${esc(contact.email)}`);
    if (contact.phone) lines.push(`TEL:${esc(contact.phone)}`);
    if (contact.organization) lines.push(`ORG:${esc(contact.organization)}`);
    lines.push('END:VCARD');
    return lines.join('\r\n');
  }

  // ----- Parsing -----

  private parseMultiStatus(xml: string): Contact[] {
    const contacts: Contact[] = [];
    // Match address-data blocks (namespace-prefixed or plain)
    const addrDataRe = /<[^:>]*:?address-data[^>]*>([\s\S]*?)<\/[^:>]*:?address-data>/gi;
    for (const m of xml.matchAll(addrDataRe)) {
      const vcard = this.unfoldVCard(m[1]);
      const contact = this.parseVCard(vcard);
      if (contact) contacts.push(contact);
    }
    return contacts;
  }

  /**
   * Unfold vCard line continuations (RFC 6350 §3.2):
   * a CRLF or LF followed by a single WSP is a fold — join them.
   */
  private unfoldVCard(raw: string): string {
    return raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  }

  private parseVCard(vcard: string): Contact | null {
    const get = (key: string): string | undefined => {
      // Match KEY or KEY;param=val: value
      const re = new RegExp(`^${key}(?:;[^:]*)?:(.+)$`, 'mi');
      const m = vcard.match(re);
      return m ? m[1].trim() : undefined;
    };

    const fullName = get('FN');
    if (!fullName) return null;

    const uid =
      get('UID') ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return {
      uid,
      fullName,
      email: get('EMAIL'),
      phone: get('TEL'),
      organization: get('ORG'),
    };
  }
}
