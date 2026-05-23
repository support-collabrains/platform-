# Platform

A self-hosted control plane with a live provisioning engine. Install it on any VPS and it provisions Authentik (SSO), Mailcow (email), and Traefik (reverse proxy + TLS) through a browser-based onboarding wizard.

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
System becomes ACTIVE
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
| Portal + API | `https://portal.<PRIMARY_DOMAIN>` | Setup wizard + dashboard |
| Authentik (SSO) | `https://auth.<PRIMARY_DOMAIN>` | OIDC/OAuth2 provider |
| Mailcow (email) | `https://mail.<MAIL_DOMAIN>` | Webmail + admin |
| Traefik | internal | Reverse proxy, handles all TLS via Let's Encrypt |

---

## Stack

| Layer | Technology |
|---|---|
| API | NestJS (TypeScript) |
| Portal | Next.js 14 (App Router) |
| Database | PostgreSQL 16 |
| SSO | Authentik |
| Email | Mailcow |
| Proxy / TLS | Traefik v3 |
| Containers | Docker Compose |

---

## Project structure

```
platform-/
├── api/                        NestJS provisioning engine
│   └── src/bootstrap/
│       ├── bootstrap.service.ts      State machine
│       ├── bootstrap.controller.ts   REST + SSE endpoints
│       ├── onboarding-event.entity.ts
│       └── integrations/
│           ├── authentik.service.ts
│           ├── mailcow.service.ts
│           └── traefik.service.ts
├── portal/                     Next.js onboarding UI
│   ├── app/setup/page.tsx      5-step wizard
│   └── lib/api.ts              API client
├── core/mailcow/               Cloned at runtime by install.sh
├── docker-compose.yml          Full stack definition
├── install.sh                  One-command installer
└── .env.example                Environment variable reference
```

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/bootstrap/state` | Current state + full event log |
| `POST` | `/bootstrap/start` | Start provisioning |
| `POST` | `/bootstrap/verify-dns` | Check DNS records |
| `POST` | `/bootstrap/verify-ports` | Check port reachability |
| `GET` | `/bootstrap/events` | SSE stream of live events |

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

The API requires a running Postgres instance. Set `DATABASE_URL` in `api/.env`.
