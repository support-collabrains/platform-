import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SignalTicket } from './ticket.entity';
import { AuditService } from '../audit/audit.service';

type Lang = 'nl' | 'de' | 'en';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(SignalTicket)
    private readonly repo: Repository<SignalTicket>,
    private readonly audit: AuditService,
  ) {}

  // ── Signal command handlers ──────────────────────────────────────────────

  async createPending(owner: string, phone: string, title: string): Promise<SignalTicket> {
    const ticket = this.repo.create({ owner, phone, title, status: 'pending_confirm' });
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
    await this.audit.log(saved.owner, 'ticket.create', saved.id, { title: saved.title, seq: saved.seq });
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

  async getTicketsForUser(owner: string): Promise<SignalTicket[]> {
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

  async updateTicket(id: string, owner: string, status: 'done' | 'open'): Promise<boolean> {
    const ticket = await this.repo.findOne({ where: { id, owner } });
    if (!ticket) return false;
    ticket.status = status;
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
        created: (title: string) =>
          `📌 Nieuwe taak aangemaakt:\n${title}\n\nStuur ✅ om te bevestigen of ❌ om te annuleren.`,
        confirmed: (seq: number, title: string) => `✅ Taak #${seq} opgeslagen: ${title}`,
        cancelled: () => `❌ Taak geannuleerd.`,
        noPending: () => `❌ Geen openstaande bevestiging.`,
        listHeader: () => `📋 Openstaande taken:\n`,
        listEmpty: () => `Geen openstaande taken.`,
        listItem: (seq: number, title: string) => `#${seq} — ${title}`,
        markedDone: (seq: number, title: string) => `✅ Taak #${seq} afgerond: ${title}`,
        notFound: (seq: number) => `❌ Taak #${seq} niet gevonden.`,
      },
      de: {
        created: (title: string) =>
          `📌 Neue Aufgabe erstellt:\n${title}\n\nSende ✅ zum Bestätigen oder ❌ zum Abbrechen.`,
        confirmed: (seq: number, title: string) => `✅ Aufgabe #${seq} gespeichert: ${title}`,
        cancelled: () => `❌ Aufgabe abgebrochen.`,
        noPending: () => `❌ Keine ausstehende Bestätigung.`,
        listHeader: () => `📋 Offene Aufgaben:\n`,
        listEmpty: () => `Keine offenen Aufgaben.`,
        listItem: (seq: number, title: string) => `#${seq} — ${title}`,
        markedDone: (seq: number, title: string) => `✅ Aufgabe #${seq} erledigt: ${title}`,
        notFound: (seq: number) => `❌ Aufgabe #${seq} nicht gefunden.`,
      },
      en: {
        created: (title: string) =>
          `📌 New task created:\n${title}\n\nSend ✅ to confirm or ❌ to cancel.`,
        confirmed: (seq: number, title: string) => `✅ Task #${seq} saved: ${title}`,
        cancelled: () => `❌ Task cancelled.`,
        noPending: () => `❌ No pending confirmation.`,
        listHeader: () => `📋 Open tasks:\n`,
        listEmpty: () => `No open tasks.`,
        listItem: (seq: number, title: string) => `#${seq} — ${title}`,
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
