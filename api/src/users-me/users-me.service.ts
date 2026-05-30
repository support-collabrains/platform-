import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import axios from 'axios';
import type { AxiosResponse } from 'axios';
import { DocDocument, DocNotification } from '../documents/document.entity';
import { ADMIN_GROUP } from '../common/roles.guard';

export type UserLanguage = 'nl' | 'de' | 'en';

export interface UserPreferences {
  signal_doc_notify: boolean;
  signal_digest_mode: boolean;
  language: UserLanguage;
}

export interface AuthentikUser {
  pk: number;
  username: string;
  name: string;
  email: string;
  groups_obj: Array<{ name: string }>;
  attributes: Record<string, string>;
}

interface PaperlessDoc {
  id: number;
  title: string;
  created: string;
  document_type?: number | null;
}

interface PaperlessDocType {
  id: number;
  name: string;
  document_count: number;
}

interface NotificationRow {
  id: string;
  documentId: string;
  documentTitle: string;
  phone: string;
  status: string;
  createdAt: Date;
}

@Injectable()
export class UsersMeService {
  private readonly authentikUrl: string;
  private readonly authentikToken: string;
  private readonly paperlessUrl: string;
  private readonly paperlessToken: string;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(DocDocument) private readonly docRepo: Repository<DocDocument>,
    @InjectRepository(DocNotification) private readonly notifRepo: Repository<DocNotification>,
  ) {
    this.authentikUrl = config.get('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
    this.authentikToken = config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
    this.paperlessUrl = config.get('PAPERLESS_INTERNAL_URL') ?? 'http://paperless:8000';
    this.paperlessToken = config.get('PAPERLESS_API_TOKEN') ?? '';
  }

  async resolveUser(username: string): Promise<AuthentikUser> {
    const { data } = await axios.get<{ results: AuthentikUser[] }>(
      `${this.authentikUrl}/api/v3/core/users/`,
      {
        headers: { Authorization: `Bearer ${this.authentikToken}` },
        params: { username, page_size: 1 },
        timeout: 8_000,
      },
    );
    const user = data.results?.[0];
    if (!user) throw new Error(`Authentik user not found: ${username}`);
    return user;
  }

  async getDocuments(username: string): Promise<PaperlessDoc[]> {
    try {
      const { data } = await axios.get(`${this.paperlessUrl}/api/documents/`, {
        headers: { Authorization: `Token ${this.paperlessToken}` },
        params: { owner__username: username, ordering: '-created', page_size: 100 },
        timeout: 10_000,
      });
      const paperlessDocs = (data.results as PaperlessDoc[]) ?? [];

      // Cross-check: exclude any doc our DB attributes to a DIFFERENT user.
      // Paperless admin token may ignore ownership filters; local DB is authoritative
      // for documents that came through the post-consume webhook (incl. scan@).
      if (paperlessDocs.length === 0) return [];
      const ids = paperlessDocs.map((d) => d.id);
      const wrongOwner = await this.docRepo.find({
        where: { paperlessId: In(ids), owner: Not(username) },
        select: { paperlessId: true },
      });
      const excluded = new Set(wrongOwner.map((d) => d.paperlessId));
      return paperlessDocs.filter((d) => !excluded.has(d.id));
    } catch {
      return [];
    }
  }

  async getDocumentById(paperlessId: number, username: string): Promise<PaperlessDoc | null> {
    // Ownership check: must be in local DB as this user's doc, OR Paperless owner matches
    const local = await this.docRepo.findOne({ where: { paperlessId } });
    if (local && local.owner !== username) return null;

    try {
      const { data } = await axios.get(`${this.paperlessUrl}/api/documents/${paperlessId}/`, {
        headers: { Authorization: `Token ${this.paperlessToken}` },
        timeout: 10_000,
      });
      return data as PaperlessDoc;
    } catch {
      return null;
    }
  }

  async getDocumentPreview(paperlessId: number, username: string): Promise<AxiosResponse<Buffer> | null> {
    const local = await this.docRepo.findOne({ where: { paperlessId } });
    if (local && local.owner !== username) return null;

    try {
      return await axios.get<Buffer>(`${this.paperlessUrl}/api/documents/${paperlessId}/preview/`, {
        headers: { Authorization: `Token ${this.paperlessToken}` },
        responseType: 'arraybuffer',
        timeout: 30_000,
      });
    } catch {
      return null;
    }
  }

  async getDocumentTypes(): Promise<PaperlessDocType[]> {
    try {
      const { data } = await axios.get(`${this.paperlessUrl}/api/document_types/`, {
        headers: { Authorization: `Token ${this.paperlessToken}` },
        params: { page_size: 100 },
        timeout: 10_000,
      });
      return (data.results as PaperlessDocType[]) ?? [];
    } catch {
      return [];
    }
  }

  async getNotifications(phones: string[]): Promise<NotificationRow[]> {
    if (!phones.length) return [];

    const notifs = await this.notifRepo.find({
      where: { phone: In(phones) },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    const docIds = [...new Set(notifs.map((n) => n.documentId))];
    const docs = docIds.length ? await this.docRepo.findBy({ id: In(docIds) }) : [];
    const docMap = new Map(docs.map((d) => [d.id, d.title]));

    return notifs.map((n) => ({
      id: n.id,
      documentId: n.documentId,
      documentTitle: docMap.get(n.documentId) ?? '—',
      phone: n.phone,
      status: n.status,
      createdAt: n.createdAt,
    }));
  }

  parsePreferences(attributes: Record<string, string>): UserPreferences {
    const lang = attributes.language as UserLanguage;
    return {
      signal_doc_notify: attributes.signal_doc_notify !== 'false',
      signal_digest_mode: attributes.signal_digest_mode === 'true',
      language: ['nl', 'de', 'en'].includes(lang) ? lang : 'nl',
    };
  }

  async updatePreferences(username: string, prefs: Partial<UserPreferences>): Promise<void> {
    const user = await this.resolveUser(username);
    const attrs: Record<string, string> = { ...user.attributes };

    if (prefs.signal_doc_notify !== undefined)
      attrs.signal_doc_notify = String(prefs.signal_doc_notify);
    if (prefs.signal_digest_mode !== undefined)
      attrs.signal_digest_mode = String(prefs.signal_digest_mode);
    if (prefs.language !== undefined && ['nl', 'de', 'en'].includes(prefs.language))
      attrs.language = prefs.language;

    await axios.patch(
      `${this.authentikUrl}/api/v3/core/users/${user.pk}/`,
      { attributes: attrs },
      { headers: { Authorization: `Bearer ${this.authentikToken}` }, timeout: 8_000 },
    );
  }

  getPhonesFromAttributes(attributes: Record<string, string>): string[] {
    return [attributes.phone, attributes.phone2].filter((p): p is string => !!p?.startsWith('+'));
  }

  async getProfile(uid: string, groupsHeader: string): Promise<{
    username: string;
    email: string;
    name: string;
    role: 'admin' | 'user';
    totpEnabled: boolean;
  }> {
    const user = await this.resolveUser(uid);
    const role = groupsHeader.split(',').map((g) => g.trim()).includes(ADMIN_GROUP)
      ? ('admin' as const)
      : ('user' as const);
    const totpEnabled = await this.checkTotp(user.pk);
    return { username: user.username, email: user.email, name: user.name, role, totpEnabled };
  }

  private async checkTotp(pk: number): Promise<boolean> {
    try {
      const { data } = await axios.get(
        `${this.authentikUrl}/api/v3/authenticators/totp/`,
        {
          headers: { Authorization: `Bearer ${this.authentikToken}` },
          params: { user: pk },
          timeout: 5_000,
        },
      );
      return ((data as { count: number }).count ?? 0) > 0;
    } catch {
      return false;
    }
  }
}
