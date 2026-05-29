import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class PaperlessService {
  private readonly logger = new Logger(PaperlessService.name);
  private readonly paperlessUrl: string;
  private readonly paperlessToken: string;

  constructor(private readonly config: ConfigService) {
    this.paperlessUrl = config.get('PAPERLESS_INTERNAL_URL') ?? 'http://paperless:8000';
    this.paperlessToken = config.get('PAPERLESS_API_TOKEN') ?? '';
  }

  private get api() {
    return axios.create({
      baseURL: this.paperlessUrl,
      headers: { Authorization: `Token ${this.paperlessToken}` },
    });
  }

  async ensureUserAndWorkflow(username: string, email: string, name: string, mailPassword?: string): Promise<number | undefined> {
    const userId = await this.ensureUser(username, email, name);
    await this.ensureWorkflow(username, userId);
    if (mailPassword) {
      await this.ensureMailAccount(username, email, userId, mailPassword);
    }
    return userId;
  }

  private async ensureUser(username: string, email: string, name: string): Promise<number> {
    const api = this.api;
    // Paperless doesn't support exact username filter; search and match client-side
    const { data: existing } = await api.get('/api/users/', { params: { search: username, page_size: 100 } });
    const match = (existing.results as Array<{ id: number; username: string }>).find(
      (u) => u.username === username,
    );
    if (match) {
      this.logger.log(`Paperless user already exists: ${username} (id=${match.id})`);
      return match.id;
    }

    const [firstName, ...rest] = (name || username).split(' ');
    const { data: user } = await api.post('/api/users/', {
      username,
      email,
      first_name: firstName,
      last_name: rest.join(' '),
      password: `${crypto.randomBytes(12).toString('base64url')}Aa1!`,
      is_active: true,
      groups: [1],
    });
    this.logger.log(`Created Paperless user: ${username} (id=${user.id})`);
    return user.id as number;
  }

  private async ensureMailAccount(username: string, email: string, ownerId: number, password: string): Promise<void> {
    const api = this.api;
    const { data: all } = await api.get('/api/mail_accounts/', { params: { page_size: 200 } });
    const found = (all.results as Array<{ id: number; username: string }>).find(a => a.username === email);
    if (found) {
      this.logger.log(`Paperless mail account already exists for: ${email} (id=${found.id})`);
      await this.ensureMailRule(username, found.id, ownerId);
      return;
    }
    const { data: account } = await api.post('/api/mail_accounts/', {
      name: email,
      imap_server: this.config.get<string>('MAIL_IMAP_HOST') ?? 'dovecot-mailcow',
      imap_port: 993,
      imap_security: 2,
      username: email,
      password,
      character_set: 'UTF-8',
      is_token: false,
      owner: ownerId,
      account_type: 1,
    });
    this.logger.log(`Created Paperless mail account for: ${email} (id=${account.id})`);
    await this.ensureMailRule(username, account.id as number, ownerId);
  }

  private async ensureMailRule(username: string, accountId: number, ownerId: number): Promise<void> {
    const api = this.api;
    const ruleName = `Email ${username} → import`;
    const { data: all } = await api.get('/api/mail_rules/', { params: { page_size: 200 } });
    const exists = (all.results as Array<{ name: string }>).some(r => r.name === ruleName);
    if (exists) {
      this.logger.log(`Paperless mail rule already exists for: ${username}`);
      return;
    }
    await api.post('/api/mail_rules/', {
      name: ruleName,
      account: accountId,
      enabled: true,
      folder: 'INBOX',
      maximum_age: 30,
      action: 3,
      action_parameter: null,
      assign_title_from: 2,
      assign_tags: [],
      assign_correspondent_from: 2,
      assign_correspondent: null,
      assign_document_type: null,
      assign_owner_from_rule: true,
      order: 0,
      attachment_type: 1,
      consumption_scope: 1,
      owner: ownerId,
    });
    this.logger.log(`Created Paperless mail rule for: ${username}`);
  }

  private async ensureWorkflow(username: string, ownerId: number): Promise<void> {
    const api = this.api;

    const workflowName = `Consume folder → ${username}`;
    const { data: all } = await api.get('/api/workflows/', { params: { page_size: 200 } });
    const exists = (all.results as Array<{ name: string }>).some((w) => w.name === workflowName);
    if (exists) {
      this.logger.log(`Paperless workflow already exists for: ${username}`);
      return;
    }

    const { data: trigger } = await api.post('/api/workflow_triggers/', {
      type: 1,
      sources: [1],
      filter_path: `*/consume/${username}/*`,
      matching_algorithm: 0,
    });

    const { data: action } = await api.post('/api/workflow_actions/', {
      type: 1,
      assign_owner: ownerId,
    });

    // Paperless expects full nested objects for triggers/actions, not just IDs
    await api.post('/api/workflows/', {
      name: workflowName,
      order: 10,
      enabled: true,
      triggers: [trigger],
      actions: [action],
    });

    this.logger.log(`Created Paperless workflow for: ${username}`);
  }
}

function axiosErrDetail(err: unknown): string {
  const e = err as { response?: { status?: number; data?: unknown }; message?: string };
  if (e?.response) return `HTTP ${e.response.status}: ${JSON.stringify(e.response.data)}`;
  return e?.message ?? String(err);
}
