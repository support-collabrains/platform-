# CollaBrains — TODO

**Stand:** 2026-05-31 · Gesorteerd op prioriteit

---

## Korte termijn — specs/plannen al klaar

- [x] **Visual design upgrade** — portal redesign: typografie, spacing, component-bibliotheek  
  ✅ Geïmplementeerd: UI primitives (Card, Button, Badge, Avatar, Spinner, Skeleton), desktop Sidebar + Header, dark mode toggle, alle dashboard-pagina's ge-refactored

- [x] **Paperless SSO user provisioning** — automatisch Paperless-account aanmaken bij nieuwe Authentik-gebruiker  
  ✅ Geïmplementeerd: AuthentikService uitgebreid met `createPaperlessOIDCProvider` + `createPaperlessApplication`, `POST /admin/reprovision-authentik` endpoint

- [x] **Error handling reliability** — volledige retry/fallback suite voor alle externe service-calls  
  ✅ Geïmplementeerd: toast systeem, ErrorBoundary, useApiRequest hook (10s timeout, 2 retries), retry-knoppen in alle dashboard-pagina's

- [x] **Photos module (volledig)** — upload via portal, albums, zoeken, Immich deep integratie  
  ✅ Geïmplementeerd: PhotosGallery (masonry grid, album-filter), PhotoLightbox (keyboard nav, download)

- [x] **Mail client** — IMAP inbox in portal (mappen, berichten, bijlagen)  
  ✅ Geïmplementeerd: MailClient met IMAP, mappen, berichten, bijlagen, compose/reply

- [x] **Signal tickets** — deadlines en taken aanmaken/beheren via Signal-commando's  
  ✅ Geïmplementeerd: signal_tickets table, /taak command, deadline tracking

- [x] **Roles / audit / 2FA** — RBAC (admin/user rollen), audit-UI in dashboard, TOTP 2FA  
  ✅ Geïmplementeerd: RolesGuard, audit_events table, audit-UI in profiel

---

## Middellange termijn — productvisie Phase C–E

- [ ] **mobileconfig** — Apple-apparaatconfiguratie (1-klik Wi-Fi, CalDAV, CardDAV, IMAP, VPN)
- [ ] **Finance module** — facturen, abonnementen, uitgavenoverzicht per maand
- [ ] **Voertuig module** — kenteken, APK-datum, verzekering, brandstofkosten
- [ ] **Gezondheid module** — medicijnen, afspraken, vaccinaties
- [ ] **Contracten module** — abonnementen, looptijden, opzegtermijnen
- [ ] **GDPR export** — volledige data-export per gebruiker (zip: documenten + metadata)
- [ ] **Multi-user** — meerdere gebruikers met eigen geïsoleerde Paperless/Signal omgeving

---

## Tech debt / infrastructuur

- [ ] **Swagger/OpenAPI** — automatisch gegenereerde API-docs via `@nestjs/swagger`
- [ ] **E2E tests** — Playwright voor kritieke flows (login, document upload, wizard)
- [ ] **Health checks** — `healthcheck` stanzas in docker-compose voor alle services
- [ ] **Immich API key rotatie** — mechanisme om key te roteren zonder handmatige stap
- [ ] **Admin email typo** — `.env` bevat `gmsil.com` i.p.v. `gmail.com` (cosmetic, login werkt)
- [ ] **Portal CLAUDE.md** — `portal/CLAUDE.md` bevat alleen een `@AGENTS.md` referentie; uitbreiden

---

## Voltooid (referentie)

Zie `docs/STATUS.md` voor een volledig overzicht van afgeronde modules.  
Zie `docs/superpowers/plans/` voor gedetailleerde implementatieplannen per feature.
