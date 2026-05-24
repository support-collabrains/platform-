import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue, Worker } from 'bullmq';
import axios from 'axios';
import { DocDocument, DocNotification, DocSummary } from './document.entity';
import { OllamaService } from './ollama.service';
import { NotificationsService } from '../notifications/notifications.service';

interface SummaryJob {
  documentId: string;
  notificationId: string;
  phone: string;
  paperlessId: number;
  title: string;
}

@Injectable()
export class DocumentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentsService.name);
  private queue: Queue;
  private worker: Worker;
  private poller: ReturnType<typeof setInterval>;

  private readonly signalApiUrl: string;
  private readonly signalSender: string;
  private readonly paperlessUrl: string;
  private readonly paperlessToken: string;
  private readonly authentikUrl: string;
  private readonly authentikToken: string;

  constructor(
    private readonly config: ConfigService,
    private readonly ollama: OllamaService,
    private readonly notifications: NotificationsService,
    @InjectRepository(DocDocument) private readonly docRepo: Repository<DocDocument>,
    @InjectRepository(DocNotification) private readonly notifRepo: Repository<DocNotification>,
    @InjectRepository(DocSummary) private readonly summaryRepo: Repository<DocSummary>,
  ) {
    this.signalApiUrl = config.get('SIGNAL_API_URL') ?? 'http://signal-api:8080';
    this.signalSender = config.get('SIGNAL_SENDER') ?? '';
    this.paperlessUrl = config.get('PAPERLESS_INTERNAL_URL') ?? 'http://paperless:8000';
    this.paperlessToken = config.get('PAPERLESS_API_TOKEN') ?? '';
    this.authentikUrl = config.get('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
    this.authentikToken = config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
  }

  async onModuleInit() {
    const redisUrl = this.config.get('QUEUE_REDIS_URL') ?? 'redis://queue-redis:6379';
    const conn = { url: redisUrl };

    this.queue = new Queue('doc-summary', { connection: conn });

    this.worker = new Worker<SummaryJob>(
      'doc-summary',
      async (job) => this.processSummary(job.data),
      { connection: conn },
    );

    this.worker.on('failed', (job, err) =>
      this.logger.error(`Summary job failed for doc ${job?.data?.documentId}: ${err.message}`),
    );

    this.poller = setInterval(() => this.pollSignal(), 30_000);

    // Pull Ollama model in background — may take minutes on first boot
    this.ollama.ensureModel().catch(() => {});
  }

  async onModuleDestroy() {
    clearInterval(this.poller);
    await this.worker?.close();
    await this.queue?.close();
  }

  // Called by Paperless post-consume script via POST /documents/consumed
  async onConsumed(paperlessId: number, owner: string, title: string): Promise<void> {
    // Idempotent: skip if we already know this document
    const existing = await this.docRepo.findOne({ where: { paperlessId } });
    if (existing) return;

    const doc = await this.docRepo.save(this.docRepo.create({ paperlessId, owner, title }));
    this.logger.log(`New document consumed: ${title} (paperless #${paperlessId}, owner: ${owner})`);

    const { phones, signalDocNotify } = await this.getPhonesAndPrefsForUser(owner);
    if (!signalDocNotify) {
      this.logger.log(`Signal notifications disabled for ${owner} — skipping`);
      return;
    }
    if (!phones.length) {
      this.logger.log(`No phone numbers for ${owner} — skipping Signal prompt`);
      return;
    }

    for (const phone of phones) {
      const msg = `📄 Nieuw document: *${title}*\nWil je een automatische samenvatting? Stuur ✅ om te bevestigen.`;
      const sentTimestamp = await this.sendSignal(phone, msg);

      await this.notifRepo.save(
        this.notifRepo.create({
          documentId: doc.id,
          phone,
          sentTimestamp: sentTimestamp ? String(sentTimestamp) : null,
          status: 'pending',
        }),
      );
    }
  }

  // Polls Signal for incoming messages and handles commands + ✅ approvals
  private async pollSignal(): Promise<void> {
    if (!this.signalSender) return;
    try {
      const { data: messages } = await axios.get(
        `${this.signalApiUrl}/v1/receive/${encodeURIComponent(this.signalSender)}`,
        { timeout: 10_000 },
      );

      if (!Array.isArray(messages) || messages.length === 0) return;

      for (const msg of messages) {
        const envelope = msg?.envelope;
        if (!envelope) continue;

        const senderPhone: string = envelope.sourceNumber ?? envelope.source ?? '';
        const text: string = (envelope.dataMessage?.message ?? '').trim();
        const reaction: string = envelope.dataMessage?.reaction?.emoji ?? '';

        if (!senderPhone) continue;

        // /help
        if (/^\/help$/i.test(text)) {
          await this.sendSignal(senderPhone, this.helpText());
          continue;
        }

        // /phone2 <number> or /phone2 verwijder
        const phone2Match = text.match(/^\/phone2\s+(.+)$/i);
        if (phone2Match) {
          await this.handleSetPhone2(senderPhone, phone2Match[1].trim());
          continue;
        }

        // ✅ — queue summary
        const isApproval = text.includes('✅') || reaction === '✅';
        if (!isApproval) continue;

        const notif = await this.notifRepo.findOne({
          where: { phone: senderPhone, status: 'pending' },
          order: { createdAt: 'ASC' },
        });
        if (!notif) continue;

        const doc = await this.docRepo.findOne({ where: { id: notif.documentId } });
        if (!doc) continue;

        notif.status = 'processing';
        await this.notifRepo.save(notif);

        this.logger.log(`✅ received from ${senderPhone} for document: ${doc.title}`);
        await this.sendSignal(senderPhone, `⏳ Bezig met samenvatten van *${doc.title}*...`);

        await this.queue.add('summarize', {
          documentId: doc.id,
          notificationId: notif.id,
          phone: senderPhone,
          paperlessId: doc.paperlessId,
          title: doc.title,
        } satisfies SummaryJob);
      }
    } catch (err) {
      this.logger.warn(`Signal poll error: ${(err as Error).message}`);
    }
  }

  private async handleSetPhone2(senderPhone: string, arg: string): Promise<void> {
    const user = await this.findUserByPhone(senderPhone);
    if (!user) {
      await this.sendSignal(senderPhone, '❌ Geen account gevonden voor dit nummer.');
      return;
    }

    const remove = /^verwijder$/i.test(arg);
    const newPhone2 = remove ? null : arg;

    if (!remove && !newPhone2?.startsWith('+')) {
      await this.sendSignal(senderPhone, '❌ Ongeldig nummer. Gebruik het internationale formaat: +316xxxxxxxx');
      return;
    }

    await this.updateUserPhone2(user.pk, user.attributes, newPhone2);

    const reply = remove
      ? '✅ Je 2e nummer is verwijderd.'
      : `✅ Je 2e nummer is ingesteld op *${newPhone2}*.\nDat nummer ontvangt voortaan ook document-meldingen.`;
    await this.sendSignal(senderPhone, reply);
    this.logger.log(`phone2 ${remove ? 'removed' : 'set to ' + newPhone2} for user ${user.username}`);
  }

  private async findUserByPhone(
    phone: string,
  ): Promise<{ pk: number; username: string; attributes: Record<string, string> } | null> {
    try {
      const { data } = await axios.get(`${this.authentikUrl}/api/v3/core/users/`, {
        headers: { Authorization: `Bearer ${this.authentikToken}` },
        params: { type: 'internal', page_size: 100 },
        timeout: 8_000,
      });
      const user = (data.results as Array<{ pk: number; username: string; attributes?: Record<string, string> }>).find(
        (u) => u.attributes?.phone === phone || u.attributes?.phone2 === phone,
      );
      if (!user) return null;
      return { pk: user.pk, username: user.username, attributes: user.attributes ?? {} };
    } catch {
      return null;
    }
  }

  private async updateUserPhone2(
    pk: number,
    currentAttributes: Record<string, string>,
    phone2: string | null,
  ): Promise<void> {
    const attributes: Record<string, string> = { ...currentAttributes };
    if (phone2) {
      attributes.phone2 = phone2;
    } else {
      delete attributes.phone2;
    }
    await axios.patch(
      `${this.authentikUrl}/api/v3/core/users/${pk}/`,
      { attributes },
      { headers: { Authorization: `Bearer ${this.authentikToken}` }, timeout: 8_000 },
    );
  }

  private helpText(): string {
    return (
      `📋 *CollaBrains hulp*\n\n` +
      `✅ – Bevestig samenvatting van nieuw document\n` +
      `*/phone2 +316xxxxxxxx* – Koppel een 2e nummer (bijv. partner)\n` +
      `*/phone2 verwijder* – Verwijder je 2e nummer\n` +
      `*/help* – Dit bericht weergeven`
    );
  }

  // BullMQ worker: fetch text from Paperless → Ollama → send via Signal
  private async processSummary(data: SummaryJob): Promise<void> {
    const { documentId, notificationId, phone, paperlessId, title } = data;
    try {
      const text = await this.fetchDocumentText(paperlessId);
      if (!text) throw new Error('Document heeft geen extracteerbare tekst');

      const summary = await this.ollama.summarize(text);

      await this.sendSignal(phone, `📋 *Samenvatting: ${title}*\n\n${summary}`);

      await this.summaryRepo.save(
        this.summaryRepo.create({ documentId, content: summary, modelUsed: this.ollama.model }),
      );

      await this.notifRepo.update(notificationId, { status: 'done' });
      this.logger.log(`Summary sent for document ${documentId}`);
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Summary processing failed: ${msg}`);
      await this.sendSignal(phone, `❌ Samenvatting mislukt voor *${title}*: ${msg}`);
      await this.notifRepo.update(notificationId, { status: 'failed' });
    }
  }

  private async fetchDocumentText(paperlessId: number): Promise<string> {
    const { data } = await axios.get(`${this.paperlessUrl}/api/documents/${paperlessId}/`, {
      headers: { Authorization: `Token ${this.paperlessToken}` },
      timeout: 15_000,
    });
    return (data.content as string) ?? '';
  }

  private async getPhonesAndPrefsForUser(
    username: string,
  ): Promise<{ phones: string[]; signalDocNotify: boolean }> {
    try {
      const { data } = await axios.get(`${this.authentikUrl}/api/v3/core/users/`, {
        headers: { Authorization: `Bearer ${this.authentikToken}` },
        params: { username, type: 'internal', page_size: 10 },
        timeout: 8_000,
      });
      const user = (
        data.results as Array<{ username: string; attributes?: Record<string, string> }>
      ).find((u) => u.username === username);
      if (!user) return { phones: [], signalDocNotify: true };
      const attrs = user.attributes ?? {};
      const phones = [attrs.phone, attrs.phone2].filter((p): p is string => !!p?.startsWith('+'));
      const signalDocNotify = attrs.signal_doc_notify !== 'false';
      return { phones, signalDocNotify };
    } catch {
      return { phones: [], signalDocNotify: true };
    }
  }

  private async sendSignal(phone: string, message: string): Promise<number | null> {
    if (!this.signalSender) return null;
    try {
      const { data } = await axios.post(
        `${this.signalApiUrl}/v2/send`,
        { message, number: this.signalSender, recipients: [phone] },
        { timeout: 15_000 },
      );
      return (data as { timestamp?: number })?.timestamp ?? null;
    } catch (err) {
      this.logger.warn(`Signal send to ${phone} failed: ${(err as Error).message}`);
      return null;
    }
  }
}
