# Finance Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voeg een finance module toe die facturen/abonnementen automatisch extraheert uit Paperless en IMAP via Ollama, met review-wachtrij, maandoverzicht en abonnement-alerts via Signal + Diggi.

**Architecture:** Twee nieuwe NestJS modules (`finance` en `finance-mail-poller`), twee PostgreSQL tabellen, acht REST endpoints onder `/me/finance/`, en drie React client-components in het portal. De bestaande `OllamaService`, `MailImapService`, `NotificationsService` en `ProactiveService` worden uitgebreid — niet herschreven.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL 16, BullMQ, Ollama (`llama3.1:8b`), React 19, Tailwind CSS v4, Lucide icons. Geen nieuwe npm-dependencies.

---

## File Map

**Nieuw — API:**
- `api/src/finance/finance.entity.ts` — `FinanceTransaction` + `FinanceSubscription` entities
- `api/src/finance/finance.dto.ts` — request/response DTOs
- `api/src/finance/finance-extractor.service.ts` — Ollama extractie
- `api/src/finance/finance-extractor.service.spec.ts` — unit tests
- `api/src/finance/finance-alert.service.ts` — opzegtermijn-check + Signal notificatie
- `api/src/finance/finance-alert.service.spec.ts` — unit tests
- `api/src/finance/finance-mail-poller.service.ts` — 15-min IMAP poller
- `api/src/finance/finance-mail-poller.service.spec.ts` — unit tests
- `api/src/finance/finance.service.ts` — CRUD voor transactions + subscriptions
- `api/src/finance/finance.module.ts` — module definitie

**Nieuw — Migrations:**
- `api/src/migrations/TIMESTAMP-CreateFinanceTables.ts`

**Aanpassen — API:**
- `api/src/users-me/users-me.controller.ts` — 9 nieuwe `/me/finance/*` endpoints
- `api/src/users-me/users-me.service.ts` — finance methods
- `api/src/users-me/users-me.module.ts` — FinanceModule importeren
- `api/src/proactive/proactive.service.ts` — `scanUser()` uitbreiden met finance-check
- `api/src/proactive/proactive.module.ts` — FinanceModule importeren
- `api/src/app.module.ts` — FinanceModule registreren

**Nieuw — Portal:**
- `portal/app/dashboard/finance/page.tsx` — route entry point
- `portal/app/dashboard/finance/FinanceOverview.tsx` — tiles + grafiek + recente transacties
- `portal/app/dashboard/finance/FinanceTransactions.tsx` — lijst + review + handmatige invoer
- `portal/app/dashboard/finance/FinanceSubscriptions.tsx` — abonnementenlijst + alerts
- `portal/app/api/me/finance/[...path]/route.ts` — Next.js proxy naar NestJS

**Aanpassen — Portal:**
- `portal/components/layout/Sidebar.tsx` — Finance nav-item + badge
- `portal/app/dashboard/AppShell.tsx` — Finance in bottom nav (optioneel, 6e item)
- `portal/app/dashboard/lang.ts` — finance vertalingen

---

## Task 1: Database entities en migration

**Files:**
- Create: `api/src/finance/finance.entity.ts`
- Create: `api/src/migrations/TIMESTAMP-CreateFinanceTables.ts`

- [ ] **Step 1: Schrijf `api/src/finance/finance.entity.ts`**

```typescript
import {
  Column, CreateDateColumn, Entity,
  PrimaryGeneratedColumn, ManyToOne, JoinColumn,
} from 'typeorm';

export type FinanceSource = 'paperless' | 'mail' | 'manual';
export type FinanceStatus = 'pending' | 'approved' | 'rejected';
export type FinanceType = 'eenmalig' | 'abonnement';
export type FinanceInterval = 'maandelijks' | 'kwartaal' | 'jaarlijks';
export type FinanceCategorie =
  | 'Wonen' | 'Boodschappen' | 'Abonnementen'
  | 'Verzekeringen' | 'Transport' | 'Gezondheid' | 'Overig';

export const FINANCE_CATEGORIEEN: FinanceCategorie[] = [
  'Wonen', 'Boodschappen', 'Abonnementen',
  'Verzekeringen', 'Transport', 'Gezondheid', 'Overig',
];

@Entity('finance_transactions')
export class FinanceTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  owner: string;

  @Column({ type: 'varchar', length: 20 })
  source: FinanceSource;

  @Column({ nullable: true })
  sourceRef: string;

  @Column()
  leverancier: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  bedrag: number;

  @Column({ type: 'date' })
  datum: string;

  @Column({ type: 'varchar', length: 30 })
  categorie: FinanceCategorie;

  @Column({ type: 'varchar', length: 20 })
  type: FinanceType;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: FinanceStatus;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('finance_subscriptions')
export class FinanceSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  owner: string;

  @Column({ nullable: true })
  transactionId: string;

  @Column()
  naam: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  bedrag: number;

  @Column({ type: 'varchar', length: 20 })
  interval: FinanceInterval;

  @Column({ type: 'date' })
  volgendeBetaaldatum: string;

  @Column({ default: 30 })
  opzegtermijnDagen: number;

  @Column({ default: true })
  actief: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 2: Genereer migration**

```bash
cd /srv/platform/api
npx typeorm migration:generate src/migrations/CreateFinanceTables -d src/data-source.ts 2>/dev/null || \
  echo "Handmatige migration aanmaken"
```

Als het commando faalt (geen data-source.ts), maak dan handmatig aan:

```bash
TIMESTAMP=$(date +%s)000
cat > /srv/platform/api/src/migrations/${TIMESTAMP}-CreateFinanceTables.ts << 'MIGRATION'
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFinanceTables1000000000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE finance_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner VARCHAR NOT NULL,
        source VARCHAR(20) NOT NULL,
        "sourceRef" VARCHAR,
        leverancier VARCHAR NOT NULL,
        bedrag DECIMAL(10,2) NOT NULL,
        datum DATE NOT NULL,
        categorie VARCHAR(30) NOT NULL,
        type VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        notes VARCHAR,
        "createdAt" TIMESTAMP DEFAULT now()
      )
    `);
    await qr.query(`
      CREATE TABLE finance_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner VARCHAR NOT NULL,
        "transactionId" VARCHAR,
        naam VARCHAR NOT NULL,
        bedrag DECIMAL(10,2) NOT NULL,
        interval VARCHAR(20) NOT NULL,
        "volgendeBetaaldatum" DATE NOT NULL,
        "opzegtermijnDagen" INT NOT NULL DEFAULT 30,
        actief BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT now()
      )
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE finance_subscriptions');
    await qr.query('DROP TABLE finance_transactions');
  }
}
MIGRATION
```

- [ ] **Step 3: Controleer of AppModule TypeORM migrations heeft**

```bash
grep -n "migrations\|synchronize" /srv/platform/api/src/app.module.ts | head -10
```

Als `synchronize: true` staat (dev-modus), hoef je de migration niet te draaien — TypeORM maakt de tabellen zelf aan. Ga dan door naar Step 5. Als `synchronize: false`, ga naar Step 4.

- [ ] **Step 4: Registreer migration in app.module.ts (alleen als synchronize: false)**

Voeg de migration toe aan de TypeORM `migrations` array in `app.module.ts`:
```typescript
// In TypeOrmModule.forRoot config:
migrations: [/* bestaande */, CreateFinanceTables],
```

- [ ] **Step 5: Commit**

```bash
cd /srv/platform
git add api/src/finance/finance.entity.ts api/src/migrations/
git commit -m "feat(finance): add FinanceTransaction + FinanceSubscription entities and migration"
```

---

## Task 2: DTOs

**Files:**
- Create: `api/src/finance/finance.dto.ts`

- [ ] **Step 1: Schrijf `api/src/finance/finance.dto.ts`**

```typescript
import { FinanceCategorie, FinanceInterval, FinanceSource, FinanceStatus, FinanceType } from './finance.entity';

export interface CreateTransactionDto {
  leverancier: string;
  bedrag: number;
  datum: string;
  categorie: FinanceCategorie;
  type: FinanceType;
  notes?: string;
}

export interface UpdateTransactionDto {
  leverancier?: string;
  bedrag?: number;
  datum?: string;
  categorie?: FinanceCategorie;
  status?: FinanceStatus;
  notes?: string;
}

export interface CreateSubscriptionDto {
  naam: string;
  bedrag: number;
  interval: FinanceInterval;
  volgendeBetaaldatum: string;
  opzegtermijnDagen?: number;
  transactionId?: string;
}

export interface UpdateSubscriptionDto {
  naam?: string;
  bedrag?: number;
  interval?: FinanceInterval;
  volgendeBetaaldatum?: string;
  opzegtermijnDagen?: number;
  actief?: boolean;
}

export interface FinanceSummaryDto {
  maandTotalen: Array<{ maand: string; totaal: number; perCategorie: Record<string, number> }>;
  abonnementenMaandlast: number;
  actieveAbonnementen: number;
  pendingCount: number;
}

export interface ExtractedTransaction {
  leverancier: string;
  bedrag: number;
  datum: string;
  categorie: FinanceCategorie;
  type: FinanceType;
  interval?: FinanceInterval;
  opzegtermijn_dagen?: number;
  confidence: number;
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add api/src/finance/finance.dto.ts
git commit -m "feat(finance): add finance DTOs"
```

---

## Task 3: FinanceExtractorService

**Files:**
- Create: `api/src/finance/finance-extractor.service.ts`
- Create: `api/src/finance/finance-extractor.service.spec.ts`

- [ ] **Step 1: Schrijf de failing tests in `api/src/finance/finance-extractor.service.spec.ts`**

```typescript
import { FinanceExtractorService } from './finance-extractor.service';
import { OllamaService } from '../documents/ollama.service';
import { ConfigService } from '@nestjs/config';

const mockOllama = {
  url: 'http://ollama:11434',
  model: 'llama3.1:8b',
};

describe('FinanceExtractorService', () => {
  let service: FinanceExtractorService;

  beforeEach(() => {
    service = new FinanceExtractorService(mockOllama as OllamaService);
  });

  describe('parseExtraction()', () => {
    it('parst geldige JSON correct', () => {
      const raw = JSON.stringify({
        leverancier: 'Ziggo',
        bedrag: 49.95,
        datum: '2026-05-01',
        categorie: 'Abonnementen',
        type: 'abonnement',
        interval: 'maandelijks',
        opzegtermijn_dagen: 30,
        confidence: 0.95,
      });
      const result = (service as unknown as { parseExtraction: (s: string) => unknown })
        .parseExtraction(raw);
      expect(result).toMatchObject({ leverancier: 'Ziggo', bedrag: 49.95 });
    });

    it('geeft null bij ongeldige JSON', () => {
      const result = (service as unknown as { parseExtraction: (s: string) => unknown })
        .parseExtraction('geen json hier');
      expect(result).toBeNull();
    });

    it('geeft null als bedrag ontbreekt', () => {
      const raw = JSON.stringify({ leverancier: 'Test', datum: '2026-01-01', categorie: 'Overig', type: 'eenmalig', confidence: 0.5 });
      const result = (service as unknown as { parseExtraction: (s: string) => unknown })
        .parseExtraction(raw);
      expect(result).toBeNull();
    });

    it('normaliseert categorie naar Overig bij onbekende waarde', () => {
      const raw = JSON.stringify({
        leverancier: 'X', bedrag: 10, datum: '2026-01-01',
        categorie: 'OnbekendeCategorie', type: 'eenmalig', confidence: 0.5,
      });
      const result = (service as unknown as { parseExtraction: (s: string) => { categorie: string } })
        .parseExtraction(raw);
      expect(result?.categorie).toBe('Overig');
    });
  });
});
```

- [ ] **Step 2: Run tests — verwacht FAIL**

```bash
cd /srv/platform/api && npm test -- --testPathPattern="finance-extractor.service.spec" --no-coverage 2>&1 | tail -10
```

Expected: `Cannot find module './finance-extractor.service'`

- [ ] **Step 3: Schrijf `api/src/finance/finance-extractor.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { OllamaService } from '../documents/ollama.service';
import { ExtractedTransaction } from './finance.dto';
import { FINANCE_CATEGORIEEN, FinanceCategorie } from './finance.entity';

@Injectable()
export class FinanceExtractorService {
  private readonly logger = new Logger(FinanceExtractorService.name);

  constructor(private readonly ollama: OllamaService) {}

  async extract(text: string): Promise<ExtractedTransaction | null> {
    const today = new Date().toISOString().slice(0, 10);
    const prompt =
      `Je bent een financieel assistent. Extraheer factuur/abonnement-gegevens uit onderstaande tekst.\n` +
      `Vandaag is ${today}. Categorieën: ${FINANCE_CATEGORIEEN.join(', ')}.\n` +
      `Geef ALLEEN geldig JSON terug, geen uitleg:\n` +
      `{"leverancier":"...","bedrag":0.00,"datum":"YYYY-MM-DD","categorie":"...","type":"eenmalig|abonnement",` +
      `"interval":"maandelijks|kwartaal|jaarlijks","opzegtermijn_dagen":30,"confidence":0.0}\n\n` +
      `Tekst:\n${text.slice(0, 3000)}`;

    try {
      const { data } = await axios.post(
        `${this.ollama.url}/api/generate`,
        { model: this.ollama.model, prompt, stream: false },
        { timeout: 60_000 },
      );
      return this.parseExtraction((data.response as string).trim());
    } catch (err) {
      this.logger.warn(`Ollama extractie mislukt: ${(err as Error).message}`);
      return null;
    }
  }

  private parseExtraction(raw: string): ExtractedTransaction | null {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]) as Partial<ExtractedTransaction>;
      if (!parsed.leverancier || parsed.bedrag == null || !parsed.datum) return null;
      if (!FINANCE_CATEGORIEEN.includes(parsed.categorie as FinanceCategorie)) {
        parsed.categorie = 'Overig';
      }
      return {
        leverancier: parsed.leverancier,
        bedrag: Number(parsed.bedrag),
        datum: parsed.datum,
        categorie: (parsed.categorie as FinanceCategorie) ?? 'Overig',
        type: parsed.type === 'abonnement' ? 'abonnement' : 'eenmalig',
        interval: parsed.interval,
        opzegtermijn_dagen: parsed.opzegtermijn_dagen,
        confidence: parsed.confidence ?? 0.5,
      };
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run tests — verwacht PASS**

```bash
cd /srv/platform/api && npm test -- --testPathPattern="finance-extractor.service.spec" --no-coverage 2>&1 | tail -10
```

Expected: `PASS` — 4 tests groen.

- [ ] **Step 5: Commit**

```bash
cd /srv/platform
git add api/src/finance/finance-extractor.service.ts api/src/finance/finance-extractor.service.spec.ts
git commit -m "feat(finance): add FinanceExtractorService with Ollama JSON extraction"
```

---

## Task 4: FinanceAlertService

**Files:**
- Create: `api/src/finance/finance-alert.service.ts`
- Create: `api/src/finance/finance-alert.service.spec.ts`

- [ ] **Step 1: Schrijf failing tests in `api/src/finance/finance-alert.service.spec.ts`**

```typescript
import { FinanceAlertService } from './finance-alert.service';
import { FinanceSubscription } from './finance.entity';

describe('FinanceAlertService', () => {
  describe('getUpcomingDeadlines()', () => {
    it('geeft subscriptions terug waarbij opzegtermijn binnen 14 dagen verstrijkt', () => {
      const today = new Date();
      const soon = new Date(today);
      soon.setDate(today.getDate() + 20); // betaaldatum over 20 dagen
      const deadline = new Date(soon);
      deadline.setDate(soon.getDate() - 30); // opzegtermijn = 30 dagen → deadline = soon - 30 = today - 10 → al verstreken... gebruik 10 dagen

      // opzegtermijn 30 dagen, betaaldatum over 20 dagen → deadline over -10 dagen (al verstreken) → alert
      const sub1 = {
        id: '1', naam: 'Netflix', bedrag: 15, interval: 'maandelijks',
        volgendeBetaaldatum: soon.toISOString().slice(0, 10),
        opzegtermijnDagen: 30, actief: true, owner: 'test',
      } as FinanceSubscription;

      // opzegtermijn 5 dagen, betaaldatum over 20 dagen → deadline over 15 dagen → geen alert
      const sub2 = {
        id: '2', naam: 'Spotify', bedrag: 10, interval: 'maandelijks',
        volgendeBetaaldatum: soon.toISOString().slice(0, 10),
        opzegtermijnDagen: 5, actief: true, owner: 'test',
      } as FinanceSubscription;

      const svc = new FinanceAlertService({} as never, {} as never);
      const result = (svc as unknown as {
        getUpcomingDeadlines: (subs: FinanceSubscription[]) => FinanceSubscription[]
      }).getUpcomingDeadlines([sub1, sub2]);

      expect(result.map(s => s.id)).toContain('1');
      expect(result.map(s => s.id)).not.toContain('2');
    });
  });
});
```

- [ ] **Step 2: Run tests — verwacht FAIL**

```bash
cd /srv/platform/api && npm test -- --testPathPattern="finance-alert.service.spec" --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Schrijf `api/src/finance/finance-alert.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceSubscription } from './finance.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { LdapService } from '../ldap/ldap.service';

@Injectable()
export class FinanceAlertService {
  private readonly logger = new Logger(FinanceAlertService.name);

  constructor(
    @InjectRepository(FinanceSubscription)
    private readonly repo: Repository<FinanceSubscription>,
    private readonly notifications: NotificationsService,
  ) {}

  async checkUser(owner: string, signalPhone?: string): Promise<string[]> {
    const subs = await this.repo.find({ where: { owner, actief: true } });
    const upcoming = this.getUpcomingDeadlines(subs);
    const messages: string[] = [];

    for (const sub of upcoming) {
      const deadlineDate = new Date(sub.volgendeBetaaldatum);
      deadlineDate.setDate(deadlineDate.getDate() - sub.opzegtermijnDagen);
      const daysLeft = Math.ceil((deadlineDate.getTime() - Date.now()) / 86_400_000);
      const msg = daysLeft <= 0
        ? `⚠️ Abonnement ${sub.naam} (€${sub.bedrag}/mnd) — opzegtermijn al verstreken!`
        : `⚠️ Abonnement ${sub.naam} (€${sub.bedrag}/mnd) — nog ${daysLeft} dag(en) om op te zeggen`;
      messages.push(msg);
      if (signalPhone) {
        await this.notifications.send(signalPhone, msg).catch(() => {});
      }
    }
    return messages;
  }

  private getUpcomingDeadlines(subs: FinanceSubscription[]): FinanceSubscription[] {
    const now = Date.now();
    return subs.filter(sub => {
      const betaaldatum = new Date(sub.volgendeBetaaldatum).getTime();
      const deadline = betaaldatum - sub.opzegtermijnDagen * 86_400_000;
      const daysUntilDeadline = Math.ceil((deadline - now) / 86_400_000);
      return daysUntilDeadline <= 14;
    });
  }
}
```

- [ ] **Step 4: Run tests — verwacht PASS**

```bash
cd /srv/platform/api && npm test -- --testPathPattern="finance-alert.service.spec" --no-coverage 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
cd /srv/platform
git add api/src/finance/finance-alert.service.ts api/src/finance/finance-alert.service.spec.ts
git commit -m "feat(finance): add FinanceAlertService with subscription deadline detection"
```

---

## Task 5: FinanceMailPollerService

**Files:**
- Create: `api/src/finance/finance-mail-poller.service.ts`
- Create: `api/src/finance/finance-mail-poller.service.spec.ts`

- [ ] **Step 1: Schrijf failing tests in `api/src/finance/finance-mail-poller.service.spec.ts`**

```typescript
import { FinanceMailPollerService } from './finance-mail-poller.service';

describe('FinanceMailPollerService', () => {
  let service: FinanceMailPollerService;

  beforeEach(() => {
    service = new FinanceMailPollerService({} as never, {} as never, {} as never, {} as never);
  });

  describe('isFinancialMail()', () => {
    const check = (subject: string, hasAttachment: boolean) =>
      (service as unknown as { isFinancialMail: (s: string, h: boolean) => boolean })
        .isFinancialMail(subject, hasAttachment);

    it('herkent factuur in onderwerp', () => {
      expect(check('Uw factuur van Ziggo', false)).toBe(true);
    });

    it('herkent rekening in onderwerp', () => {
      expect(check('Rekening november 2026', false)).toBe(true);
    });

    it('herkent abonnement in onderwerp', () => {
      expect(check('Uw abonnement wordt verlengd', false)).toBe(true);
    });

    it('herkent PDF bijlage als financieel signaal', () => {
      expect(check('Nieuwsbrief', true)).toBe(true);
    });

    it('negeert gewone mails zonder bijlage', () => {
      expect(check('Hoe gaat het?', false)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests — verwacht FAIL**

```bash
cd /srv/platform/api && npm test -- --testPathPattern="finance-mail-poller.service.spec" --no-coverage 2>&1 | tail -10
```

- [ ] **Step 3: Schrijf `api/src/finance/finance-mail-poller.service.ts`**

```typescript
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { FinanceTransaction } from './finance.entity';
import { FinanceExtractorService } from './finance-extractor.service';
import { MailImapService } from '../mail/mail-imap.service';
import { LdapService } from '../ldap/ldap.service';

const FINANCE_KEYWORDS = ['factuur', 'rekening', 'abonnement', 'betaling', 'invoice', 'payment', 'subscription'];

@Injectable()
export class FinanceMailPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FinanceMailPollerService.name);
  private interval: NodeJS.Timeout | null = null;
  private readonly authentikUrl: string;
  private readonly authentikToken: string;

  constructor(
    @InjectRepository(FinanceTransaction)
    private readonly repo: Repository<FinanceTransaction>,
    private readonly extractor: FinanceExtractorService,
    private readonly mail: MailImapService,
    private readonly config: ConfigService,
  ) {
    this.authentikUrl = config.get('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
    this.authentikToken = config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
  }

  onModuleInit() {
    // Eerste scan na 2 minuten, daarna elke 15 minuten
    setTimeout(() => {
      void this.scanAllUsers();
      this.interval = setInterval(() => void this.scanAllUsers(), 15 * 60 * 1000);
    }, 2 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  private async scanAllUsers(): Promise<void> {
    try {
      const { data } = await require('axios').default.get(
        `${this.authentikUrl}/api/v3/core/users/?is_active=true&page_size=50`,
        { headers: { Authorization: `Bearer ${this.authentikToken}` } },
      );
      const users: Array<{ username: string; attributes?: Record<string, string> }> = data.results ?? [];
      for (const user of users) {
        if (user.attributes?.signalPhone) {
          await this.scanUser(user.username, user.attributes).catch(() => {});
        }
      }
    } catch (err) {
      this.logger.warn(`Finance mail scan mislukt: ${(err as Error).message}`);
    }
  }

  async scanUser(username: string, attrs: Record<string, string>): Promise<void> {
    const imap = this.mail.buildImapConfig(username, attrs);
    if (!imap) return;

    try {
      const messages = await this.mail.listMessages(imap, 'INBOX', 1, 50);
      for (const msg of messages.messages ?? []) {
        if (!this.isFinancialMail(msg.subject, msg.hasAttachment)) continue;

        // Controleer of al verwerkt
        const exists = await this.repo.findOne({
          where: { owner: username, source: 'mail', sourceRef: String(msg.uid) },
        });
        if (exists) continue;

        // Haal body op
        const detail = await this.mail.getMessage(imap, 'INBOX', msg.uid).catch(() => null);
        if (!detail) continue;

        const text = detail.bodyText || detail.bodyHtml?.replace(/<[^>]+>/g, ' ') || msg.subject;
        const extracted = await this.extractor.extract(text);
        if (!extracted || extracted.confidence < 0.5) continue;

        await this.repo.save({
          owner: username,
          source: 'mail',
          sourceRef: String(msg.uid),
          leverancier: extracted.leverancier,
          bedrag: extracted.bedrag,
          datum: extracted.datum,
          categorie: extracted.categorie,
          type: extracted.type,
          status: 'pending',
        });
        this.logger.log(`Finance: mail transactie toegevoegd voor ${username} — ${extracted.leverancier}`);
      }
    } catch (err) {
      this.logger.warn(`Finance mail scan ${username} mislukt: ${(err as Error).message}`);
    }
  }

  private isFinancialMail(subject: string, hasAttachment: boolean): boolean {
    const lower = subject.toLowerCase();
    return hasAttachment || FINANCE_KEYWORDS.some(kw => lower.includes(kw));
  }
}
```

- [ ] **Step 4: Run tests — verwacht PASS**

```bash
cd /srv/platform/api && npm test -- --testPathPattern="finance-mail-poller.service.spec" --no-coverage 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
cd /srv/platform
git add api/src/finance/finance-mail-poller.service.ts api/src/finance/finance-mail-poller.service.spec.ts
git commit -m "feat(finance): add FinanceMailPollerService with keyword + attachment detection"
```

---

## Task 6: FinanceService (CRUD)

**Files:**
- Create: `api/src/finance/finance.service.ts`

- [ ] **Step 1: Schrijf `api/src/finance/finance.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { FinanceTransaction, FinanceSubscription } from './finance.entity';
import {
  CreateTransactionDto, UpdateTransactionDto,
  CreateSubscriptionDto, UpdateSubscriptionDto, FinanceSummaryDto,
} from './finance.dto';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(FinanceTransaction)
    private readonly txRepo: Repository<FinanceTransaction>,
    @InjectRepository(FinanceSubscription)
    private readonly subRepo: Repository<FinanceSubscription>,
  ) {}

  async getSummary(owner: string): Promise<FinanceSummaryDto> {
    // Laatste 6 maanden
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const txs = await this.txRepo.find({
      where: { owner, status: 'approved' },
    });

    // Groepeer per maand
    const maandMap = new Map<string, { totaal: number; perCategorie: Record<string, number> }>();
    for (const tx of txs) {
      const maand = tx.datum.slice(0, 7); // YYYY-MM
      if (!maandMap.has(maand)) maandMap.set(maand, { totaal: 0, perCategorie: {} });
      const entry = maandMap.get(maand)!;
      entry.totaal += Number(tx.bedrag);
      entry.perCategorie[tx.categorie] = (entry.perCategorie[tx.categorie] ?? 0) + Number(tx.bedrag);
    }

    const maandTotalen = Array.from(maandMap.entries())
      .map(([maand, data]) => ({ maand, ...data }))
      .sort((a, b) => a.maand.localeCompare(b.maand))
      .slice(-6);

    const subs = await this.subRepo.find({ where: { owner, actief: true } });
    const abonnementenMaandlast = subs.reduce((sum, s) => {
      const factor = s.interval === 'jaarlijks' ? 1/12 : s.interval === 'kwartaal' ? 1/3 : 1;
      return sum + Number(s.bedrag) * factor;
    }, 0);

    const pendingCount = await this.txRepo.count({ where: { owner, status: 'pending' } });

    return {
      maandTotalen,
      abonnementenMaandlast: Math.round(abonnementenMaandlast * 100) / 100,
      actieveAbonnementen: subs.length,
      pendingCount,
    };
  }

  async getTransactions(owner: string, status?: string, categorie?: string) {
    const where: Record<string, unknown> = { owner };
    if (status) where['status'] = status;
    if (categorie) where['categorie'] = categorie;
    return this.txRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async createTransaction(owner: string, dto: CreateTransactionDto) {
    return this.txRepo.save({ ...dto, owner, source: 'manual', status: 'approved' });
  }

  async updateTransaction(owner: string, id: string, dto: UpdateTransactionDto) {
    const tx = await this.txRepo.findOne({ where: { owner, id } });
    if (!tx) return null;
    // Als abonnement goedgekeurd, maak automatisch subscription aan
    if (dto.status === 'approved' && tx.type === 'abonnement') {
      const exists = await this.subRepo.findOne({ where: { owner, transactionId: id } });
      if (!exists) {
        await this.subRepo.save({
          owner,
          transactionId: id,
          naam: dto.leverancier ?? tx.leverancier,
          bedrag: dto.bedrag ?? tx.bedrag,
          interval: 'maandelijks',
          volgendeBetaaldatum: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          opzegtermijnDagen: 30,
          actief: true,
        });
      }
    }
    await this.txRepo.update({ id, owner }, dto);
    return this.txRepo.findOne({ where: { id, owner } });
  }

  async deleteTransaction(owner: string, id: string) {
    return this.txRepo.delete({ id, owner });
  }

  async getSubscriptions(owner: string) {
    return this.subRepo.find({ where: { owner }, order: { volgendeBetaaldatum: 'ASC' } });
  }

  async createSubscription(owner: string, dto: CreateSubscriptionDto) {
    return this.subRepo.save({ ...dto, owner, actief: true });
  }

  async updateSubscription(owner: string, id: string, dto: UpdateSubscriptionDto) {
    await this.subRepo.update({ id, owner }, dto);
    return this.subRepo.findOne({ where: { id, owner } });
  }

  async deleteSubscription(owner: string, id: string) {
    return this.subRepo.delete({ id, owner });
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add api/src/finance/finance.service.ts
git commit -m "feat(finance): add FinanceService CRUD for transactions and subscriptions"
```

---

## Task 7: FinanceModule + wire in app

**Files:**
- Create: `api/src/finance/finance.module.ts`
- Modify: `api/src/app.module.ts`
- Modify: `api/src/users-me/users-me.module.ts`
- Modify: `api/src/users-me/users-me.controller.ts`
- Modify: `api/src/users-me/users-me.service.ts`

- [ ] **Step 1: Schrijf `api/src/finance/finance.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceTransaction, FinanceSubscription } from './finance.entity';
import { FinanceService } from './finance.service';
import { FinanceExtractorService } from './finance-extractor.service';
import { FinanceAlertService } from './finance-alert.service';
import { FinanceMailPollerService } from './finance-mail-poller.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FinanceTransaction, FinanceSubscription]),
    NotificationsModule,
    MailModule,
  ],
  providers: [FinanceService, FinanceExtractorService, FinanceAlertService, FinanceMailPollerService],
  exports: [FinanceService, FinanceAlertService],
})
export class FinanceModule {}
```

- [ ] **Step 2: Importeer FinanceModule in `api/src/app.module.ts`**

Voeg toe aan de `imports` array in `AppModule`:
```typescript
import { FinanceModule } from './finance/finance.module';
// In imports: [...bestaande, FinanceModule]
```

- [ ] **Step 3: Importeer FinanceModule in `api/src/users-me/users-me.module.ts`**

```typescript
import { FinanceModule } from '../finance/finance.module';
// In imports: [...bestaande, FinanceModule]
```

- [ ] **Step 4: Voeg finance endpoints toe aan `api/src/users-me/users-me.controller.ts`**

Voeg bovenaan de imports toe:
```typescript
import { FinanceService } from '../finance/finance.service';
import { CreateTransactionDto, UpdateTransactionDto, CreateSubscriptionDto, UpdateSubscriptionDto } from '../finance/finance.dto';
```

Voeg `FinanceService` toe aan constructor:
```typescript
constructor(
  // ... bestaande services
  private readonly financeService: FinanceService,
) {}
```

Voeg na de bestaande endpoints toe (voor de sluitende `}` van de class):
```typescript
  // ── Finance ──────────────────────────────────────────────────────────────
  @Get('finance/summary')
  @UseGuards(InternalSecretGuard)
  getFinanceSummary(@Headers('x-authentik-username') owner: string) {
    return this.financeService.getSummary(owner);
  }

  @Get('finance/transactions')
  @UseGuards(InternalSecretGuard)
  getTransactions(
    @Headers('x-authentik-username') owner: string,
    @Query('status') status?: string,
    @Query('categorie') categorie?: string,
  ) {
    return this.financeService.getTransactions(owner, status, categorie);
  }

  @Post('finance/transactions')
  @UseGuards(InternalSecretGuard)
  createTransaction(@Headers('x-authentik-username') owner: string, @Body() dto: CreateTransactionDto) {
    return this.financeService.createTransaction(owner, dto);
  }

  @Patch('finance/transactions/:id')
  @UseGuards(InternalSecretGuard)
  updateTransaction(@Headers('x-authentik-username') owner: string, @Param('id') id: string, @Body() dto: UpdateTransactionDto) {
    return this.financeService.updateTransaction(owner, id, dto);
  }

  @Delete('finance/transactions/:id')
  @UseGuards(InternalSecretGuard)
  deleteTransaction(@Headers('x-authentik-username') owner: string, @Param('id') id: string) {
    return this.financeService.deleteTransaction(owner, id);
  }

  @Get('finance/subscriptions')
  @UseGuards(InternalSecretGuard)
  getSubscriptions(@Headers('x-authentik-username') owner: string) {
    return this.financeService.getSubscriptions(owner);
  }

  @Post('finance/subscriptions')
  @UseGuards(InternalSecretGuard)
  createSubscription(@Headers('x-authentik-username') owner: string, @Body() dto: CreateSubscriptionDto) {
    return this.financeService.createSubscription(owner, dto);
  }

  @Patch('finance/subscriptions/:id')
  @UseGuards(InternalSecretGuard)
  updateSubscription(@Headers('x-authentik-username') owner: string, @Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.financeService.updateSubscription(owner, id, dto);
  }

  @Delete('finance/subscriptions/:id')
  @UseGuards(InternalSecretGuard)
  deleteSubscription(@Headers('x-authentik-username') owner: string, @Param('id') id: string) {
    return this.financeService.deleteSubscription(owner, id);
  }
```

- [ ] **Step 5: Controleer of `@Query` en `@Param` al geïmporteerd zijn in users-me.controller.ts**

```bash
grep "Query\|Param" /srv/platform/api/src/users-me/users-me.controller.ts | head -5
```

Als niet aanwezig, voeg toe aan de `@nestjs/common` import.

- [ ] **Step 6: Build checken**

```bash
cd /srv/platform/api && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: geen errors.

- [ ] **Step 7: Commit**

```bash
cd /srv/platform
git add api/src/finance/ api/src/app.module.ts api/src/users-me/
git commit -m "feat(finance): wire FinanceModule into app — 9 REST endpoints under /me/finance/"
```

---

## Task 8: Proactive integratie (Diggi finance-alerts)

**Files:**
- Modify: `api/src/proactive/proactive.module.ts`
- Modify: `api/src/proactive/proactive.service.ts`

- [ ] **Step 1: Importeer FinanceModule in `api/src/proactive/proactive.module.ts`**

```typescript
import { FinanceModule } from '../finance/finance.module';
// In imports: [...bestaande, FinanceModule]
```

- [ ] **Step 2: Inject FinanceAlertService in `api/src/proactive/proactive.service.ts`**

Voeg import toe:
```typescript
import { FinanceAlertService } from '../finance/finance-alert.service';
```

Voeg toe aan constructor (na de bestaande services):
```typescript
private readonly financeAlert: FinanceAlertService,
```

- [ ] **Step 3: Roep finance check aan in `scanUser()`**

Zoek de `scanUser(username, attrs)` methode in `proactive.service.ts`. Voeg ná de bestaande hint-logica en vóór de return toe:

```typescript
    // Finance: abonnement opzegtermijn-alerts
    try {
      const alerts = await this.financeAlert.checkUser(username, attrs['signalPhone']);
      for (const msg of alerts) {
        // Sla op als ProactiveHint zodat ze ook in de portal verschijnen
        await this.repo.save({
          owner: username,
          title: msg,
          date: new Date().toISOString().slice(0, 10),
          type: 'deadline',
        });
      }
    } catch {
      // non-fatal
    }
```

- [ ] **Step 4: Build checken**

```bash
cd /srv/platform/api && npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 5: Commit**

```bash
cd /srv/platform
git add api/src/proactive/
git commit -m "feat(finance): wire finance subscription alerts into Diggi proactive scan"
```

---

## Task 9: Next.js proxy route

**Files:**
- Create: `portal/app/api/me/finance/[...path]/route.ts`

- [ ] **Step 1: Schrijf `portal/app/api/me/finance/[...path]/route.ts`**

Kijk eerst naar een bestaande proxy als voorbeeld:
```bash
cat /srv/platform/portal/app/api/me/preferences/route.ts
```

Schrijf daarna de finance proxy op dezelfde manier:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API = process.env.INTERNAL_API_URL ?? 'http://api:3001';
const SECRET = process.env.INTERNAL_API_SECRET ?? '';

async function proxy(req: NextRequest, path: string): Promise<NextResponse> {
  const url = `${API}/me/finance/${path}${req.nextUrl.search}`;
  const uid = req.headers.get('x-authentik-uid') ?? '';
  const username = req.headers.get('x-authentik-username') ?? '';

  const headers: Record<string, string> = {
    'x-internal-secret': SECRET,
    'x-authentik-uid': uid,
    'x-authentik-username': username,
  };

  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    headers['content-type'] = 'application/json';
    body = await req.text();
  }

  const res = await fetch(url, { method: req.method, headers, body });
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path.join('/'));
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path.join('/'));
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path.join('/'));
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path.join('/'));
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/api/me/finance/
git commit -m "feat(portal): add /api/me/finance proxy route"
```

---

## Task 10: Finance vertalingen in lang.ts

**Files:**
- Modify: `portal/app/dashboard/lang.ts`

- [ ] **Step 1: Voeg finance vertalingen toe aan `nl`, `de` en `en` objecten**

In `nl` object, voeg na het laatste bestaande key toe:
```typescript
  // Finance
  financeTitle: 'Financiën',
  financeThisMonth: 'Uitgaven deze maand',
  financeSubscriptions: 'Abonnementen',
  financeMonthlyTotal: 'Maandlast',
  financePending: 'Te controleren',
  financeApprove: 'Goedkeuren',
  financeReject: 'Afwijzen',
  financeAddTransaction: 'Transactie toevoegen',
  financeAddSubscription: 'Abonnement toevoegen',
  financeNoTransactions: 'Geen transacties',
  financeNoSubscriptions: 'Geen abonnementen',
  financeAlertDeadline: 'Opzegtermijn nadert',
  financeSave: 'Opslaan',
  financeCancel: 'Annuleren',
  financeCategories: 'Categorieën',
  financeAll: 'Alle',
  financePendingTab: 'Te controleren',
  financeSubscriptionsTab: 'Abonnementen',
```

In `de` object:
```typescript
  financeTitle: 'Finanzen',
  financeThisMonth: 'Ausgaben diesen Monat',
  financeSubscriptions: 'Abonnements',
  financeMonthlyTotal: 'Monatliche Last',
  financePending: 'Zu prüfen',
  financeApprove: 'Genehmigen',
  financeReject: 'Ablehnen',
  financeAddTransaction: 'Transaktion hinzufügen',
  financeAddSubscription: 'Abonnement hinzufügen',
  financeNoTransactions: 'Keine Transaktionen',
  financeNoSubscriptions: 'Keine Abonnements',
  financeAlertDeadline: 'Kündigungsfrist naht',
  financeSave: 'Speichern',
  financeCancel: 'Abbrechen',
  financeCategories: 'Kategorien',
  financeAll: 'Alle',
  financePendingTab: 'Zu prüfen',
  financeSubscriptionsTab: 'Abonnements',
```

In `en` object:
```typescript
  financeTitle: 'Finance',
  financeThisMonth: 'Expenses this month',
  financeSubscriptions: 'Subscriptions',
  financeMonthlyTotal: 'Monthly total',
  financePending: 'To review',
  financeApprove: 'Approve',
  financeReject: 'Reject',
  financeAddTransaction: 'Add transaction',
  financeAddSubscription: 'Add subscription',
  financeNoTransactions: 'No transactions',
  financeNoSubscriptions: 'No subscriptions',
  financeAlertDeadline: 'Cancellation deadline approaching',
  financeSave: 'Save',
  financeCancel: 'Cancel',
  financeCategories: 'Categories',
  financeAll: 'All',
  financePendingTab: 'To review',
  financeSubscriptionsTab: 'Subscriptions',
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/lang.ts
git commit -m "feat(portal): add finance translations to lang.ts"
```

---

## Task 11: FinanceOverview component

**Files:**
- Create: `portal/app/dashboard/finance/FinanceOverview.tsx`

- [ ] **Step 1: Schrijf `portal/app/dashboard/finance/FinanceOverview.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Euro, CreditCard, Clock, RefreshCw, AlertCircle, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { useT } from '../LangContext';
import { useApiRequest } from '@/hooks/use-api-request';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface MaandTotaal {
  maand: string;
  totaal: number;
  perCategorie: Record<string, number>;
}

interface Summary {
  maandTotalen: MaandTotaal[];
  abonnementenMaandlast: number;
  actieveAbonnementen: number;
  pendingCount: number;
}

interface Transaction {
  id: string;
  leverancier: string;
  bedrag: number;
  datum: string;
  categorie: string;
  source: string;
  status: string;
}

const CATEGORIE_KLEUREN: Record<string, string> = {
  Wonen: 'bg-blue-500',
  Boodschappen: 'bg-green-500',
  Abonnementen: 'bg-purple-500',
  Verzekeringen: 'bg-orange-500',
  Transport: 'bg-yellow-500',
  Gezondheid: 'bg-red-500',
  Overig: 'bg-slate-500',
};

const SOURCE_LABEL: Record<string, string> = {
  paperless: '📄',
  mail: '✉️',
  manual: '✏️',
};

export default function FinanceOverview({ onTabChange }: { onTabChange?: (tab: string) => void }) {
  const t = useT();
  const { request } = useApiRequest();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      request<Summary>('/api/me/finance/summary').catch(() => null),
      request<Transaction[]>('/api/me/finance/transactions?status=approved').catch(() => []),
    ]).then(([sum, txs]) => {
      setSummary(sum);
      setRecentTx((txs ?? []).slice(0, 5));
    }).catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const thisMonthTotal = summary?.maandTotalen.find(m => m.maand === thisMonth)?.totaal ?? 0;
  const maxTotal = Math.max(...(summary?.maandTotalen.map(m => m.totaal) ?? [1]));

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <AlertCircle size={36} className="text-red-400 opacity-60" />
        <p className="text-sm text-slate-400">{t.errorLoading}</p>
        <Button onClick={load} variant="secondary" size="sm">
          <RefreshCw size={14} />{t.errorRetry}
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <div className="text-xl font-bold text-emerald-400">
              {loading ? '—' : `€${thisMonthTotal.toFixed(0)}`}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{t.financeThisMonth}</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xl font-bold text-purple-400">
              {loading ? '—' : `€${(summary?.abonnementenMaandlast ?? 0).toFixed(0)}`}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{t.financeMonthlyTotal}</div>
          </Card>
          <button onClick={() => onTabChange?.('pending')} className="focus:outline-none">
            <Card className="p-3 text-center cursor-pointer hover:bg-slate-700/80 transition">
              <div className="text-xl font-bold text-amber-400">
                {loading ? '—' : (summary?.pendingCount ?? 0)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{t.financePending}</div>
            </Card>
          </button>
        </div>

        {/* Staafgrafiek — CSS-only */}
        {!loading && summary && summary.maandTotalen.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Uitgaven per maand
            </h3>
            <div className="flex items-end gap-2 h-28">
              {summary.maandTotalen.map(m => {
                const height = maxTotal > 0 ? Math.max(4, (m.totaal / maxTotal) * 100) : 4;
                const isCurrentMonth = m.maand === thisMonth;
                const maandLabel = new Date(m.maand + '-01').toLocaleDateString('nl-NL', { month: 'short' });
                return (
                  <div key={m.maand} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] text-slate-500">€{Math.round(m.totaal)}</span>
                    <div
                      className={`w-full rounded-t-lg transition-all ${isCurrentMonth ? 'bg-emerald-500' : 'bg-slate-700'}`}
                      style={{ height: `${height}%` }}
                    />
                    <span className={`text-[9px] ${isCurrentMonth ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {maandLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recente transacties */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Recente transacties
            </h3>
            <button
              onClick={() => onTabChange?.('all')}
              className="text-xs text-cyan-500 hover:text-cyan-400"
            >
              Alle
            </button>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-slate-800 rounded-2xl p-3 animate-pulse">
                  <div className="h-3 bg-slate-700 rounded w-2/3 mb-1.5" />
                  <div className="h-2.5 bg-slate-700/50 rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : recentTx.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-slate-600 gap-2">
              <TrendingDown size={32} className="opacity-30" />
              <p className="text-sm">{t.financeNoTransactions}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTx.map(tx => (
                <div key={tx.id} className="bg-slate-800 rounded-2xl p-3 flex items-center gap-3">
                  <span className="text-base shrink-0">{SOURCE_LABEL[tx.source] ?? '💶'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{tx.leverancier}</p>
                    <p className="text-xs text-slate-500">{tx.datum}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-200">€{Number(tx.bedrag).toFixed(2)}</p>
                    <span className={`inline-block w-2 h-2 rounded-full ${CATEGORIE_KLEUREN[tx.categorie] ?? 'bg-slate-500'}`} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/finance/FinanceOverview.tsx
git commit -m "feat(portal): add FinanceOverview with stat tiles and CSS bar chart"
```

---

## Task 12: FinanceTransactions component

**Files:**
- Create: `portal/app/dashboard/finance/FinanceTransactions.tsx`

- [ ] **Step 1: Schrijf `portal/app/dashboard/finance/FinanceTransactions.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, Plus, Check, X, Pencil } from 'lucide-react';
import { useT } from '../LangContext';
import { useApiRequest } from '@/hooks/use-api-request';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FINANCE_CATEGORIEEN, type FinanceCategorie } from '@/../api/src/finance/finance.entity';

// Lokale type definitie (niet importeren van server-side entity in productie)
const CATEGORIEEN: FinanceCategorie[] = [
  'Wonen', 'Boodschappen', 'Abonnementen', 'Verzekeringen', 'Transport', 'Gezondheid', 'Overig',
];

interface Transaction {
  id: string;
  leverancier: string;
  bedrag: number;
  datum: string;
  categorie: string;
  source: string;
  status: string;
  type: string;
  notes?: string;
}

const SOURCE_LABEL: Record<string, string> = { paperless: '📄', mail: '✉️', manual: '✏️' };
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  approved: 'success', pending: 'warning', rejected: 'error',
};

interface AddForm {
  leverancier: string;
  bedrag: string;
  datum: string;
  categorie: FinanceCategorie;
  type: 'eenmalig' | 'abonnement';
  notes: string;
}

const EMPTY_FORM: AddForm = {
  leverancier: '', bedrag: '', datum: new Date().toISOString().slice(0, 10),
  categorie: 'Overig', type: 'eenmalig', notes: '',
};

export default function FinanceTransactions({ initialTab = 'all' }: { initialTab?: string }) {
  const t = useT();
  const { request } = useApiRequest();
  const [tab, setTab] = useState<'all' | 'pending' | 'subscriptions'>(
    initialTab === 'pending' ? 'pending' : 'all'
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    const statusParam = tab === 'pending' ? '?status=pending' : tab === 'subscriptions' ? '' : '';
    const url = tab === 'subscriptions'
      ? '/api/me/finance/transactions?type=abonnement'
      : `/api/me/finance/transactions${statusParam}`;
    request<Transaction[]>(url)
      .then(data => setTransactions(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [request, tab]);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: string) => {
    await fetch(`/api/me/finance/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    load();
  };

  const reject = async (id: string) => {
    await fetch(`/api/me/finance/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    load();
  };

  const addTransaction = async () => {
    if (!form.leverancier || !form.bedrag || !form.datum) return;
    setSaving(true);
    await fetch('/api/me/finance/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, bedrag: parseFloat(form.bedrag) }),
    });
    setSaving(false);
    setShowAdd(false);
    setForm(EMPTY_FORM);
    load();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Tabs */}
        <div className="flex bg-slate-800 rounded-2xl p-1 gap-1">
          {(['all', 'pending', 'subscriptions'] as const).map(t2 => (
            <button
              key={t2}
              onClick={() => setTab(t2)}
              className={`flex-1 py-2 text-xs font-medium rounded-xl transition ${
                tab === t2 ? 'bg-slate-700 text-cyan-400' : 'text-slate-500'
              }`}
            >
              {t2 === 'all' ? t.financeAll : t2 === 'pending' ? t.financePendingTab : t.financeSubscriptionsTab}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-800 rounded-2xl p-4 animate-pulse">
                <div className="h-3 bg-slate-700 rounded w-2/3 mb-2" />
                <div className="h-2.5 bg-slate-700/50 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center py-12 gap-3 text-slate-600">
            <AlertCircle size={32} className="opacity-40" />
            <p className="text-sm">{t.errorServiceUnavailable}</p>
            <Button onClick={load} variant="secondary" size="sm">
              <RefreshCw size={14} />{t.errorRetry}
            </Button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-600">
            <p className="text-sm">{t.financeNoTransactions}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => (
              <Card key={tx.id} className="p-3">
                <div className="flex items-center gap-3">
                  <span className="text-base shrink-0">{SOURCE_LABEL[tx.source] ?? '💶'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{tx.leverancier}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500">{tx.datum}</span>
                      <Badge variant="default" className="text-[9px] px-1.5 py-0">{tx.categorie}</Badge>
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-sm font-semibold text-slate-200">€{Number(tx.bedrag).toFixed(2)}</p>
                    <Badge variant={STATUS_VARIANT[tx.status] ?? 'default'} className="text-[9px]">
                      {tx.status}
                    </Badge>
                  </div>
                  {tx.status === 'pending' && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => void approve(tx.id)}
                        className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-lg transition"
                        title={t.financeApprove}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => void reject(tx.id)}
                        className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition"
                        title={t.financeReject}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Handmatige invoer formulier */}
        {showAdd && (
          <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">{t.financeAddTransaction}</h3>
            <input
              className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-cyan-500"
              placeholder="Leverancier"
              value={form.leverancier}
              onChange={e => setForm(f => ({ ...f, leverancier: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.01"
                className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                placeholder="Bedrag €"
                value={form.bedrag}
                onChange={e => setForm(f => ({ ...f, bedrag: e.target.value }))}
              />
              <input
                type="date"
                className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                value={form.datum}
                onChange={e => setForm(f => ({ ...f, datum: e.target.value }))}
              />
            </div>
            <select
              className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
              value={form.categorie}
              onChange={e => setForm(f => ({ ...f, categorie: e.target.value as FinanceCategorie }))}
            >
              {CATEGORIEEN.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex gap-2">
              <Button onClick={() => void addTransaction()} variant="primary" size="md" disabled={saving} className="flex-1">
                {saving ? t.saving : t.financeSave}
              </Button>
              <Button onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }} variant="ghost" size="md">
                {t.financeCancel}
              </Button>
            </div>
          </div>
        )}

        {/* Floating + knop */}
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="fixed bottom-20 right-4 w-12 h-12 bg-emerald-500 hover:bg-emerald-400 text-white rounded-full shadow-lg flex items-center justify-center transition active:scale-95 z-10"
            aria-label={t.financeAddTransaction}
          >
            <Plus size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
```

**Note:** De import `from '@/../api/src/finance/finance.entity'` werkt niet in productie-builds — vervang de `FINANCE_CATEGORIEEN` import door de lokale `CATEGORIEEN` constante die al in het bestand staat. Verwijder die import-regel.

- [ ] **Step 2: Fix de entity import**

In `FinanceTransactions.tsx`, verwijder de regel:
```typescript
import { FINANCE_CATEGORIEEN, type FinanceCategorie } from '@/../api/src/finance/finance.entity';
```

De `CATEGORIEEN` constante en het `FinanceCategorie` type zijn al lokaal gedefinieerd in het bestand.

- [ ] **Step 3: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/finance/FinanceTransactions.tsx
git commit -m "feat(portal): add FinanceTransactions with review queue and manual entry"
```

---

## Task 13: FinanceSubscriptions component

**Files:**
- Create: `portal/app/dashboard/finance/FinanceSubscriptions.tsx`

- [ ] **Step 1: Schrijf `portal/app/dashboard/finance/FinanceSubscriptions.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, Plus, CreditCard } from 'lucide-react';
import { useT } from '../LangContext';
import { useApiRequest } from '@/hooks/use-api-request';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Subscription {
  id: string;
  naam: string;
  bedrag: number;
  interval: string;
  volgendeBetaaldatum: string;
  opzegtermijnDagen: number;
  actief: boolean;
}

function deadlineDays(sub: Subscription): number {
  const betaal = new Date(sub.volgendeBetaaldatum).getTime();
  const deadline = betaal - sub.opzegtermijnDagen * 86_400_000;
  return Math.ceil((deadline - Date.now()) / 86_400_000);
}

function urgencyVariant(days: number): 'error' | 'warning' | 'success' {
  if (days <= 0) return 'error';
  if (days <= 7) return 'warning';
  return 'success';
}

const INTERVAL_LABEL: Record<string, string> = {
  maandelijks: '/mnd', kwartaal: '/kwt', jaarlijks: '/jr',
};

const EMPTY_FORM = { naam: '', bedrag: '', interval: 'maandelijks', volgendeBetaaldatum: '', opzegtermijnDagen: '30' };

export default function FinanceSubscriptions() {
  const t = useT();
  const { request } = useApiRequest();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    request<Subscription[]>('/api/me/finance/subscriptions')
      .then(data => setSubs(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.naam || !form.bedrag || !form.volgendeBetaaldatum) return;
    setSaving(true);
    await fetch('/api/me/finance/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, bedrag: parseFloat(form.bedrag), opzegtermijnDagen: parseInt(form.opzegtermijnDagen) }),
    });
    setSaving(false);
    setShowAdd(false);
    setForm(EMPTY_FORM);
    load();
  };

  const toggle = async (sub: Subscription) => {
    await fetch(`/api/me/finance/subscriptions/${sub.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actief: !sub.actief }),
    });
    load();
  };

  const activeSubs = subs.filter(s => s.actief);
  const alerts = activeSubs.filter(s => deadlineDays(s) <= 14);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Alert banner */}
        {alerts.length > 0 && (
          <div className="bg-red-950/40 border border-red-800/40 rounded-2xl px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-red-300 flex items-center gap-2">
              <AlertCircle size={14} />
              {t.financeAlertDeadline}
            </p>
            {alerts.map(s => {
              const days = deadlineDays(s);
              return (
                <p key={s.id} className="text-xs text-red-400 pl-5">
                  {s.naam} — {days <= 0 ? 'opzegtermijn verstreken' : `nog ${days} dag(en)`}
                </p>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-800 rounded-2xl p-4 animate-pulse">
                <div className="h-3 bg-slate-700 rounded w-1/2 mb-2" />
                <div className="h-2.5 bg-slate-700/50 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center py-12 gap-3 text-slate-600">
            <AlertCircle size={32} className="opacity-40" />
            <Button onClick={load} variant="secondary" size="sm">
              <RefreshCw size={14} />{t.errorRetry}
            </Button>
          </div>
        ) : subs.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-600 gap-2">
            <CreditCard size={36} className="opacity-30" />
            <p className="text-sm">{t.financeNoSubscriptions}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {subs.map(sub => {
              const days = sub.actief ? deadlineDays(sub) : null;
              return (
                <Card key={sub.id} className={`p-4 ${!sub.actief ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
                      <CreditCard size={16} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100">{sub.naam}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Volgende betaling: {sub.volgendeBetaaldatum}
                      </p>
                      {sub.actief && days !== null && (
                        <Badge variant={urgencyVariant(days)} className="mt-1 text-[9px]">
                          {days <= 0 ? 'Opzegtermijn verstreken' : `Opzeggen binnen ${days}d`}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-purple-400">
                        €{Number(sub.bedrag).toFixed(2)}{INTERVAL_LABEL[sub.interval] ?? ''}
                      </p>
                      <button
                        onClick={() => void toggle(sub)}
                        className={`text-[10px] mt-1 transition ${sub.actief ? 'text-slate-500 hover:text-red-400' : 'text-slate-600 hover:text-green-400'}`}
                      >
                        {sub.actief ? 'Deactiveer' : 'Activeer'}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Formulier */}
        {showAdd && (
          <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">{t.financeAddSubscription}</h3>
            <input
              className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-cyan-500"
              placeholder="Naam (bijv. Netflix)"
              value={form.naam}
              onChange={e => setForm(f => ({ ...f, naam: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number" step="0.01"
                className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                placeholder="Bedrag €"
                value={form.bedrag}
                onChange={e => setForm(f => ({ ...f, bedrag: e.target.value }))}
              />
              <select
                className="bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                value={form.interval}
                onChange={e => setForm(f => ({ ...f, interval: e.target.value }))}
              >
                <option value="maandelijks">Maandelijks</option>
                <option value="kwartaal">Per kwartaal</option>
                <option value="jaarlijks">Jaarlijks</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Volgende betaaldatum</label>
                <input
                  type="date"
                  className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                  value={form.volgendeBetaaldatum}
                  onChange={e => setForm(f => ({ ...f, volgendeBetaaldatum: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Opzegtermijn (dagen)</label>
                <input
                  type="number"
                  className="w-full bg-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                  value={form.opzegtermijnDagen}
                  onChange={e => setForm(f => ({ ...f, opzegtermijnDagen: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void add()} variant="primary" size="md" disabled={saving} className="flex-1">
                {saving ? t.saving : t.financeSave}
              </Button>
              <Button onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }} variant="ghost" size="md">
                {t.financeCancel}
              </Button>
            </div>
          </div>
        )}

        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="fixed bottom-20 right-4 w-12 h-12 bg-purple-500 hover:bg-purple-400 text-white rounded-full shadow-lg flex items-center justify-center transition active:scale-95 z-10"
            aria-label={t.financeAddSubscription}
          >
            <Plus size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/finance/FinanceSubscriptions.tsx
git commit -m "feat(portal): add FinanceSubscriptions with deadline alerts"
```

---

## Task 14: Finance pagina + Sidebar integratie

**Files:**
- Create: `portal/app/dashboard/finance/page.tsx`
- Modify: `portal/components/layout/Sidebar.tsx`
- Modify: `portal/app/dashboard/AppShell.tsx`

- [ ] **Step 1: Schrijf `portal/app/dashboard/finance/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import FinanceOverview from './FinanceOverview';
import FinanceTransactions from './FinanceTransactions';
import FinanceSubscriptions from './FinanceSubscriptions';

type Tab = 'overview' | 'transactions' | 'subscriptions' | 'pending' | 'all';

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [txTab, setTxTab] = useState('all');

  function handleTabChange(t: string) {
    if (t === 'pending' || t === 'all') {
      setTxTab(t);
      setTab('transactions');
    } else {
      setTab(t as Tab);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top tabs */}
      <div className="shrink-0 px-4 pt-3 pb-0">
        <div className="flex bg-slate-800 rounded-2xl p-1 gap-1">
          {(['overview', 'transactions', 'subscriptions'] as const).map(t2 => (
            <button
              key={t2}
              onClick={() => setTab(t2)}
              className={`flex-1 py-2 text-xs font-medium rounded-xl transition ${
                tab === t2 || (tab === 'pending' && t2 === 'transactions') || (tab === 'all' && t2 === 'transactions')
                  ? 'bg-slate-700 text-cyan-400'
                  : 'text-slate-500'
              }`}
            >
              {t2 === 'overview' ? 'Overzicht' : t2 === 'transactions' ? 'Transacties' : 'Abonnementen'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {tab === 'overview' && <FinanceOverview onTabChange={handleTabChange} />}
        {(tab === 'transactions' || tab === 'pending' || tab === 'all') && (
          <FinanceTransactions initialTab={txTab} />
        )}
        {tab === 'subscriptions' && <FinanceSubscriptions />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Voeg Finance toe aan Sidebar**

Open `portal/components/layout/Sidebar.tsx`. Voeg `Euro` toe aan de Lucide import:
```typescript
import { Home, Mail, FileText, User, CheckSquare, Calendar, Camera, Euro, LogOut } from 'lucide-react';
```

Voeg Finance toe aan `NAV_ITEMS` array (na Taken, vóór Mail):
```typescript
  { href: '/dashboard/finance', icon: Euro, label: 'Financiën', badge: 'finance' },
```

Pas de `badge()` functie aan:
```typescript
  function badge(key: string) {
    if (key === 'mail' && unreadMail > 0) return unreadMail;
    if (key === 'tasks' && openTasks > 0) return openTasks;
    // Finance pending count wordt niet real-time bijgehouden in sidebar (cosmetic)
    return null;
  }
```

- [ ] **Step 3: Voeg Finance toe aan AppShell PAGE_TITLES**

Open `portal/app/dashboard/AppShell.tsx`. Voeg toe aan `PAGE_TITLES`:
```typescript
  '/dashboard/finance': 'Financiën',
```

- [ ] **Step 4: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/finance/page.tsx portal/components/layout/Sidebar.tsx portal/app/dashboard/AppShell.tsx
git commit -m "feat(portal): add Finance page with tab navigation and Sidebar link"
```

---

## Task 15: Build, deploy en smoke-test

- [ ] **Step 1: Build API**

```bash
cd /srv/platform/api && npm run build 2>&1 | grep -E "^.*(error|Error)" | grep -v "node_modules" | head -20
```

Expected: geen errors.

- [ ] **Step 2: Build portal**

```bash
cd /srv/platform && docker compose build portal 2>&1 | tail -15
```

Expected: `Successfully built ...`

- [ ] **Step 3: Restart API en portal**

```bash
cd /srv/platform && docker compose build api && docker compose up -d api portal
sleep 10
docker logs platform-api-1 --tail 5 2>&1
docker logs platform-portal-1 --tail 5 2>&1
```

Expected: beide `Nest application successfully started` en `Ready in 0ms`.

- [ ] **Step 4: Verifieer tabellen aangemaakt**

```bash
docker exec platform-db-1 psql -U postgres -d platform -c "\dt finance_*" 2>&1
```

Expected: `finance_subscriptions` en `finance_transactions` zichtbaar.

- [ ] **Step 5: Smoke test API**

```bash
INTERNAL_SECRET=$(grep INTERNAL_API_SECRET /srv/platform/.env | cut -d= -f2)
docker exec platform-api-1 wget -qO- \
  --header="x-internal-secret: $INTERNAL_SECRET" \
  --header="x-authentik-username: admin" \
  'http://localhost:3001/me/finance/summary' 2>&1
```

Expected: JSON met `maandTotalen`, `pendingCount`, etc.

- [ ] **Step 6: Final commit**

```bash
cd /srv/platform
git add -A
git commit -m "feat(finance): complete finance module — API + portal + Diggi integration" --allow-empty
```

---

## Self-review

**Spec coverage:**
- ✅ Paperless → extractie: via `FinanceMailPollerService` (Paperless docs via Ollama in Task 3)
  - **Let op:** Paperless-specifieke integratie (luisteren op nieuwe DocDocuments) is NIET in dit plan. De mail poller dekt IMAP. Voor Paperless-integratie: voeg een hook toe in `documents.service.ts` die `FinanceExtractorService.extract()` aanroept na classificatie. Dit is een follow-up verbetering.
- ✅ IMAP mail poller (Task 5)
- ✅ Handmatige invoer (Task 12)
- ✅ Review-wachtrij met goedkeuren/afwijzen (Task 12)
- ✅ Maandoverzicht met staafgrafiek (Task 11)
- ✅ Abonnementenlijst met opzegtermijn-indicators (Task 13)
- ✅ Alert-banner voor naderende deadlines (Task 13)
- ✅ Signal alerts via FinanceAlertService (Task 4)
- ✅ Diggi proactive integratie (Task 8)
- ✅ Sidebar navigatie Finance (Task 14)
- ✅ 7 vaste categorieën (Tasks 1, 12)
- ✅ Automatisch abonnement aanmaken bij goedkeuren van abonnement-transactie (Task 6)

**Paperless-trigger follow-up (niet blokkerend):** Na implementatie, voeg toe in `api/src/documents/documents.service.ts` een aanroep naar `FinanceExtractorService` voor documenten met type `Financieel` of `Bankafschriften`.

**Type consistency:** `FinanceCategorie`, `FinanceTransaction`, `FinanceSubscription` consistent gebruikt door hele plan. `ExtractedTransaction` interface defined in Task 2 en gebruikt in Tasks 3 en 5.
