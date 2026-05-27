import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ADMIN_GROUP } from '../common/roles.guard';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly config: ConfigService) {}

  private get api() {
    const url = this.config.get('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
    const token = this.config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
    return axios.create({ baseURL: url, headers: { Authorization: `Bearer ${token}` } });
  }

  async listUsers(): Promise<Array<{ pk: number; username: string; name: string; email: string; isActive: boolean; role: 'admin' | 'user'; totpEnabled: boolean }>> {
    const api = this.api;
    const [usersRes, totpRes] = await Promise.all([
      api.get('/api/v3/core/users/', { params: { type: 'internal', page_size: 100 } }),
      api.get('/api/v3/authenticators/totp/', { params: { page_size: 200 } }),
    ]);

    const totpUserIds = new Set<number>(
      (totpRes.data.results as Array<{ user: { pk: number } }>).map((t) => t.user.pk),
    );

    type Raw = { pk: number; username: string; name: string; email: string; is_active: boolean; groups_obj: Array<{ name: string }> };
    return (usersRes.data.results as Raw[])
      .filter((u) => u.username !== 'AnonymousUser')
      .map((u) => ({
        pk: u.pk,
        username: u.username,
        name: u.name,
        email: u.email,
        isActive: u.is_active,
        role: (u.groups_obj ?? []).some((g) => g.name === ADMIN_GROUP) ? ('admin' as const) : ('user' as const),
        totpEnabled: totpUserIds.has(u.pk),
      }));
  }

  async setRole(pk: number, role: 'admin' | 'user'): Promise<void> {
    const api = this.api;

    // Ensure platform-admins group exists
    const { data: groupData } = await api.get('/api/v3/core/groups/', {
      params: { name: ADMIN_GROUP },
    });
    let groupPk: string;
    if ((groupData.count as number) > 0) {
      groupPk = (groupData.results[0] as { pk: string }).pk;
    } else {
      const { data: created } = await api.post('/api/v3/core/groups/', { name: ADMIN_GROUP });
      groupPk = (created as { pk: string }).pk;
      this.logger.log(`Created Authentik group: ${ADMIN_GROUP}`);
    }

    if (role === 'admin') {
      await api.post(`/api/v3/core/groups/${groupPk}/add_user/`, { pk });
    } else {
      await api.post(`/api/v3/core/groups/${groupPk}/remove_user/`, { pk });
    }
    this.logger.log(`Set role ${role} for user pk=${pk}`);
  }

  async createUser(username: string, name: string, email: string, phone?: string, phone2?: string): Promise<{ pk: number; setupLink: string }> {
    const api = this.api;
    const attributes: Record<string, string> = { language: 'nl' };
    if (phone) attributes.phone = phone;
    if (phone2) attributes.phone2 = phone2;
    const { data: user } = await api.post('/api/v3/core/users/', {
      username,
      name,
      email,
      is_active: true,
      type: 'internal',
      groups: [],
      attributes,
    });
    this.logger.log(`Created Authentik user: ${username} (pk=${user.pk})`);

    // Generate one-time account setup link
    const setupLink = await this.generateSetupLink(user.pk as number);
    return { pk: user.pk as number, setupLink };
  }

  async generateSetupLink(pk: number): Promise<string> {
    try {
      const { data } = await this.api.post(`/api/v3/core/users/${pk}/recovery/`);
      const rawLink = (data as { link: string }).link;
      // Replace internal hostname with public auth URL
      const publicAuth = `https://auth.${this.config.get('PRIMARY_DOMAIN') ?? 'localhost'}`;
      return rawLink.replace(/https?:\/\/[^/]+/, publicAuth);
    } catch (err) {
      this.logger.warn(`Could not generate setup link for pk=${pk}: ${(err as Error).message}`);
      return '';
    }
  }

  async deleteUser(pk: number): Promise<void> {
    await this.api.delete(`/api/v3/core/users/${pk}/`);
    this.logger.log(`Deleted Authentik user pk=${pk}`);
  }

  async applyBranding(): Promise<void> {
    const api = this.api;
    const primaryDomain = this.config.get<string>('PRIMARY_DOMAIN') ?? '';

    const { data: brandData } = await api.get('/api/v3/core/brands/');
    const brand = brandData.results?.[0] as { brand_uuid: string } | undefined;
    if (brand) {
      await api.patch(`/api/v3/core/brands/${brand.brand_uuid}/`, {
        branding_title: 'CollaBrains',
        branding_logo: `https://portal.${primaryDomain}/logo.svg`,
      });
    }

    const { data: stageData } = await api.get('/api/v3/stages/identification/');
    for (const s of stageData.results as Array<Record<string, unknown>>) {
      // Omit read-only fields so Authentik doesn't try to re-create nested objects
      const { pk, component, verbose_name, verbose_name_plural, meta_model_name, flow_set, ...writable } = s;
      await api.patch(`/api/v3/stages/identification/${pk}/`, { ...writable, submit_label: 'Sign-In' });
    }

    this.logger.log('Applied CollaBrains branding to live Authentik instance');
  }
}
