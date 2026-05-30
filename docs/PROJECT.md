# CollaBrains — Projectbeschrijving

**Versie:** 2026-05-30  
**Productie:** `platform.cbrains.de` · VPS `88.99.27.87`

---

## Wat is CollaBrains?

Een zelf-gehoste persoonlijke levensadministratie. Geen cloud van een derde partij — alles draait op jouw server, onder jouw controle. CollaBrains brengt documenten, mail, foto's, kalender, taken en communicatie samen in één overzicht, aangevuld met lokale AI die documenten begrijpt en categoriseert zonder data te lekken.

Het platform bestaat uit een NestJS control plane die andere open-source services (Authentik, Mailcow, Paperless, Immich, Radicale, Ollama) provisioneert en orkestreert. Na een eenmalige browser-wizard is alles operationeel — inclusief TLS-certificaten, SSO en e-mail.

---

## Architectuurlagen

```
Gebruiker
  │
  ├── portal.platform.cbrains.de   Next.js PWA (admin + dashboard)
  ├── auth.platform.cbrains.de     Authentik SSO
  ├── docs.platform.cbrains.de     Paperless-ngx documenten
  ├── mail.cbrains.de              Mailcow webmail
  ├── fotos.platform.cbrains.de    Immich fotobeheer
  ├── cal.platform.cbrains.de      Radicale CalDAV
  └── gpt.platform.cbrains.de      paperless-gpt AI-tagging UI

Achtergrond
  │
  ├── NestJS API (:3001)           Bedrijfslogica, orkestratie
  ├── Caddy                        Reverse proxy, automatisch TLS
  ├── Authentik                    SSO (OIDC/LDAP/OAuth2)
  ├── Mailcow                      SMTP/IMAP/Webmail
  ├── Paperless-ngx                Documentopslag & OCR
  ├── paperless-gpt + Ollama       Lokale AI-tagging & samenvatting
  ├── Immich                       Fotobeheer met ML
  ├── Radicale                     CalDAV/CardDAV
  ├── Signal CLI REST API          Push-notificaties & commando's
  ├── BullMQ + Redis               Async taakwachtrij
  └── PostgreSQL 16                Data-opslag (meerdere instanties)
```

---

## Services (docker-compose.yml)

| Service | Image | Poort | Rol |
|---------|-------|-------|-----|
| caddy | caddy:latest | 80, 443 | Reverse proxy + TLS |
| db | postgres:16-alpine | intern | Platform database |
| api | ./api | 3001 | NestJS backend |
| portal | ./portal | 3000 | Next.js frontend |
| postgresql-authentik | postgres:16-alpine | intern | Authentik database |
| redis-authentik | redis:7-alpine | intern | Authentik cache |
| authentik-server | ghcr.io/goauthentik/server:2024.6 | 9000 | SSO provider |
| authentik-worker | ghcr.io/goauthentik/server:2024.6 | — | SSO achtergrondtaken |
| paperless-redis | redis:7-alpine | intern | Paperless cache |
| paperless | ghcr.io/paperless-ngx/paperless-ngx | 8000 | Document OCR |
| paperless-gpt | ghcr.io/icereed/paperless-gpt | intern | AI auto-tagging |
| ollama | ollama/ollama | 11434 | Lokale LLM (llama3.1:8b) |
| signal-api | bbernhard/signal-cli-rest-api | 8080 | Signal REST wrapper |
| signal-consumer | ./scripts | — | Signal→Paperless bridge |
| immich-server | ghcr.io/immich-app/immich-server | 2283 | Fotobeheer |
| immich-machine-learning | ghcr.io/immich-app/immich-machine-learning | — | ML features |
| immich-redis | redis:7-alpine | intern | Immich cache |
| immich-db | ghcr.io/immich-app/postgres:14-vectorchord | intern | Immich database |
| radicale | tomsquest/docker-radicale | 5232 | CalDAV/CardDAV |
| queue-redis | redis:7-alpine | intern | BullMQ wachtrij |
| backup | custom | — | Dagelijks backup (03:00 UTC) |
| user-sync | ./scripts | — | Eenmalige Authentik→Paperless sync |
| mailcow | (include) | 25, 465, 587, 993 | Complete e-mailstack |

**Mailcow** wordt geïncludeerd via `core/mailcow/docker-compose.yml` op een apart `mailcow-network`.

---

## Netwerktopologie

**Netwerken:**
- `platform` — interne Docker bridge voor alle applicatieservices
- `mailcow-network` — geïsoleerd netwerk beheerd door Mailcow

**Caddy routing:**

| Domein | Achterliggende service | Authentik auth |
|--------|----------------------|----------------|
| portal.platform.cbrains.de | portal:3000 + api:3001 | ja |
| auth.platform.cbrains.de | authentik-server:9000 | nee |
| docs.platform.cbrains.de | paperless:8000 | ja |
| mail.cbrains.de | nginx-mailcow:8080 | nee |
| cal.platform.cbrains.de | radicale:5232 | ja |
| fotos.platform.cbrains.de | immich-server:2283 | nee |
| gpt.platform.cbrains.de | paperless-gpt:8080 | ja |

---

## Authenticatieflow

```
Browser → Caddy → Authentik forward auth middleware
                    ↓ 401 → redirect naar auth.platform.cbrains.de/login
                    ↓ 200 → request doorgestuurd naar service

Portal → API: X-Internal-Secret + X-Authentik-Uid headers
             (geen OAuth; Caddy injecteert Authentik headers na forward auth)
```

---

## Data-persistentie & Backup

**Named volumes:** db_data, authentik_data, paperless_data, paperless_media, signal_data, ollama_data, immich_db_data, immich_model_cache, radicale_data, backup_data (+ Mailcow volumes)

**Backup (dagelijks 03:00 UTC):**
- PostgreSQL (platform + Authentik) — pg_dump
- MariaDB (Mailcow) — mysqldump
- Paperless media — tar
- Signal data — tar
- Radicale data — tar
- Output: `./backups/YYYY-MM-DD/`

---

## Onboarding State Machine

```
UNINITIALIZED
  → DNS_CHECK         (DNS A-records + MX validatie)
  → CREATING_SECRETS  (auto-genereer alle wachtwoorden en tokens)
  → AUTHENTIK_SETUP   (admin account, LDAP, OIDC client, webhook)
  → MAILCOW_SETUP     (domein, DKIM, admin mailbox)
  → TRAEFIK_CONFIG    (Caddy + TLS — naam historisch)
  → READY
```

State persistent in PostgreSQL. SSE stream (`/bootstrap/stream`) geeft real-time feedback aan de wizard. Bij herstart hervat het systeem vanaf de laatste geslaagde state.

---

## Signal→Paperless Bridge

`signal-consumer` (Python, `scripts/`) pollt de Signal REST API elke 5 seconden.  
Bij inkomend bericht:
1. Zoek ontvanger-telefoonnummer op in `user_attributes.phone_number`
2. Bijlagen → upload naar Paperless inbox van die gebruiker
3. Tekst met `!inbox` prefix → sla op als tekstdocument
4. Bevestiging via Signal terugsturen

---

## Ontwikkelstack

| Component | Tech |
|-----------|------|
| Backend | NestJS 11, TypeScript, TypeORM, Express |
| Frontend | Next.js 16, React 19, Tailwind v4, TanStack Query |
| Testing | Jest 30 (backend), — (frontend) |
| CI/CD | GitHub Actions (`.github/workflows/`) |
| Package manager | npm |
| Container | Docker Compose v2.20+ |
