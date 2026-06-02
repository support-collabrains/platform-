import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import axios from 'axios';
import { DocDocument, DocNotification, DocSummary } from './document.entity';
import { OllamaService } from './ollama.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketsService } from '../tickets/tickets.service';

interface SummaryJob {
  documentId: string;
  notificationId: string;
  phone: string;
  paperlessId: number;
  title: string;
  language: 'nl' | 'de' | 'en';
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
  private readonly portalOrigin: string;
  private redis: Redis;

  constructor(
    private readonly config: ConfigService,
    private readonly ollama: OllamaService,
    private readonly notifications: NotificationsService,
    private readonly tickets: TicketsService,
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
    this.portalOrigin = config.get('PORTAL_ORIGIN') ?? '';
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

    this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
    await this.redis.connect().catch(() => {});

    this.poller = setInterval(() => this.pollSignal(), 5_000);

    // Pull Ollama model in background — may take minutes on first boot
    this.ollama.ensureModel().catch(() => {});
  }

  async onModuleDestroy() {
    clearInterval(this.poller);
    await this.worker?.close();
    await this.queue?.close();
    await this.redis?.quit().catch(() => {});
  }

  // Called by Paperless post-consume script via POST /documents/consumed
  async handleSignalCommand(sender: string, text: string, _timestamp?: number): Promise<void> {
    // Called by signal-consumer when a /command is received.
    // The consumer consumed the message before the NestJS poller could read it,
    // so the consumer forwards commands here via HTTP.
    this.logger.log(`Signal command via webhook: from=${sender} text="${text}"`);

    // Store in Redis so the next pollSignal cycle processes it like a real message
    if (this.redis) {
      const key = `signal:pending:${Date.now()}`;
      await this.redis.setex(key, 300, JSON.stringify({
        envelope: {
          sourceNumber: sender,
          sourceUuid: '',
          timestamp: Date.now(),
          dataMessage: { message: text, attachments: [], reaction: null },
        },
      }));
    }

    // Also handle /help immediately without waiting for next poll
    if (/^\/help$/i.test(text)) {
      const lang = await this.getLanguageForPhone(sender);
      await this.sendSignal(sender, this.i18n(lang).help(
        this.portalOrigin ? `${this.portalOrigin}/dashboard` : 'het dashboard',
      ));
    }
  }

  async onConsumed(paperlessId: number, owner: string, title: string): Promise<void> {
    // Idempotent: skip if we already know this document
    const existing = await this.docRepo.findOne({ where: { paperlessId } });
    if (existing) return;

    const doc = await this.docRepo.save(this.docRepo.create({ paperlessId, owner, title }));
    this.logger.log(`New document consumed: ${title} (paperless #${paperlessId}, owner: ${owner})`);

    // Trigger paperless-gpt AI classification in background
    this.tagDocumentForGpt(paperlessId).catch(() => {});
    this.categorizeDocument(paperlessId, owner, title).catch(() => {});

    const { phones, signalDocNotify, language } = await this.getPhonesAndPrefsForUser(owner);
    if (!signalDocNotify) {
      this.logger.log(`Signal notifications disabled for ${owner} — skipping`);
      return;
    }
    if (!phones.length) {
      this.logger.log(`No phone numbers for ${owner} — skipping Signal prompt`);
      return;
    }

    const t = this.i18n(language);
    for (const phone of phones) {
      const sentTimestamp = await this.sendSignal(phone, t.newDoc(title));

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

      // Also drain any pending messages forwarded by signal-consumer via webhook
      const pendingMessages: unknown[] = [];
      if (this.redis) {
        const keys = await this.redis.keys('signal:pending:*');
        for (const key of keys) {
          const raw = await this.redis.get(key);
          if (raw) {
            try { pendingMessages.push(JSON.parse(raw)); } catch { /* skip */ }
            await this.redis.del(key);
          }
        }
      }

      const allMessages = [...(Array.isArray(messages) ? messages : []), ...pendingMessages];
      if (allMessages.length === 0) return;

      for (const msg of allMessages) {
        const envelope = msg?.envelope;
        if (!envelope) continue;

        // Prefer phone number; fall back to UUID for privacy-mode users
        const senderPhone: string = envelope.sourceNumber ?? '';
        const senderUuid: string = envelope.sourceUuid ?? '';
        const sender: string = senderPhone || senderUuid;
        // Support syncMessage (sent from own device) as well as dataMessage
        const dataMsg = envelope.dataMessage ?? envelope.syncMessage?.sentMessage;
        const text: string = (dataMsg?.message ?? '').trim();
        const reaction: string = dataMsg?.reaction?.emoji ?? '';

        this.logger.log(`Signal msg from=${sender || '(empty)'} number=${senderPhone || 'null'} uuid=${senderUuid || 'null'} text="${text.slice(0, 60)}" reaction="${reaction}" keys=${Object.keys(envelope).join(',')}`);

        if (!sender) continue;

        // Skip messages already handled by signal-consumer (Paperless bridge)
        const msgTs = envelope.timestamp ?? envelope.dataMessage?.timestamp;
        if (msgTs && this.redis) {
          const processed = await this.redis.exists(`signal:processed:${msgTs}`);
          if (processed) {
            this.logger.debug(`Skipping already-processed message ts=${msgTs}`);
            continue;
          }
        }

        // /help
        if (/^\/help$/i.test(text)) {
          const lang = await this.getLanguageForPhone(sender);
          await this.sendSignal(sender, this.i18n(lang).help(
            this.portalOrigin ? `${this.portalOrigin}/dashboard` : 'het dashboard',
          ));
          continue;
        }

        // /phone2 <number> or /phone2 verwijder
        const phone2Match = text.match(/^\/phone2\s+(.+)$/i);
        if (phone2Match) {
          await this.handleSetPhone2(sender, phone2Match[1].trim());
          continue;
        }

        // /taak, /aufgabe, /task — create ticket (optional: "op DD-MM" or "op DD-MM-YYYY")
        const taskMatch = text.match(/^\/(?:taak|aufgabe|task)\s+(.+)$/i);
        if (taskMatch) {
          const { title, dueDate } = this.parseTaskText(taskMatch[1].trim());
          await this.handleCreateTicket(sender, title, dueDate);
          continue;
        }

        // /taken, /aufgaben, /tasks — list open tickets
        if (/^\/(?:taken|aufgaben|tasks)$/i.test(text)) {
          await this.handleListTickets(sender);
          continue;
        }

        // /agenda — today's agenda
        if (/^\/agenda$/i.test(text)) {
          await this.handleAgenda(sender);
          continue;
        }

        // /klaar, /fertig, /done <nr> — mark ticket done
        const doneMatch = text.match(/^\/(?:klaar|fertig|done)\s+(\d+)$/i);
        if (doneMatch) {
          await this.handleMarkTicketDone(sender, parseInt(doneMatch[1], 10));
          continue;
        }

        // ❌ — cancel pending ticket
        const isCancellation = text.includes('❌') || reaction === '❌';
        if (isCancellation) {
          await this.handleCancelTicket(sender);
          continue;
        }

        // ✅ — confirm pending ticket first, then queue document summary
        const isApproval = text.includes('✅') || reaction === '✅';

        // Free-form NLU: non-empty messages that matched no command and are not reactions
        if (!isApproval && !reaction && text.length > 0) {
          await this.handleFreeText(sender, text);
          continue;
        }

        if (!isApproval) continue;

        // Check pending ticket confirmation first
        const ticketConfirmed = await this.handleConfirmTicket(sender);
        if (ticketConfirmed) continue;

        // Fall back to document summary approval
        const notif = await this.notifRepo.findOne({
          where: { phone: sender, status: 'pending' },
          order: { createdAt: 'ASC' },
        });
        if (!notif) continue;

        const doc = await this.docRepo.findOne({ where: { id: notif.documentId } });
        if (!doc) continue;

        notif.status = 'processing';
        await this.notifRepo.save(notif);

        const userLang = await this.getLanguageForPhone(sender);
        const tApproval = this.i18n(userLang);

        this.logger.log(`✅ received from ${sender} for document: ${doc.title}`);
        await this.sendSignal(sender, tApproval.processing(doc.title));

        await this.queue.add('summarize', {
          documentId: doc.id,
          notificationId: notif.id,
          phone: sender,
          paperlessId: doc.paperlessId,
          title: doc.title,
          language: userLang,
        } satisfies SummaryJob);
      }
    } catch (err) {
      this.logger.warn(`Signal poll error: ${(err as Error).message}`);
    }
  }

  private parseTaskText(raw: string): { title: string; dueDate?: string } {
    // Match "op DD-MM" or "op DD-MM-YYYY" at the end of the text
    const match = raw.match(/^(.+?)\s+op\s+(\d{1,2}-\d{1,2}(?:-\d{4})?)$/i);
    if (!match) return { title: raw };
    const title = match[1].trim();
    const parts = match[2].split('-').map(Number);
    const day = parts[0];
    const month = parts[1];
    const year = parts[2] ?? new Date().getFullYear();
    const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { title, dueDate };
  }

  private async handleCreateTicket(phone: string, title: string, dueDate?: string): Promise<void> {
    const user = await this.findUserByPhone(phone);
    if (!user) {
      await this.sendSignal(phone, '❌ Geen account gevonden voor dit nummer.');
      return;
    }
    const lang = await this.getLanguageForPhone(phone);
    const t = this.tickets.i18n(lang);
    await this.tickets.createPending(user.username, phone, title, dueDate);
    this.logger.log(`Ticket pending confirmation for ${user.username}: ${title}${dueDate ? ` (due ${dueDate})` : ''}`);
    await this.sendSignal(phone, t.created(title, dueDate));
  }

  private async handleConfirmTicket(phone: string): Promise<boolean> {
    const ticket = await this.tickets.confirmPending(phone);
    if (!ticket) return false;
    const lang = await this.getLanguageForPhone(phone);
    const t = this.tickets.i18n(lang);
    this.logger.log(`Ticket #${ticket.seq} confirmed for phone ${phone.slice(0, 8)}***: ${ticket.title}`);
    await this.sendSignal(phone, t.confirmed(ticket.seq, ticket.title));
    return true;
  }

  private async handleCancelTicket(phone: string): Promise<void> {
    const lang = await this.getLanguageForPhone(phone);
    const t = this.tickets.i18n(lang);
    const cancelled = await this.tickets.cancelPending(phone);
    await this.sendSignal(phone, cancelled ? t.cancelled() : t.noPending());
  }

  private async handleListTickets(phone: string): Promise<void> {
    const user = await this.findUserByPhone(phone);
    if (!user) {
      await this.sendSignal(phone, '❌ Geen account gevonden voor dit nummer.');
      return;
    }
    const lang = await this.getLanguageForPhone(phone);
    const t = this.tickets.i18n(lang);
    const open = await this.tickets.listOpen(user.username);
    if (!open.length) {
      await this.sendSignal(phone, t.listEmpty());
      return;
    }
    const lines = [t.listHeader(), ...open.map((tk) => t.listItem(tk.seq, tk.title, tk.dueDate))];
    await this.sendSignal(phone, lines.join('\n'));
  }

  private async handleAgenda(phone: string): Promise<void> {
    const user = await this.findUserByPhone(phone);
    if (!user) {
      await this.sendSignal(phone, '❌ Geen account gevonden voor dit nummer.');
      return;
    }
    const lang = await this.getLanguageForPhone(phone);
    const today = new Date().toISOString().slice(0, 10);

    // Open tasks due today or overdue
    const open = await this.tickets.listOpen(user.username);
    const due = open.filter(tk => tk.dueDate && tk.dueDate <= today);

    if (!due.length) {
      const msg = { nl: '📅 Geen taken gepland voor vandaag.', de: '📅 Keine Aufgaben für heute geplant.', en: '📅 No tasks scheduled for today.' };
      await this.sendSignal(phone, msg[lang] ?? msg.nl);
      return;
    }

    const header = { nl: `📅 Agenda voor vandaag:\n`, de: `📅 Agenda für heute:\n`, en: `📅 Today's agenda:\n` };
    const t = this.tickets.i18n(lang);
    const lines = [header[lang] ?? header.nl, ...due.map(tk => t.listItem(tk.seq, tk.title, tk.dueDate))];
    await this.sendSignal(phone, lines.join('\n'));
  }

  private async handleMarkTicketDone(phone: string, seq: number): Promise<void> {
    const user = await this.findUserByPhone(phone);
    if (!user) {
      await this.sendSignal(phone, '❌ Geen account gevonden voor dit nummer.');
      return;
    }
    const lang = await this.getLanguageForPhone(phone);
    const t = this.tickets.i18n(lang);
    const ticket = await this.tickets.markDone(user.username, seq);
    if (!ticket) {
      await this.sendSignal(phone, t.notFound(seq));
      return;
    }
    this.logger.log(`Ticket #${seq} marked done for ${user.username}`);
    await this.sendSignal(phone, t.markedDone(ticket.seq, ticket.title));
  }

  private async handleFreeText(phone: string, text: string): Promise<void> {
    const lang = await this.getLanguageForPhone(phone);
    this.logger.log(`NLU processing for ${phone.slice(0, 8)}***: "${text.slice(0, 60)}"`);

    const intent = await this.ollama.parseIntent(text, lang);
    this.logger.log(`NLU result: intent=${intent.intent} confidence=${intent.confidence}`);

    if (intent.confidence < 0.4) {
      const fallback = lang === 'de'
        ? `🤔 Ich habe das nicht ganz verstanden. Tippe /help für eine Übersicht der Befehle.`
        : lang === 'en'
          ? `🤔 I didn't quite understand that. Type /help for an overview of commands.`
          : `🤔 Ik begreep dat niet helemaal. Typ /help voor een overzicht van commando's.`;
      await this.sendSignal(phone, fallback);
      return;
    }

    switch (intent.intent) {
      case 'create_task': {
        const title = intent.title?.trim() || text;
        const dueDate = intent.due_date ?? undefined;
        await this.handleCreateTicket(phone, title, dueDate);
        break;
      }
      case 'list_tasks':
        await this.handleListTickets(phone);
        break;
      case 'complete_task': {
        if (intent.task_number) {
          await this.handleMarkTicketDone(phone, intent.task_number);
        } else {
          const user = await this.findUserByPhone(phone);
          const open = user ? await this.tickets.listOpen(user.username) : [];
          if (open.length === 1) {
            await this.handleMarkTicketDone(phone, open[0].seq);
          } else if (open.length === 0) {
            await this.sendSignal(phone, this.tickets.i18n(lang).listEmpty());
          } else {
            await this.handleListTickets(phone);
          }
        }
        break;
      }
      case 'agenda':
        await this.handleAgenda(phone);
        break;
      default:
        if (intent.reply) {
          await this.sendSignal(phone, intent.reply);
        } else {
          const fallback2 = lang === 'de'
            ? `🤔 Ich bin mir nicht sicher, was du meinst. Tippe /help für Hilfe.`
            : lang === 'en'
              ? `🤔 I'm not sure what you mean. Type /help for help.`
              : `🤔 Ik weet niet precies wat je bedoelt. Typ /help voor hulp.`;
          await this.sendSignal(phone, fallback2);
        }
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
      : `✅ Je 2e nummer is ingesteld op ${newPhone2}.\nDat nummer ontvangt voortaan ook document-meldingen.`;
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

  private async getLanguageForPhone(phone: string): Promise<'nl' | 'de' | 'en'> {
    try {
      const user = await this.findUserByPhone(phone);
      if (!user) return 'nl';
      const lang = user.attributes.language as 'nl' | 'de' | 'en';
      return ['nl', 'de', 'en'].includes(lang) ? lang : 'nl';
    } catch {
      return 'nl';
    }
  }

  // BullMQ worker: fetch text from Paperless → Ollama → send via Signal
  private async processSummary(data: SummaryJob): Promise<void> {
    const { documentId, notificationId, phone, paperlessId, title, language } = data;
    const t = this.i18n(language ?? 'nl');
    try {
      const text = await this.fetchDocumentText(paperlessId);
      if (!text) throw new Error('Geen extracteerbare tekst / No extractable text / Kein extrahierbarer Text');

      const summary = await this.ollama.summarize(text);

      await this.sendSignal(phone, t.summary(title, summary));

      await this.summaryRepo.save(
        this.summaryRepo.create({ documentId, content: summary, modelUsed: this.ollama.model }),
      );

      await this.notifRepo.update(notificationId, { status: 'done' });
      this.logger.log(`Summary sent for document ${documentId}`);
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Summary processing failed: ${msg}`);
      await this.sendSignal(phone, t.failed(title, msg));
      await this.notifRepo.update(notificationId, { status: 'failed' });
    }
  }

  private readonly CATEGORIES = [
    'Financieel', 'Medisch', 'Contract', 'Auto', 'Overheid',
    'Persoonlijk', 'Woning', 'Verzekering', 'Onderwijs', 'Overig',
  ] as const;

  private async categorizeDocument(paperlessId: number, owner: string, title: string): Promise<void> {
    try {
      const text = await this.fetchDocumentText(paperlessId);
      if (!text || text.length < 20) {
        this.logger.log(`Document #${paperlessId} has insufficient text for categorization`);
        return;
      }

      const prompt = `You are a document classifier. Classify the following document into EXACTLY ONE of these categories (respond with only the category name, nothing else):
Financieel, Medisch, Contract, Auto, Overheid, Persoonlijk, Woning, Verzekering, Onderwijs, Overig

Document title: ${title}

Document text (first 2000 chars):
${text.slice(0, 2000)}

Category:`;

      const raw = await this.ollama.summarize(prompt);
      const rawTrimmed = raw.trim();

      const category = this.CATEGORIES.find(
        c => rawTrimmed.toLowerCase() === c.toLowerCase() || rawTrimmed.toLowerCase().includes(c.toLowerCase()),
      ) ?? 'Overig';

      this.logger.log(`Document #${paperlessId} categorized as: ${category}`);

      // Get or create the category tag
      const tagId = await this.getOrCreatePaperlessTag(category, this.categoryColor(category));

      // Fetch current doc tags
      const { data: doc } = await axios.get(
        `${this.paperlessUrl}/api/documents/${paperlessId}/`,
        { headers: { Authorization: `Token ${this.paperlessToken}` }, timeout: 10_000 },
      );
      const existingTags = (doc.tags as number[]) ?? [];

      // Determine storage path
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const storagePath = `${owner}/${category}/${year}/${month}`;

      // Update document: add category tag + set storage path custom field
      await axios.patch(
        `${this.paperlessUrl}/api/documents/${paperlessId}/`,
        {
          tags: [...new Set([...existingTags, tagId])],
          archive_filename: storagePath + '/' + (doc.original_filename as string ?? `doc-${paperlessId}`),
        },
        { headers: { Authorization: `Token ${this.paperlessToken}` }, timeout: 10_000 },
      );

      this.logger.log(`Document #${paperlessId} tagged and path set to ${storagePath}`);
    } catch (err) {
      this.logger.warn(`Category tagging failed for #${paperlessId}: ${(err as Error).message}`);
    }
  }

  private categoryColor(category: string): string {
    const colors: Record<string, string> = {
      'Financieel': '#10b981',
      'Medisch': '#ef4444',
      'Contract': '#3b82f6',
      'Auto': '#f59e0b',
      'Overheid': '#8b5cf6',
      'Persoonlijk': '#ec4899',
      'Woning': '#06b6d4',
      'Verzekering': '#f97316',
      'Onderwijs': '#84cc16',
      'Overig': '#6b7280',
    };
    return colors[category] ?? '#6b7280';
  }

  private async tagDocumentForGpt(paperlessId: number): Promise<void> {
    const tagId = await this.getOrCreatePaperlessTag('paperless-gpt', '#7B8CDE');
    const { data: doc } = await axios.get(
      `${this.paperlessUrl}/api/documents/${paperlessId}/`,
      { headers: { Authorization: `Token ${this.paperlessToken}` }, timeout: 10_000 },
    );
    const existingTags = (doc.tags as number[]) ?? [];
    if (existingTags.includes(tagId)) return;
    await axios.patch(
      `${this.paperlessUrl}/api/documents/${paperlessId}/`,
      { tags: [...existingTags, tagId] },
      { headers: { Authorization: `Token ${this.paperlessToken}` }, timeout: 10_000 },
    );
    this.logger.log(`Tagged document #${paperlessId} for paperless-gpt processing`);
  }

  private async getOrCreatePaperlessTag(name: string, colour: string): Promise<number> {
    const { data } = await axios.get(
      `${this.paperlessUrl}/api/tags/?name__iexact=${encodeURIComponent(name)}`,
      { headers: { Authorization: `Token ${this.paperlessToken}` }, timeout: 10_000 },
    );
    if ((data.count as number) > 0) return (data.results[0] as { id: number }).id;
    const { data: created } = await axios.post(
      `${this.paperlessUrl}/api/tags/`,
      { name, colour },
      { headers: { Authorization: `Token ${this.paperlessToken}` }, timeout: 10_000 },
    );
    this.logger.log(`Created Paperless tag "${name}" (id: ${(created as { id: number }).id})`);
    return (created as { id: number }).id;
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
  ): Promise<{ phones: string[]; signalDocNotify: boolean; language: 'nl' | 'de' | 'en' }> {
    try {
      const { data } = await axios.get(`${this.authentikUrl}/api/v3/core/users/`, {
        headers: { Authorization: `Bearer ${this.authentikToken}` },
        params: { username, type: 'internal', page_size: 10 },
        timeout: 8_000,
      });
      const user = (
        data.results as Array<{ username: string; attributes?: Record<string, string> }>
      ).find((u) => u.username === username);
      if (!user) return { phones: [], signalDocNotify: true, language: 'nl' };
      const attrs = user.attributes ?? {};
      const phones = [attrs.phone, attrs.phone2].filter((p): p is string => !!p?.startsWith('+'));
      const signalDocNotify = attrs.signal_doc_notify !== 'false';
      const lang = attrs.language as 'nl' | 'de' | 'en';
      const language = ['nl', 'de', 'en'].includes(lang) ? lang : 'nl';
      return { phones, signalDocNotify, language };
    } catch {
      return { phones: [], signalDocNotify: true, language: 'nl' };
    }
  }

  private i18n(lang: 'nl' | 'de' | 'en'): {
    newDoc: (title: string) => string;
    processing: (title: string) => string;
    summary: (title: string, text: string) => string;
    failed: (title: string, reason: string) => string;
    help: (dashboard: string) => string;
  } {
    const t = {
      nl: {
        newDoc: (t: string) =>
          `📄 Nieuw document ontvangen\n${t}\n\nStuur ✅ (of reageer met ✅) om een automatische AI-samenvatting te ontvangen.`,
        processing: (t: string) => `⏳ Bezig met samenvatten...\n${t}`,
        summary: (t: string, s: string) => `📋 Samenvatting\n${t}\n\n${s}`,
        failed: (t: string, r: string) => `❌ Samenvatting mislukt voor:\n${t}\n\n${r}`,
        help: (d: string) => [
          `📋 CollaBrains — Overzicht`,
          ``,
          `📄 Document samenvatting`,
          `Zodra Paperless een nieuw document verwerkt, stuur ik je een berichtje. Stuur ✅ als antwoord (of reageer met ✅) om een AI-samenvatting te ontvangen.`,
          ``,
          `📌 Taken`,
          `/taak [beschrijving] — maak een nieuwe taak aan`,
          `/taak [beschrijving] op DD-MM — taak met vervaldatum`,
          `/taken — bekijk openstaande taken`,
          `/klaar [nr] — markeer taak als afgerond`,
          `/agenda — taken die vandaag vervallen`,
          ``,
          `📞 2e telefoonnummer`,
          `/phone2 +316xxxxxxxx`,
          `→ Koppel een 2e nummer aan jouw account (bijv. van je partner). Dat nummer ontvangt dan ook document-meldingen.`,
          ``,
          `/phone2 verwijder`,
          `→ Verwijder je gekoppelde 2e nummer.`,
          ``,
          `⚙️ Instellingen`,
          `Taal en meldingen instellen via het dashboard:`,
          d,
          ``,
          `❓ Commando's`,
          `/help — dit bericht opnieuw tonen`,
          `/taak, /taken, /klaar — taken beheren`,
          `/phone2 — 2e nummer beheren`,
        ].join('\n'),
      },
      de: {
        newDoc: (t: string) =>
          `📄 Neues Dokument eingegangen\n${t}\n\nSende ✅ (oder reagiere mit ✅) um eine automatische KI-Zusammenfassung zu erhalten.`,
        processing: (t: string) => `⏳ Erstelle Zusammenfassung...\n${t}`,
        summary: (t: string, s: string) => `📋 Zusammenfassung\n${t}\n\n${s}`,
        failed: (t: string, r: string) => `❌ Zusammenfassung fehlgeschlagen:\n${t}\n\n${r}`,
        help: (d: string) => [
          `📋 CollaBrains — Übersicht`,
          ``,
          `📄 Dokument-Zusammenfassung`,
          `Sobald Paperless ein neues Dokument verarbeitet, schreibe ich dir. Sende ✅ (oder reagiere mit ✅) um eine KI-Zusammenfassung zu erhalten.`,
          ``,
          `📌 Aufgaben`,
          `/aufgabe [beschreibung] — neue Aufgabe erstellen`,
          `/aufgabe [beschreibung] am TT.MM — Aufgabe mit Fälligkeit`,
          `/aufgaben — offene Aufgaben anzeigen`,
          `/fertig [nr] — Aufgabe als erledigt markieren`,
          `/agenda — heute fällige Aufgaben`,
          ``,
          `📞 2. Telefonnummer`,
          `/phone2 +4917xxxxxxxx`,
          `→ Verknüpfe eine 2. Nummer mit deinem Konto (z.B. für deinen Partner). Diese Nummer erhält dann ebenfalls Benachrichtigungen.`,
          ``,
          `/phone2 entfernen`,
          `→ Entferne deine verknüpfte 2. Nummer.`,
          ``,
          `⚙️ Einstellungen`,
          `Sprache und Benachrichtigungen im Dashboard:`,
          d,
          ``,
          `❓ Befehle`,
          `/help — diese Nachricht erneut anzeigen`,
          `/aufgabe, /aufgaben, /fertig — Aufgaben verwalten`,
          `/phone2 — 2. Nummer verwalten`,
        ].join('\n'),
      },
      en: {
        newDoc: (t: string) =>
          `📄 New document received\n${t}\n\nSend ✅ (or react with ✅) to receive an automatic AI summary.`,
        processing: (t: string) => `⏳ Creating summary...\n${t}`,
        summary: (t: string, s: string) => `📋 Summary\n${t}\n\n${s}`,
        failed: (t: string, r: string) => `❌ Summary failed for:\n${t}\n\n${r}`,
        help: (d: string) => [
          `📋 CollaBrains — Help`,
          ``,
          `📄 Document summary`,
          `When Paperless processes a new document, I'll send you a message. Reply ✅ (or react with ✅) to receive an AI summary.`,
          ``,
          `📌 Tasks`,
          `/task [description] — create a new task`,
          `/task [description] on DD-MM — task with due date`,
          `/tasks — view open tasks`,
          `/done [nr] — mark task as done`,
          `/agenda — tasks due today`,
          ``,
          `📞 Second phone number`,
          `/phone2 +4917xxxxxxxx`,
          `→ Link a second number to your account (e.g. for your partner). That number will also receive document notifications.`,
          ``,
          `/phone2 remove`,
          `→ Remove your linked second number.`,
          ``,
          `⚙️ Settings`,
          `Set language and notification preferences in the dashboard:`,
          d,
          ``,
          `❓ Commands`,
          `/help — show this message again`,
          `/task, /tasks, /done — manage tasks`,
          `/phone2 — manage second number`,
        ].join('\n'),
      },
    };
    return t[lang];
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
