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

    // Set CollaBrains branding (logo hosted publicly on portal)
    await this.configureBranding(api, config.primaryDomain);

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

  private async getAuthorizationFlowPk(api: ReturnType<typeof axios.create>): Promise<string> {
    const { data } = await api.get('/api/v3/flows/instances/', {
      params: { designation: 'authorization', slug: 'default-provider-authorization-implicit-consent' },
    });
    if (data.pagination.count > 0) return data.results[0].pk;
    // fallback: any authorization flow
    const { data: any } = await api.get('/api/v3/flows/instances/', {
      params: { designation: 'authorization' },
    });
    if (any.pagination.count > 0) return any.results[0].pk;
    throw new Error('No authorization flow found in Authentik');
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

    const authorizationFlow = await this.getAuthorizationFlowPk(api);

    const { data: provider } = await api.post('/api/v3/providers/oauth2/', {
      name: 'portal-oidc',
      authorization_flow: authorizationFlow,
      client_id: config.oauthClientId,
      client_secret: config.oauthClientSecret,
      client_type: 'confidential',
      redirect_uris: `https://portal.${config.primaryDomain}/api/auth/callback/authentik`,
      sub_mode: 'hashed_user_id',
      include_claims_in_id_token: true,
      issuer_mode: 'global',
    });

    this.logger.log(`Created OIDC provider (pk=${provider.pk})`);
    return provider.pk;
  }

  private async configureBranding(api: ReturnType<typeof axios.create>, primaryDomain: string) {
    try {
      const { data } = await api.get('/api/v3/core/brands/');
      const brand = data.results?.[0];
      if (!brand) return;
      await api.patch(`/api/v3/core/brands/${brand.brand_uuid}/`, {
        branding_title: 'CollaBrains',
        branding_logo: `https://portal.${primaryDomain}/logo.svg`,
      });
      this.logger.log('Configured Authentik branding: CollaBrains');
    } catch (err) {
      this.logger.warn(`Branding config failed (non-fatal): ${(err as Error).message}`);
    }

    try {
      await api.patch('/api/v3/flows/instances/default-authentication-flow/', {
        title: 'Welcome to CollaBrains!',
      });
      this.logger.log('Set authentication flow title to CollaBrains');
    } catch (err) {
      this.logger.warn(`Flow title update failed (non-fatal): ${(err as Error).message}`);
    }

    await this.updateSignInLabel(api);
  }

  private async updateSignInLabel(api: ReturnType<typeof axios.create>) {
    try {
      const { data } = await api.get('/api/v3/stages/identification/');
      for (const stage of data.results as Array<Record<string, unknown>>) {
        await api.patch(`/api/v3/stages/identification/${stage.pk}/`, {
          ...stage,
          submit_label: 'Sign-In',
        });
      }
      this.logger.log('Updated identification stage submit label to Sign-In');
    } catch (err) {
      this.logger.warn(`submit_label update failed (non-fatal): ${(err as Error).message}`);
    }
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
