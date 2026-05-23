import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface MailcowConfig {
  baseUrl: string;
  apiKey: string;
  mailDomain: string;
  adminEmail: string;
  adminPassword: string;
}

@Injectable()
export class MailcowService {
  private readonly logger = new Logger(MailcowService.name);

  async provision(config: MailcowConfig): Promise<{ dkim: string }> {
    this.logger.log('Starting Mailcow provisioning...');

    const api = axios.create({
      baseURL: config.baseUrl,
      headers: { 'X-API-Key': config.apiKey },
    });

    await this.waitForReady(config.baseUrl, config.apiKey);
    await this.addDomain(api, config.mailDomain);
    await this.addMailbox(api, config.adminEmail, config.adminPassword, config.mailDomain);
    const dkim = await this.generateDKIM(api, config.mailDomain);

    this.logger.log('Mailcow provisioning complete');
    return { dkim };
  }

  private async waitForReady(baseUrl: string, apiKey: string, timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await axios.get(`${baseUrl}/api/v1/get/status/containers`, {
          headers: { 'X-API-Key': apiKey },
        });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    throw new Error('Mailcow did not become ready in time');
  }

  private async addDomain(api: ReturnType<typeof axios.create>, domain: string) {
    const { data: existing } = await api.get(`/api/v1/get/domain/${domain}`);
    if (existing && !Array.isArray(existing)) {
      this.logger.log(`Domain ${domain} already exists`);
      return;
    }

    await api.post('/api/v1/add/domain', {
      domain,
      description: 'Platform mail domain',
      aliases: 10,
      mailboxes: 10,
      defquota: 3072,
      maxquota: 10240,
      quota: 10240,
      active: 1,
    });

    this.logger.log(`Created mail domain: ${domain}`);
  }

  private async addMailbox(
    api: ReturnType<typeof axios.create>,
    email: string,
    password: string,
    domain: string,
  ) {
    const local = email.split('@')[0];
    const { data: existing } = await api.get(`/api/v1/get/mailbox/${email}`);
    if (existing && !Array.isArray(existing)) {
      this.logger.log(`Mailbox ${email} already exists`);
      return;
    }

    await api.post('/api/v1/add/mailbox', {
      local_part: local,
      domain,
      name: 'Platform Admin',
      password,
      password2: password,
      quota: 3072,
      active: 1,
      force_pw_update: 0,
      tls_enforce_in: 0,
      tls_enforce_out: 0,
    });

    this.logger.log(`Created mailbox: ${email}`);
  }

  private async generateDKIM(api: ReturnType<typeof axios.create>, domain: string): Promise<string> {
    await api.post('/api/v1/add/dkim', {
      dkim_selector: 'dkim',
      domain,
      key_size: 2048,
    });

    const { data } = await api.get(`/api/v1/get/dkim/${domain}`);
    return data?.dkim_txt ?? '';
  }
}
