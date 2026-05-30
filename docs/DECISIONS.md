# CollaBrains — Architectuurbesluiten

Lichte ADR's (Architecture Decision Records): elke beslissing bevat context, besluit en reden. Bedoeld als geheugensteun voor toekomstige sessies.

---

## ADR-01: Caddy i.p.v. Traefik als reverse proxy

**Context:** Traefik was de oorspronkelijke reverse proxy. `config/traefik/` directory bestaat nog maar is deprecated.  
**Besluit:** Caddy (`caddy/Caddyfile`) is de actieve proxy.  
**Reden:** Eenvoudiger configuratie (plain text vs. YAML labels), zelfde automatisch TLS via Let's Encrypt, native forward-auth support. Caddy is makkelijker te debuggen en heeft minder docker-label-overhead.

---

## ADR-02: Express adapter bewaren (niet Fastify)

**Context:** NestJS ondersteunt zowel Express als Fastify.  
**Besluit:** Express adapter blijft. Niet migreren naar Fastify.  
**Reden:** De `bootstrap` module gebruikt Server-Sent Events (SSE) via `@Sse()` decorator. SSE-implementatie is Express-specifiek. Een Fastify-migratie vereist een volledige refactor van de SSE-stream en alle middleware — te risicovol zonder directe meerwaarde.

---

## ADR-03: Interne auth via headers (geen OAuth intern)

**Context:** Portal (Next.js) communiceert met API (NestJS). Meerdere auth-mechanismen mogelijk.  
**Besluit:** Portal→API auth via `X-Internal-Secret` (gedeeld secret) + `X-Authentik-Uid` (geïnjecteerd door Caddy na forward auth).  
**Reden:** Caddy doet al forward auth via Authentik voor elke inkomende request. De Authentik-headers worden doorgegeven aan de portal, die ze door stuurt naar de API. Een aparte OAuth-flow intern zou dubbel werk zijn en extra latency toevoegen.

---

## ADR-04: Ollama lokaal (geen cloud AI)

**Context:** Document-samenvatting en AI-tagging hebben een taalmodel nodig.  
**Besluit:** Ollama draait lokaal op de VPS (model: `llama3.1:8b`).  
**Reden:** Privacy-first architectuur — documenten bevatten persoonlijke gegevens (facturen, medische stukken). Geen data naar externe API's. Eenmalige setup, geen doorlopende kosten. Kwaliteit van llama3.1:8b is voldoende voor categorisatie en samenvatting.

---

## ADR-05: BullMQ voor document pipeline

**Context:** Paperless post-consume webhook → AI-samenvatting → Signal-notificatie is een async flow.  
**Besluit:** BullMQ (Redis-backed job queue) voor alle async document-verwerkingstaken.  
**Reden:** Redis was al aanwezig (Authentik, Paperless). BullMQ biedt retry-logica, prioriteiten en job-monitoring out of the box. Directe HTTP-chains zouden falen bij Ollama-timeouts (LLM inference kan 30+ seconden duren).

---

## ADR-06: Aparte PostgreSQL per service

**Context:** Meerdere services hebben een database nodig (platform, Authentik, Paperless, Immich).  
**Besluit:** Elke service krijgt een eigen PostgreSQL-instantie (of MariaDB voor Mailcow).  
**Reden:** Isolatie — een migratie of corrupt schema in één service raakt de anderen niet. Mailcow vereist MariaDB (niet onderhandelbaar). Immich vereist PostgreSQL met pgvector extensie (eigen image: `postgres:14-vectorchord`).

---

## ADR-07: Signal als notificatiekanaal

**Context:** Gebruikers moeten notificaties ontvangen bij nieuwe documenten, deadlines, etc.  
**Besluit:** Signal messenger via Signal CLI REST API (`bbernhard/signal-cli-rest-api`).  
**Reden:** Gebruikers hebben Signal al. Geen SMS-kosten. End-to-end versleuteld. Werkt als twee-richtingskanaal (gebruiker kan ook documenten terugsturen via Signal→Paperless bridge). Alternatief (push-only via VAPID) is ook geïmplementeerd als aanvulling.

---

## ADR-08: TypeORM i.p.v. Prisma

**Context:** ORM-keuze voor NestJS backend.  
**Besluit:** TypeORM met decorators.  
**Reden:** NestJS 11 heeft native TypeORM integratie (`@nestjs/typeorm`). Bestaande migraties draaien al. TypeORM's decorator-stijl past goed bij de NestJS class-based architectuur. Prisma-migratie zou alle entities en repositories vereisen te herschrijven.

---

## ADR-09: NestJS gateway module proxiet Paperless/Immich

**Context:** Paperless en Immich draaien intern, niet direct exposed via Caddy voor eindgebruikers.  
**Besluit:** De `gateway` module in NestJS proxiet requests naar Paperless (docs, previews) en Immich (foto's) via `axios`.  
**Reden:** Authentik-gebaseerde toegangscontrole blijft in één laag (Caddy+API). Gebruikers raken Paperless/Immich niet direct — alle requests lopen via de API die autorisatie kan controleren. Bovendien kunnen responses worden gefilterd/verrijkt (bijv. metadata toevoegen).

---

## ADR-10: Geen mocks in backend tests

**Context:** NestJS Jest tests voor services die met PostgreSQL praten.  
**Besluit:** Integratie-tests draaien tegen echte PostgreSQL, geen in-memory mocks.  
**Reden:** In Q1 2025 zijn geslaagde mock-tests misleidend gebleken toen productie-migraties faalden. Echte database-tests vangen schema-mismatches op die mocks verbergen.
