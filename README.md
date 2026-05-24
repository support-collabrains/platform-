# Platform

A self-hosted control plane with a live provisioning engine. Install it on any VPS and it provisions Authentik (SSO), Mailcow (email), Paperless-ngx (document management), and Traefik (reverse proxy + TLS) through a browser-based onboarding wizard. After setup, it provides user management, Signal-based notifications, and AI-powered document summaries.

No mock mode. No fake services. Everything is provisioned live during setup.

---

## How it works

On first boot the system is `UNINITIALIZED`. Opening the portal redirects to the setup wizard, which walks through domain configuration, DNS/port verification, and admin account creation. The backend then provisions all infrastructure live and flips the system to `READY`.

```
Server starts
  ↓
Portal detects UNINITIALIZED state
  ↓
5-step onboarding wizard
  ↓
Backend provisions: Authentik → Mailcow → Traefik
  ↓
System becomes READY
```

State machine: `UNINITIALIZED → DNS_CHECK → CREATING_SECRETS → AUTHENTIK_SETUP → MAILCOW_SETUP → TRAEFIK_CONFIG → READY`

All provisioning events are persisted to Postgres and streamed live to the browser via SSE. If the API restarts mid-provisioning it resumes from the last recorded state.

---

## Prerequisites

- VPS with a static IP
- Ports 80, 443, 25, 465, 587, 143, 993 open
- DNS A record pointing your primary domain to the server IP
- DNS MX record for your mail domain
- Docker + Docker Compose v2 (≥ 2.20 for `include:` support)

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/support-collabrains/platform-/main/install.sh | sudo bash
```

Or clone and run manually:

```bash
git clone https://github.com/support-collabrains/platform- /srv/platform
cd /srv/platform
cp .env.example .env
# Edit .env — set PRIMARY_DOMAIN, MAIL_DOMAIN, ADMIN_EMAIL, ADMIN_PASSWORD
sudo bash install.sh
```

The install script:
1. Clones `mailcow-dockerized` into `core/mailcow/`
2. Generates `mailcow.conf` (binds nginx to 127.0.0.1 so Traefik handles TLS)
3. Generates all secrets into `.env`
4. Creates the shared Docker network
5. Builds and starts the full stack
6. Prints the setup wizard URL

---

## Services

| Service | URL | Notes |
|---|---|---|
| Portal + API | `https://portal.<PRIMARY_DOMAIN>` | Setup wizard + admin dashboard |
| Authentik (SSO) | `https://auth.<PRIMARY_DOMAIN>` | OIDC/OAuth2, single sign-on for all services |
| Mailcow (email) | `https://mail.<MAIL_DOMAIN>` | Webmail + admin |
| Paperless-ngx | `https://docs.<PRIMARY_DOMAIN>` | Document management, OIDC login via Authentik |
| Traefik | internal | Reverse proxy, handles all TLS via Let's Encrypt |

---

## Stack

| Layer | Technology |
|---|---|
| API | NestJS (TypeScript) |
| Portal | Next.js 14 (App Router) |
| Database | PostgreSQL 16 |
| SSO | Authentik |
| Email | Mailcow (Dockerized) |
| Document management | Paperless-ngx |
| AI summarization | Ollama (`mistral` model, runs locally) |
| Job queue | BullMQ + Redis |
| Notifications | Signal CLI REST API |
| Proxy / TLS | Traefik v3 |
| Containers | Docker Compose |

---

## Features

### Onboarding wizard
5-step browser wizard provisions the full stack from scratch. DNS and port checks block progression if prerequisites are not met. All steps stream progress to the browser in real time.

### User management (admin portal)
Admins can create and delete users from `https://portal.<PRIMARY_DOMAIN>/users`. Creating a user:
- Creates an Authentik account (SSO for portal + Paperless)
- Creates a Mailcow mailbox at `username@<MAIL_DOMAIN>`
- Creates a Paperless-ngx account with a personal document inbox
- Sends a welcome message via Signal to the user's registered phone number(s)

Each user can have up to two Signal phone numbers (`phone`, `phone2`).

### Signal notifications
Admins and users receive Signal messages for key events:
- New user created → welcome message to the user's phone(s), notification to admin
- New document consumed → prompt asking whether to summarize (see below)

### Document AI (Paperless → Ollama → Signal)
When Paperless-ngx consumes a new document:
1. The post-consume script notifies the API with the document ID, owner, and title
2. The API looks up the owner's Signal phone number(s) from Authentik
3. A Signal message is sent: *"New document: Title. Reply ✅ to get a summary."*
4. When the user replies with ✅ (text or reaction), the API queues a BullMQ job
5. The job fetches the full document text from Paperless, sends it to Ollama (`mistral`), and delivers the Dutch-language summary (≤ 300 words) back via Signal

Ollama runs entirely on the VPS — no external AI API calls.

### Backups
A cron-based backup container runs daily at 03:00 and stores compressed archives in `./backups/YYYY-MM-DD/`:

| Component | Method |
|---|---|
| Platform PostgreSQL | `pg_dump` |
| Authentik PostgreSQL | `pg_dump` |
| Mailcow MariaDB | `mariadb-dump` |
| Paperless media | `tar` |
| Signal data | `tar` |
| Traefik certificates | `tar` |
| vmail (mailbox data) | `tar` |

Run `scripts/restore-test.sh` to verify backup integrity without affecting production data.

---

## Project structure

```
platform-/
├── api/                          NestJS API
│   └── src/
│       ├── bootstrap/            Provisioning state machine + SSE
│       │   └── integrations/     Authentik, Mailcow, Traefik clients
│       ├── admin/                User CRUD (portal admin panel)
│       ├── users/                Authentik webhook → onboarding
│       ├── documents/            Paperless → Signal → Ollama pipeline
│       │   ├── documents.service.ts   BullMQ queue, Signal poller, job worker
│       │   ├── ollama.service.ts      Summarization + model pull
│       │   ├── documents.controller.ts  POST /documents/consumed
│       │   └── document.entity.ts     DocDocument, DocNotification, DocSummary
│       └── notifications/        Signal send helpers
├── portal/                       Next.js portal
│   ├── app/setup/page.tsx        5-step onboarding wizard
│   ├── app/users/page.tsx        Admin user management
│   └── lib/api.ts                API client
├── scripts/
│   ├── backup.sh                 Daily backup script (runs in backup container)
│   ├── restore-test.sh           Backup integrity verification
│   └── paperless-post-consume.sh Notifies API after each Paperless document
├── config/
│   ├── traefik/                  Traefik static + dynamic config
│   ├── authentik-custom.css      CollaBrains branding for Authentik login page
│   └── backup.Dockerfile         Backup container (postgres + mariadb-client)
├── core/mailcow/                 Cloned at runtime by install.sh
├── docker-compose.yml            Full stack definition
├── install.sh                    One-command installer
└── .env.example                  Environment variable reference
```

---

## API endpoints

### Bootstrap
| Method | Path | Description |
|---|---|---|
| `GET` | `/bootstrap/state` | Current state + full event log |
| `POST` | `/bootstrap/start` | Start provisioning |
| `POST` | `/bootstrap/verify-dns` | Check DNS records |
| `POST` | `/bootstrap/verify-ports` | Check port reachability |
| `GET` | `/bootstrap/events` | SSE stream of live events |

### Admin
| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/users` | List all Authentik users |
| `POST` | `/admin/users` | Create user (Authentik + Mailcow + Paperless) |
| `DELETE` | `/admin/users/:pk` | Delete user |
| `PATCH` | `/admin/apply-branding` | Apply custom CSS to Authentik |

### Webhooks
| Method | Path | Description |
|---|---|---|
| `POST` | `/webhook/authentik` | Authentik user-created webhook → onboarding |

### Documents
| Method | Path | Description |
|---|---|---|
| `POST` | `/documents/consumed` | Called by Paperless post-consume script |

---

## Environment variables

Key variables in `.env` (see `.env.example` for the full list):

| Variable | Description |
|---|---|
| `PRIMARY_DOMAIN` | Root domain (e.g. `example.com`) — portal at `portal.example.com` |
| `MAIL_DOMAIN` | Mail domain for Mailcow (often same as `PRIMARY_DOMAIN`) |
| `SIGNAL_SENDER` | Registered Signal number for the platform (e.g. `+31612345678`) |
| `SIGNAL_RECIPIENT` | Admin's Signal number for system notifications |
| `OLLAMA_MODEL` | Ollama model for document summaries (default: `mistral`) |
| `PAPERLESS_API_TOKEN` | Paperless admin API token (used by the API to fetch document text) |

---

## Hard fail rules

Onboarding is blocked if:
- DNS A record is not found for the primary domain
- DNS MX record is not found for the mail domain
- Ports 80 or 443 are not reachable on the server

This prevents the majority of self-hosting failures caused by incomplete DNS or firewall configuration.

---

## Development

```bash
# API
cd api && npm install && npm run start:dev

# Portal
cd portal && npm install && npm run dev
```

Set `NEXT_PUBLIC_API_URL=http://localhost:3001` in `portal/.env.local`.

The API requires a running Postgres instance and Redis for the BullMQ job queue. Set `DATABASE_URL` and `QUEUE_REDIS_URL` in `api/.env`.
