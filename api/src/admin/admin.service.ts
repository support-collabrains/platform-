import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly config: ConfigService) {}

  private get api() {
    const url = this.config.get('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
    const token = this.config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
    return axios.create({ baseURL: url, headers: { Authorization: `Bearer ${token}` } });
  }

  async listUsers(): Promise<Array<{ pk: number; username: string; name: string; email: string; isActive: boolean }>> {
    const { data } = await this.api.get('/api/v3/core/users/', {
      params: { type: 'internal', page_size: 100 },
    });
    return (data.results as Array<{ pk: number; username: string; name: string; email: string; is_active: boolean }>)
      .filter((u) => u.username !== 'AnonymousUser')
      .map((u) => ({ pk: u.pk, username: u.username, name: u.name, email: u.email, isActive: u.is_active }));
  }

  async createUser(username: string, name: string, email: string, password: string, phone?: string): Promise<number> {
    const api = this.api;
    const { data: user } = await api.post('/api/v3/core/users/', {
      username,
      name,
      email,
      is_active: true,
      type: 'internal',
      groups: [],
      attributes: phone ? { phone } : {},
    });
    await api.post(`/api/v3/core/users/${user.pk}/set_password/`, { password });
    this.logger.log(`Created Authentik user: ${username} (pk=${user.pk})`);
    return user.pk as number;
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
    for (const stage of stageData.results as Array<{ pk: string }>) {
      await api.patch(`/api/v3/stages/identification/${stage.pk}/`, { submit_label: 'Sign-In' });
    }

    this.logger.log('Applied CollaBrains branding to live Authentik instance');
  }
}
