import { Controller, Get, Headers, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InternalSecretGuard } from '../users-me/internal-secret.guard';
import { LdapMetadataService } from '../ldap/ldap-metadata.service';

@Controller('gateway')
@UseGuards(InternalSecretGuard)
export class DashboardController {
  private readonly paperlessUrl: string;
  private readonly paperlessToken: string;
  private readonly immichUrl: string;
  private readonly immichApiKey: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly ldap: LdapMetadataService,
  ) {
    this.paperlessUrl = config.get('PAPERLESS_INTERNAL_URL') ?? 'http://paperless:8000';
    this.paperlessToken = config.get('PAPERLESS_API_TOKEN') ?? '';
    this.immichUrl = config.get('IMMICH_INTERNAL_URL') ?? 'http://immich-server:2283';
    this.immichApiKey = config.get('IMMICH_API_KEY') ?? '';
  }

  @Get('dashboard')
  async dashboard(@Headers('x-authentik-username') username: string) {
    const [docs, photos, ldapAttrs] = await Promise.allSettled([
      this.fetchRecentDocs(username),
      this.fetchRecentPhotos(),
      this.ldap.getAttributes(username),
    ]);

    return {
      docs: docs.status === 'fulfilled' ? docs.value : [],
      photos: photos.status === 'fulfilled' ? photos.value : [],
      user: ldapAttrs.status === 'fulfilled' ? ldapAttrs.value : {},
    };
  }

  private async fetchRecentDocs(username: string): Promise<unknown[]> {
    const res = await firstValueFrom(
      this.http.get<{ results: unknown[] }>(`${this.paperlessUrl}/api/documents/`, {
        headers: { Authorization: `Token ${this.paperlessToken}` },
        // Scope to the calling user's own documents
        params: { ordering: '-created', page_size: 10, owner__username: username },
      }),
    );
    return res.data.results ?? [];
  }

  private async fetchRecentPhotos(): Promise<unknown[]> {
    if (!this.immichApiKey) return [];
    // Immich v2.7+ removed GET /api/assets list; use POST /api/search/metadata instead.
    try {
      const res = await firstValueFrom(
        this.http.post<{ assets?: { items?: unknown[] } }>(
          `${this.immichUrl}/api/search/metadata`,
          { page: 1, size: 12 },
          { headers: { 'x-api-key': this.immichApiKey } },
        ),
      );
      return res.data?.assets?.items ?? [];
    } catch {
      return [];
    }
  }
}
