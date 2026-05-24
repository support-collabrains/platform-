import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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

  async ensureUserAndWorkflow(username: string, email: string, name: string): Promise<void> {
    const userId = await this.ensureUser(username, email, name);
    await this.ensureWorkflow(username, userId);
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
      password: `${Math.random().toString(36).slice(2)}Aa1!`,
      is_active: true,
      groups: [1],
    });
    this.logger.log(`Created Paperless user: ${username} (id=${user.id})`);
    return user.id as number;
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
