# CollaBrains — TODO

**Stand:** 2026-05-30 · Gesorteerd op prioriteit

---

## Korte termijn — specs/plannen al klaar

- [ ] **Visual design upgrade** — portal redesign: typografie, spacing, component-bibliotheek  
  Spec: `docs/superpowers/specs/2026-05-30-visual-design-upgrade-design.md`  
  Plan: `docs/superpowers/plans/2026-05-30-visual-design-upgrade.md`

- [ ] **Paperless SSO user provisioning** — automatisch Paperless-account aanmaken bij nieuwe Authentik-gebruiker  
  Spec: `docs/superpowers/specs/2026-05-30-paperless-sso-provisioning-design.md`  
  Plan: `docs/superpowers/plans/2026-05-30-paperless-sso-provisioning.md`

- [ ] **Error handling reliability** — volledige retry/fallback suite voor alle externe service-calls  
  Spec: `docs/superpowers/specs/2026-05-30-error-handling-reliability-design.md`  
  Plan: `docs/superpowers/plans/2026-05-30-error-handling-reliability.md`

- [ ] **Photos module (volledig)** — upload via portal, albums, zoeken, Immich deep integratie  
  Spec: `docs/superpowers/specs/2026-05-30-photos-module-design.md`  
  Plan: `docs/superpowers/plans/2026-05-30-photos-module.md`

- [ ] **Mail client** — IMAP inbox in portal (mappen, berichten, bijlagen)  
  Spec: `docs/superpowers/specs/2026-05-24-mail-integration-design.md`  
  Plan: `docs/superpowers/plans/2026-05-24-mail-integration.md`

- [ ] **Signal tickets** — deadlines en taken aanmaken/beheren via Signal-commando's  
  Spec: `docs/superpowers/specs/2026-05-24-signal-tickets-design.md`

- [ ] **Roles / audit / 2FA** — RBAC (admin/user rollen), audit-UI in dashboard, TOTP 2FA  
  Spec: `docs/superpowers/specs/2026-05-24-roles-audit-2fa-design.md`

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
