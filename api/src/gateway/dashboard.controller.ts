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
    // Immich is a shared household album — admin key returns shared library (by design).
    // Mutation is prevented: this endpoint is read-only aggregation.
    const res = await firstValueFrom(
      this.http.get<unknown[]>(`${this.immichUrl}/api/assets`, {
        headers: { 'x-api-key': this.immichApiKey },
        params: { take: 12, skip: 0 },
      }),
    );
    return Array.isArray(res.data) ? res.data : [];
  }
}
