# CollaBrains Platform — Claude Code Context

**Wat:** Self-hosted personal life administration platform. Documenten, mail, foto's, kalender, notificaties — alles op eigen VPS, geen cloud-afhankelijkheden.  
**Productie:** `platform.cbrains.de` · VPS `88.99.27.87`  
**Docs:** `docs/PROJECT.md` · `docs/STATUS.md` · `docs/TODO.md` · `docs/DECISIONS.md`

---

## Architectuur (kort)

```
Browser → Caddy (TLS) → portal:3000 (Next.js)
                      → api:3001   (NestJS)
                      → docs, mail, auth, fotos, cal (externe services)
api ←→ Authentik (SSO/LDAP) · Mailcow (email) · Paperless (docs)
     · Immich (photos) · Radicale (CalDAV) · Signal (push) · Ollama (AI)
```

Portal→API auth: headers `X-Internal-Secret` + `X-Authentik-Uid` (geen OAuth intern).  
State machine bootstrap: `UNINITIALIZED → DNS_CHECK → CREATING_SECRETS → AUTHENTIK_SETUP → MAILCOW_SETUP → TRAEFIK_CONFIG → READY`

---

## Tech Stack

| Laag | Tech | Versie |
|------|------|--------|
| Backend | NestJS (Express adapter) | 11 |
| Frontend | Next.js App Router | 16 |
| Styling | Tailwind CSS | v4 (let op: `@import "tailwindcss"`, niet `@tailwind base`) |
| Database | PostgreSQL | 16 |
| Queue | BullMQ + Redis | — |
| Proxy | Caddy | latest |
| SSO | Authentik | 2024.6 |
| Container | Docker Compose v2 | 2.20+ |

---

## API Modules (`api/src/`)

| Module | Doel |
|--------|------|
| `bootstrap` | Provisioning state machine + SSE stream |
| `admin` | User CRUD (Authentik + Mailcow + Paperless sync) |
| `users` | Authentik webhook handler (onboarding) |
| `users-me` | Dashboard API: docs, mail, calendar, tickets, push, LDAP profiel |
| `documents` | Paperless → Signal → Ollama pipeline (BullMQ) |
| `notifications` | Signal helper (send berichten) |
| `calendar` | CalDAV via Radicale |
| `tickets` | Taakbeheer via Signal |
| `mail` | IMAP mailbox client (Mailcow) |
| `ldap` | User metadata service (Redis cache) |
| `audit` | Activiteitslog |
| `push` | Web Push subscriptions (VAPID) |
| `gateway` | Proxy controllers (Paperless, Immich) |
| `common` | Gedeelde utilities |

---

## Portal Routes (`portal/app/`)

| Route | Doel |
|-------|------|
| `/` | Login / landing |
| `/setup` | 5-staps onboarding wizard |
| `/users` | Admin gebruikersbeheer |
| `/dashboard` | Persoonlijk dashboard (AppShell + sidebar) |
| `/dashboard/docs` | Documenten (Paperless) |
| `/dashboard/photos` | Foto's (Immich) |
| `/dashboard/mail` | Mail (IMAP) |
| `/dashboard/tasks` | Taken / tickets |
| `/dashboard/calendar` | Kalender (CalDAV) |
| `/dashboard/profile` | Instellingen, audit log |

---

## Kritische ontwikkelregels

- **Express adapter bewaren** — SSE in `bootstrap` module breekt bij Fastify-migratie
- **Geen mocks in tests** — db-tests draaien tegen echte PostgreSQL (zie `docs/DECISIONS.md`)
- **Tailwind v4 syntax** — gebruik `@import "tailwindcss"` in CSS, niet `@tailwind base/components/utilities`
- **`docker compose`** (v2) — niet `docker-compose` (v1 deprecated)
- **Interne secrets** — nooit `X-Internal-Secret` waarde hardcoden; altijd uit `process.env.INTERNAL_API_SECRET`
- **TypeORM migrations** — maak nieuwe migration aan bij schema-wijziging, nooit `synchronize: true` in productie

---

## Dev Commando's

```bash
# Backend
cd api && npm run start:dev     # watch mode
cd api && npm test               # jest tests
cd api && npm run build          # productie build

# Frontend
cd portal && npm run dev         # Next.js dev server
cd portal && npm run build       # productie build

# Infra
docker compose up -d             # start alle services
docker compose logs -f api       # logs volgen
docker compose restart api       # service herstarten
```

---

## Omgeving

- `.env` in root — nooit committen, gegenereerd door `install.sh`
- `.env.example` — compleet overzicht van alle variabelen
- Kritische vars: `PRIMARY_DOMAIN`, `MAIL_DOMAIN`, `INTERNAL_API_SECRET`, `AUTHENTIK_BOOTSTRAP_TOKEN`
- VAPID keys in `.env` (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`) — zie ook memory: `vapid_keys.md`
