import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface AuthentikConfig {
  baseUrl: string;
  bootstrapToken: string;
  adminEmail: string;
  adminPassword: string;
  primaryDomain: string;
  oauthClientId: string;
  oauthClientSecret: string;
}

@Injectable()
export class AuthentikService {
  private readonly logger = new Logger(AuthentikService.name);

  async provision(config: AuthentikConfig): Promise<void> {
    this.logger.log('Starting Authentik provisioning...');

    const api = axios.create({
      baseURL: config.baseUrl,
      headers: { Authorization: `Bearer ${config.bootstrapToken}` },
    });

    // Wait for Authentik to be reachable
    await this.waitForReady(config.baseUrl);

    // Create admin user
    await this.createAdminUser(api, config.adminEmail, config.adminPassword);

    // Create OAuth2/OIDC provider for portal
    const providerId = await this.createOIDCProvider(api, config);

    // Create application linked to the OIDC provider
    await this.createPortalApplication(api, providerId, config.primaryDomain, config.oauthClientId);

    this.logger.log('Authentik provisioning complete');
  }

  private async waitForReady(baseUrl: string, timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await axios.get(`${baseUrl}/api/v3/root/config/`);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    throw new Error(`Authentik at ${baseUrl} did not become ready within ${timeoutMs}ms`);
  }

  private async createAdminUser(api: ReturnType<typeof axios.create>, email: string, password: string) {
    const { data: users } = await api.get('/api/v3/core/users/', { params: { username: 'admin' } });
    if (users.pagination.count > 0) {
      this.logger.log('Admin user already exists, skipping creation');
      return users.results[0];
    }

    const { data: user } = await api.post('/api/v3/core/users/', {
      username: 'admin',
      name: 'Platform Admin',
      email,
      is_active: true,
      groups: [],
    });

    await api.post(`/api/v3/core/users/${user.pk}/set_password/`, { password });
    this.logger.log(`Created Authentik admin user: ${email}`);
    return user;
  }

  private async createOIDCProvider(
    api: ReturnType<typeof axios.create>,
    config: AuthentikConfig,
  ): Promise<number> {
    const { data: existing } = await api.get('/api/v3/providers/oauth2/', {
      params: { name: 'portal-oidc' },
    });
    if (existing.pagination.count > 0) {
      return existing.results[0].pk;
    }

    const { data: provider } = await api.post('/api/v3/providers/oauth2/', {
      name: 'portal-oidc',
      client_id: config.oauthClientId,
      client_secret: config.oauthClientSecret,
      client_type: 'confidential',
      redirect_uris: `https://portal.${config.primaryDomain}/api/auth/callback/authentik`,
      signing_key: null,
      sub_mode: 'hashed_user_id',
      include_claims_in_id_token: true,
      issuer_mode: 'global',
    });

    this.logger.log(`Created OIDC provider (pk=${provider.pk})`);
    return provider.pk;
  }

  private async createPortalApplication(
    api: ReturnType<typeof axios.create>,
    providerId: number,
    primaryDomain: string,
    slug: string,
  ) {
    const { data: existing } = await api.get('/api/v3/core/applications/', { params: { slug } });
    if (existing.pagination.count > 0) {
      this.logger.log('Portal application already exists');
      return;
    }

    await api.post('/api/v3/core/applications/', {
      name: 'Platform Portal',
      slug,
      provider: providerId,
      meta_launch_url: `https://portal.${primaryDomain}`,
    });

    this.logger.log('Created portal application in Authentik');
  }
}
