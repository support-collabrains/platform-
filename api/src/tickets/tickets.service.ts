import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Queue, Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { SignalTicket } from './ticket.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

type Lang = 'nl' | 'de' | 'en';

@Injectable()
export class TicketsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketsService.name);
  private reminderQueue: Queue;
  private reminderWorker: Worker;

  constructor(
    @InjectRepository(SignalTicket)
    private readonly repo: Repository<SignalTicket>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get('QUEUE_REDIS_URL') ?? 'redis://queue-redis:6379';
    const conn = { url: redisUrl };

    this.reminderQueue = new Queue('ticket-reminders', { connection: conn });

    this.reminderWorker = new Worker(
      'ticket-reminders',
      async () => this.sendDueReminders(),
      { connection: conn },
    );

    // Schedule recurring reminder check every hour
    void this.scheduleHourlyReminders();
  }

  async onModuleDestroy() {
    await this.reminderWorker.close();
    await this.reminderQueue.close();
  }

  private async scheduleHourlyReminders() {
    // Remove any existing repeatable job, then re-add
    const repeatable = await this.reminderQueue.getRepeatableJobs();
    for (const job of repeatable) {
      await this.reminderQueue.removeRepeatableByKey(job.key);
    }
    await this.reminderQueue.add('check', {}, { repeat: { every: 60 * 60 * 1000 } });
  }

  private async sendDueReminders() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const overdue = await this.repo.find({
      where: { status: 'open', dueDate: LessThanOrEqual(today) },
    });

    for (const ticket of overdue) {
      try {
        await this.notifications.sendToNumber(ticket.phone, `⏰ Herinnering: taak #${ticket.seq} — ${ticket.title} (vervaldatum: ${ticket.dueDate})`);
      } catch (err) {
        this.logger.warn(`Reminder failed for ticket ${ticket.id}: ${String(err)}`);
      }
    }
  }

  // ── Signal command handlers ──────────────────────────────────────────────

  async createPending(owner: string, phone: string, title: string, dueDate?: string): Promise<SignalTicket> {
    const ticket = this.repo.create({ owner, phone, title, status: 'pending_confirm', dueDate: dueDate ?? null, notes: null });
    return this.repo.save(ticket);
  }

  async confirmPending(phone: string): Promise<SignalTicket | null> {
    const ticket = await this.repo.findOne({
      where: { phone, status: 'pending_confirm' },
      order: { createdAt: 'ASC' },
    });
    if (!ticket) return null;

    const seq = await this.nextSeq(ticket.owner);
    ticket.seq = seq;
    ticket.status = 'open';
    const saved = await this.repo.save(ticket);
    await this.audit.log(saved.owner, 'ticket.create', saved.id, { title: saved.title, seq: saved.seq, dueDate: saved.dueDate });
    return saved;
  }

  async cancelPending(phone: string): Promise<boolean> {
    const ticket = await this.repo.findOne({
      where: { phone, status: 'pending_confirm' },
      order: { createdAt: 'ASC' },
    });
    if (!ticket) return false;
    ticket.status = 'cancelled';
    await this.repo.save(ticket);
    await this.audit.log(ticket.owner, 'ticket.cancel', ticket.id, { title: ticket.title });
    return true;
  }

  async hasPending(phone: string): Promise<boolean> {
    const count = await this.repo.count({ where: { phone, status: 'pending_confirm' } });
    return count > 0;
  }

  async listOpen(owner: string): Promise<SignalTicket[]> {
    return this.repo.find({
      where: { owner, status: 'open' },
      order: { seq: 'ASC' },
    });
  }

  async markDone(owner: string, seq: number): Promise<SignalTicket | null> {
    const ticket = await this.repo.findOne({ where: { owner, seq, status: 'open' } });
    if (!ticket) return null;
    ticket.status = 'done';
    const saved = await this.repo.save(ticket);
    await this.audit.log(owner, 'ticket.done', saved.id, { title: saved.title, seq: saved.seq });
    return saved;
  }

  // ── Dashboard API ────────────────────────────────────────────────────────

  async getTicketsForUser(owner: string, status?: string): Promise<SignalTicket[]> {
    if (status === 'done') {
      return this.repo.find({ where: { owner, status: 'done' }, order: { updatedAt: 'DESC' }, take: 50 });
    }
    return this.repo.find({
      where: { owner, status: 'open' },
      order: { seq: 'ASC' },
    });
  }

  async listAll(limit = 200): Promise<SignalTicket[]> {
    return this.repo.find({
      where: [{ status: 'open' }, { status: 'pending_confirm' }],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async updateTicket(id: string, owner: string, status: 'done' | 'open', notes?: string): Promise<boolean> {
    const ticket = await this.repo.findOne({ where: { id, owner } });
    if (!ticket) return false;
    ticket.status = status;
    if (notes !== undefined) ticket.notes = notes;
    await this.repo.save(ticket);
    return true;
  }

  async deleteTicket(id: string, owner: string): Promise<boolean> {
    const ticket = await this.repo.findOne({ where: { id, owner } });
    if (!ticket) return false;
    await this.repo.remove(ticket);
    return true;
  }

  // ── i18n ─────────────────────────────────────────────────────────────────

  i18n(lang: Lang) {
    const t = {
      nl: {
        created: (title: string, dueDate?: string) =>
          `📌 Nieuwe taak aangemaakt:\n${title}${dueDate ? `\nVervaldatum: ${dueDate}` : ''}\n\nStuur ✅ om te bevestigen of ❌ om te annuleren.`,
        confirmed: (seq: number, title: string) => `✅ Taak #${seq} opgeslagen: ${title}`,
        cancelled: () => `❌ Taak geannuleerd.`,
        noPending: () => `❌ Geen openstaande bevestiging.`,
        listHeader: () => `📋 Openstaande taken:\n`,
        listEmpty: () => `Geen openstaande taken.`,
        listItem: (seq: number, title: string, dueDate?: string | null) => `#${seq} — ${title}${dueDate ? ` (voor ${dueDate})` : ''}`,
        markedDone: (seq: number, title: string) => `✅ Taak #${seq} afgerond: ${title}`,
        notFound: (seq: number) => `❌ Taak #${seq} niet gevonden.`,
      },
      de: {
        created: (title: string, dueDate?: string) =>
          `📌 Neue Aufgabe erstellt:\n${title}${dueDate ? `\nFällig: ${dueDate}` : ''}\n\nSende ✅ zum Bestätigen oder ❌ zum Abbrechen.`,
        confirmed: (seq: number, title: string) => `✅ Aufgabe #${seq} gespeichert: ${title}`,
        cancelled: () => `❌ Aufgabe abgebrochen.`,
        noPending: () => `❌ Keine ausstehende Bestätigung.`,
        listHeader: () => `📋 Offene Aufgaben:\n`,
        listEmpty: () => `Keine offenen Aufgaben.`,
        listItem: (seq: number, title: string, dueDate?: string | null) => `#${seq} — ${title}${dueDate ? ` (bis ${dueDate})` : ''}`,
        markedDone: (seq: number, title: string) => `✅ Aufgabe #${seq} erledigt: ${title}`,
        notFound: (seq: number) => `❌ Aufgabe #${seq} nicht gefunden.`,
      },
      en: {
        created: (title: string, dueDate?: string) =>
          `📌 New task created:\n${title}${dueDate ? `\nDue: ${dueDate}` : ''}\n\nSend ✅ to confirm or ❌ to cancel.`,
        confirmed: (seq: number, title: string) => `✅ Task #${seq} saved: ${title}`,
        cancelled: () => `❌ Task cancelled.`,
        noPending: () => `❌ No pending confirmation.`,
        listHeader: () => `📋 Open tasks:\n`,
        listEmpty: () => `No open tasks.`,
        listItem: (seq: number, title: string, dueDate?: string | null) => `#${seq} — ${title}${dueDate ? ` (due ${dueDate})` : ''}`,
        markedDone: (seq: number, title: string) => `✅ Task #${seq} done: ${title}`,
        notFound: (seq: number) => `❌ Task #${seq} not found.`,
      },
    };
    return t[lang];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async nextSeq(owner: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('t')
      .select('MAX(t.seq)', 'max')
      .where('t.owner = :owner', { owner })
      .getRawOne<{ max: number | null }>();
    return (result?.max ?? 0) + 1;
  }
}
