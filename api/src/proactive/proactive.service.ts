import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { Queue, Worker } from 'bullmq';
import axios from 'axios';
import { ProactiveHint } from './proactive-hint.entity';
import { OllamaService } from '../documents/ollama.service';
import { MailImapService } from '../mail/mail-imap.service';
import { CalendarService } from '../calendar/calendar.service';
import { PushService } from '../push/push.service';
import { SignalTicket } from '../tickets/ticket.entity';

interface AuthUser { username: string; email: string; attributes: Record<string, string> }
interface ExtractedHint { title: string; date: string; type: 'appointment' | 'deadline' }

@Injectable()
export class ProactiveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProactiveService.name);
  private queue: Queue;
  private worker: Worker;
  private readonly authentikUrl: string;
  private readonly authentikToken: string;

  constructor(
    @InjectRepository(ProactiveHint)
    private readonly repo: Repository<ProactiveHint>,
    @InjectRepository(SignalTicket)
    private readonly tickets: Repository<SignalTicket>,
    private readonly ollama: OllamaService,
    private readonly mail: MailImapService,
    private readonly calendar: CalendarService,
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {
    this.authentikUrl = config.get('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
    this.authentikToken = config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
  }

  onModuleInit() {
    const conn = { url: this.config.get('QUEUE_REDIS_URL') ?? 'redis://queue-redis:6379' };
    this.queue = new Queue('proactive-scan', { connection: conn });
    this.worker = new Worker('proactive-scan', async () => this.scanAllUsers(), { connection: conn });
    void this.scheduleDailyScan();
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  private async scheduleDailyScan() {
    const existing = await this.queue.getRepeatableJobs();
    for (const job of existing) await this.queue.removeRepeatableByKey(job.key);
    // Run every 24h; first fire is delayed to next 08:00 local time
    const now = new Date();
    const next8am = new Date(now);
    next8am.setHours(8, 0, 0, 0);
    if (next8am <= now) next8am.setDate(next8am.getDate() + 1);
    const delay = next8am.getTime() - now.getTime();
    await this.queue.add('daily', {}, { delay, repeat: { every: 24 * 60 * 60 * 1000 } });
    this.logger.log(`Proactive scan scheduled — first run in ${Math.round(delay / 60000)}m`);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async getHints(username: string): Promise<ProactiveHint[]> {
    return this.repo.find({
      where: { username, status: 'pending' },
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  async acceptHint(username: string, hintId: string, overrideStart?: string): Promise<void> {
    const hint = await this.repo.findOne({ where: { id: hintId, username } });
    if (!hint) return;
    hint.status = 'accepted';
    await this.repo.save(hint);
    if (hint.suggestedDate) {
      const start = overrideStart ?? hint.suggestedDate;
      const allDay = !start.includes('T');
      const end = allDay
        ? start
        : new Date(new Date(start).getTime() + 3_600_000).toISOString().slice(0, 19);
      await this.calendar.createEvent(username, { summary: hint.title, start, end, allDay });
    }
  }

  async dismissHint(username: string, hintId: string): Promise<void> {
    await this.repo.update({ id: hintId, username }, { status: 'dismissed' });
  }

  async triggerScanForUser(username: string): Promise<ProactiveHint[]> {
    const users = await this.getAuthUsers();
    const user = users.find(u => u.username === username);
    return this.scanUser(username, user?.attributes?.signalPhone ?? user?.attributes?.phone);
  }

  // ── Scan logic ─────────────────────────────────────────────────────────────

  async scanAllUsers(): Promise<void> {
    this.logger.log('Running proactive scan for all users');
    const users = await this.getAuthUsers();
    for (const user of users) {
      try {
        const hints = await this.scanUser(user.username, user.attributes?.signalPhone ?? user.attributes?.phone);
        if (hints.length > 0) {
          await this.push.sendToUser(
            user.username,
            '📅 Diggi heeft items gevonden',
            `${hints.length} afspraken of deadlines gevonden. Tik om te bekijken.`,
          );
        }
      } catch (err) {
        this.logger.warn(`Scan failed for ${user.username}: ${(err as Error).message}`);
      }
    }
  }

  private async scanUser(username: string, _phone?: string): Promise<ProactiveHint[]> {
    const [ticketHints, mailHints, docHints] = await Promise.allSettled([
      this.scanTickets(username),
      this.scanMail(username),
      this.scanDocuments(username),
    ]);

    const all: Partial<ProactiveHint>[] = [
      ...(ticketHints.status === 'fulfilled' ? ticketHints.value : []),
      ...(mailHints.status === 'fulfilled' ? mailHints.value : []),
      ...(docHints.status === 'fulfilled' ? docHints.value : []),
    ];

    return this.saveNewHints(username, all);
  }

  // Tickets with a dueDate in the next 14 days → suggest calendar event
  private async scanTickets(username: string): Promise<Partial<ProactiveHint>[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 14);
    const tickets = await this.tickets.find({
      where: {
        owner: username,
        status: 'open',
        dueDate: MoreThanOrEqual(new Date().toISOString().slice(0, 10)) as unknown as string,
      },
    });
    return tickets
      .filter(t => t.dueDate && t.dueDate <= cutoff.toISOString().slice(0, 10))
      .map(t => ({
        type: 'ticket_due' as const,
        title: `Herinnering: ${t.title}`,
        suggestedDate: t.dueDate!,
        source: 'ticket' as const,
        sourceRef: t.id,
      }));
  }

  // Scan recent unread mail subjects via Ollama for date/appointment extraction
  private async scanMail(username: string): Promise<Partial<ProactiveHint>[]> {
    try {
      const stats = await this.mail.getStats(username);
      const inboxStat = stats.folders.find(f => f.name === 'INBOX');
      if (!inboxStat || inboxStat.unread === 0) return [];

      const { messages } = await this.mail.getMessages(username, 'INBOX', 1, 20);
      const recentUnread = messages.filter(m => !m.seen).slice(0, 10);
      if (recentUnread.length === 0) return [];

      const subjects = recentUnread.map((m, i) => `${i + 1}. ${m.subject ?? '(geen onderwerp)'}`).join('\n');
      const extracted = await this.extractDatesWithOllama(subjects, 'mail onderwerpen');

      return extracted.map((e, i) => ({
        type: e.type,
        title: e.title,
        suggestedDate: e.date,
        source: 'mail' as const,
        sourceRef: String(recentUnread[i]?.uid ?? ''),
      }));
    } catch (err) {
      this.logger.warn(`Mail scan failed for ${username}: ${(err as Error).message}`);
      return [];
    }
  }

  // Scan recent document titles for deadline/appointment mentions
  private async scanDocuments(username: string): Promise<Partial<ProactiveHint>[]> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const { data: paperless } = await axios.get<{ results: { id: number; title: string }[] }>(
        `${this.config.get('PAPERLESS_URL') ?? 'http://paperless:8000'}/api/documents/`,
        {
          params: { owner__username: username, ordering: '-created', page_size: 10 },
          headers: { Authorization: `Token ${this.config.get('PAPERLESS_API_TOKEN') ?? ''}` },
          timeout: 10_000,
        },
      );
      const docs = paperless.results ?? [];
      if (docs.length === 0) return [];

      const titles = docs.map((d, i) => `${i + 1}. ${d.title}`).join('\n');
      const extracted = await this.extractDatesWithOllama(titles, 'document titels');

      return extracted.map((e, i) => ({
        type: e.type,
        title: e.title,
        suggestedDate: e.date,
        source: 'document' as const,
        sourceRef: String(docs[i]?.id ?? ''),
      }));
    } catch (err) {
      this.logger.warn(`Document scan failed for ${username}: ${(err as Error).message}`);
      return [];
    }
  }

  // ── Ollama extraction ──────────────────────────────────────────────────────

  private async extractDatesWithOllama(items: string, context: string): Promise<ExtractedHint[]> {
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Je bent een assistent die afspraken en deadlines extraheert uit ${context}.

Vandaag is ${today}. Bekijk de onderstaande items en identificeer alleen items die een specifieke datum, afspraak, vergadering of deadline bevatten. Negeer vage items zonder datum.

Items:
${items}

Geef ALLEEN een JSON array terug, geen uitleg. Formaat:
[{"title":"korte beschrijving","date":"YYYY-MM-DD","type":"appointment of deadline"}]

Als er geen relevante items zijn, geef dan: []`;

    try {
      const { data } = await axios.post(
        `${this.ollama.url}/api/generate`,
        { model: this.ollama.model, prompt, stream: false, format: 'json' },
        { timeout: 60_000 },
      );
      const raw: string = data?.response ?? '[]';
      // Extract JSON array from response
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed = JSON.parse(match[0]) as ExtractedHint[];
      return parsed.filter(h => h.title && h.date && /^\d{4}-\d{2}-\d{2}/.test(h.date) && new Date(h.date) > new Date());
    } catch (err) {
      this.logger.warn(`Ollama extraction failed: ${(err as Error).message}`);
      return [];
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async saveNewHints(username: string, hints: Partial<ProactiveHint>[]): Promise<ProactiveHint[]> {
    if (hints.length === 0) return [];
    // Avoid duplicates: skip hints whose sourceRef already exists
    const existingRefs = (await this.repo.find({
      where: { username, sourceRef: In(hints.map(h => h.sourceRef).filter(Boolean) as string[]) },
      select: { sourceRef: true },
    })).map(h => h.sourceRef);

    const fresh = hints.filter(h => !h.sourceRef || !existingRefs.includes(h.sourceRef));
    if (fresh.length === 0) return [];

    const entities = fresh.map(h => this.repo.create({ ...h, username }));
    return this.repo.save(entities);
  }

  private async getAuthUsers(): Promise<AuthUser[]> {
    try {
      const { data } = await axios.get<{ results: AuthUser[] }>(
        `${this.authentikUrl}/api/v3/core/users/?page_size=100&type=internal`,
        { headers: { Authorization: `Bearer ${this.authentikToken}` }, timeout: 8_000 },
      );
      return data.results ?? [];
    } catch (err) {
      this.logger.warn(`Could not fetch Authentik users: ${(err as Error).message}`);
      return [];
    }
  }
}
