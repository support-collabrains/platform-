# CollaBrains — Implementatiestatus

**Stand:** 2026-05-30 · Laatste commit: `60af00c` (fix: resolve 12 test failures)

---

## Module Status

| Module | Status | Opmerkingen |
|--------|--------|-------------|
| Bootstrap / provisioning | ✅ Klaar | 7-state machine, SSE stream, persistent in PostgreSQL |
| Authentik SSO | ✅ Klaar | OIDC, LDAP, webhook, forward auth via Caddy |
| Mailcow email | ✅ Klaar | SMTP/IMAP, auto-provisioning per gebruiker, DKIM |
| Paperless documenten | ✅ Klaar | OCR, AI-tagging (paperless-gpt + Ollama), SSO via OIDC |
| Signal notificaties | ✅ Klaar | Document-alerts, Signal→Paperless bridge (Python) |
| Immich foto's | ✅ Klaar | Gallery + lightbox in portal, API proxy via gateway module |
| Radicale kalender | ✅ Klaar | CalDAV events lezen + aanmaken in portal |
| Admin panel | ✅ Klaar | User CRUD, sync naar Authentik + Mailcow + Paperless |
| Dashboard UX | ✅ Klaar | Error states, loading skeletons, dark mode, toast systeem |
| PWA | ✅ Klaar | Installeerbare PWA, web push notificaties (VAPID) |
| Tests (baseline) | ✅ Klaar | 12 pre-existing failures opgelost, Jest stabiel |
| LDAP profiel (self-service) | ✅ Klaar | Telefoon + archiveerpad bewerkbaar via dashboard |
| Backup service | ✅ Klaar | Dagelijks 03:00 UTC, alle 7 componenten |
| Mail client (IMAP) | 🔄 In progress | Design spec klaar (2026-05-24), basis IMAP endpoints aanwezig |
| Roles / RBAC | 📋 Gepland | Design spec klaar (`docs/superpowers/specs/2026-05-24-roles-audit-2fa-design.md`) |
| 2FA | 📋 Gepland | Onderdeel van Roles/RBAC spec |
| Signal tickets | 📋 Gepland | Design spec klaar (`docs/superpowers/specs/2026-05-24-signal-tickets-design.md`) |
| Visual design upgrade | 📋 Gepland | Spec klaar (`docs/superpowers/specs/2026-05-30-visual-design-upgrade-design.md`) |
| Paperless SSO provisioning | 📋 Gepland | Plan klaar (`docs/superpowers/plans/2026-05-30-paperless-sso-provisioning.md`) |
| Error handling (volledig) | 📋 Gepland | Plan klaar (`docs/superpowers/plans/2026-05-30-error-handling-reliability.md`) |
| Photos module (volledig) | 📋 Gepland | Plan klaar (`docs/superpowers/plans/2026-05-30-photos-module.md`) |

---

## Recent afgerond (laatste 2 weken)

| Datum | Wat |
|-------|-----|
| 2026-05-30 | Jest test baseline opgelost (12 failures) |
| 2026-05-30 | UI primitives: desktop sidebar + header layout, dark mode toggle |
| 2026-05-30 | Photos gallery met Immich integratie (PhotosGallery + PhotoLightbox) |
| 2026-05-29 | Error states, retry buttons, loading skeletons op alle dashboard-pagina's |
| 2026-05-29 | Toast systeem + ErrorBoundary + `useApiRequest` hook |
| 2026-05-23 | Caddy proxy vervangt Traefik, user-sync service, Signal→Paperless bridge |
| 2026-05-23 | PWA + web push notificaties + gateway proxies + CI/CD |
| 2026-05-21 | Paperless SSO, LDAP metadata, admin attributes API |
| 2026-05-18 | Mailcow auto-provisioning, IMAP credential fallback |
| 2026-05-18 | Subsystem E: calendar (Radicale), photos (Immich), tasks (tickets) |

---

## Bekende issues / tech debt

1. **Mail client half-af** — IMAP endpoints bestaan (`/users/me/mail`), portal-pagina `/dashboard/mail` nog niet volledig geïmplementeerd
2. **Geen Swagger/OpenAPI** — API-endpoints gedocumenteerd in `README.md` maar geen live docs
3. **Geen E2E tests** — Jest-baseline aanwezig maar geen Playwright/Cypress integratie
4. **Health checks ontbreken** — docker-compose services hebben geen `healthcheck` stanzas (alleen redis en db)
5. **Admin email typo in .env** — `jdejager589@gmsil.com` (gmsil i.p.v. gmail) — niet-functioneel voor mail, maar login werkt via Authentik
