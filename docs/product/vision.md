# CollaBrains — Productvisie & Modulekaart

**Versie:** 2026-05-24  
**Status:** Levend document — wordt bijgewerkt naarmate modules gebouwd worden

---

## Wat is CollaBrains?

Een zelf-gehoste persoonlijke levensadministratie. Geen cloud van een derde partij — alles draait op jouw server, onder jouw controle. CollaBrains brengt documenten, financiën, voertuigen, gezondheid, contracten en communicatie samen in één overzicht, aangevuld met lokale AI die documenten begrijpt en categoriseert zonder data te lekken.

---

## Architectuurlagen

```
Gebruiker
  │
  ├── app.cbrains.de        Progressive Web App (iPhone, Android, Desktop)
  ├── CollaBrains.mobileconfig   Één-klik apparaatconfiguratie (Apple)
  │
  └── portal.platform.cbrains.de   Beheerpaneel (admin)

Achtergrond
  │
  ├── NestJS API            Bedrijfslogica, orkestratie
  ├── Paperless-ngx         Documentopslag & OCR
  ├── paperless-gpt         AI-tagging & categorisatie (Ollama backend)
  ├── Ollama (mistral)      Lokale LLM — samenvattingen, classificatie, tips
  ├── Authentik             SSO & identiteitsbeheer
  ├── Mailcow               E-mail (IMAP/SMTP)
  ├── Signal CLI            Push-notificaties & commando's
  └── PostgreSQL + Redis    Data & taakwachtrij
```

---

## 1 — paperless-gpt + Ollama

### Wat het doet

paperless-gpt luistert naar nieuwe documenten in Paperless-ngx en laat Ollama automatisch:

- **Titels** normaliseren
- **Correspondenten** herkennen en aanmaken
- **Documenttypes** toewijzen (factuur, brief, contract, …)
- **Tags** toevoegen op basis van inhoud
- **Datums** extraheren en corrigeren

Dit vervangt handmatig categoriseren. De gebruiker ziet het document al ingedeeld zodra het binnenkomt.

### Hoe het past in de stack

```
Paperless-ngx verwerkt document
  │
  ├── post-consume script → CollaBrains API (/documents/consumed)
  │     └── Signal-melding + optionele samenvatting (bestaand)
  │
  └── paperless-gpt watcher (nieuwe service)
        └── Ollama (mistral) → tags, type, correspondent, titel
              └── Paperless API PATCH /documents/{id}/
```

### Toe te voegen aan docker-compose.yml

```yaml
paperless-gpt:
  image: ghcr.io/icereed/paperless-gpt:latest
  restart: unless-stopped
  environment:
    PAPERLESS_BASE_URL: http://paperless:8000
    PAPERLESS_API_TOKEN: ${PAPERLESS_API_TOKEN}
    LLM_PROVIDER: ollama
    OLLAMA_HOST: http://ollama:11434
    LLM_MODEL: ${OLLAMA_MODEL:-mistral}
    LLM_LANGUAGE: Dutch
    AUTO_PROCESS: "true"
  depends_on:
    - paperless
    - ollama
  networks: [platform]
```

### Toe te voegen aan .env.example

```
# paperless-gpt verwerkt documenten automatisch via Ollama
# AUTO_PROCESS=true laat het volledig automatisch draaien
```

---

## 2 — Progressive Web App (app.cbrains.de)

### Gebruikerservaring

```
Gebruiker opent app.cbrains.de in Safari of Chrome
  │
  └── Banner: "Voeg CollaBrains toe aan je beginscherm"
        │
        └── Geïnstalleerd als native app:
              ├── 🏠 Eigen icoon (CollaBrains logo)
              ├── 🖥️  Geen browser-chrome (fullscreen)
              ├── 💫 Splash screen met logo + laadanimatie
              ├── 🔔 Push-notificaties (Web Push API)
              └── 📴 Offline modus — dashboard + gecachede documenten leesbaar
```

### Technische vereisten

| Onderdeel | Aanpak |
|---|---|
| Manifest | `app/manifest.json` — name, icons, theme_color, display: standalone |
| Service Worker | Next.js PWA plugin (`next-pwa`) — cache-first voor statische assets |
| Iconen | 192×192 en 512×512 PNG (maskable) van CollaBrains logo |
| Splash screen | CSS: `theme_color` + centered logo, toont tijdens SW-init |
| Push-notificaties | Web Push API + VAPID-sleutels, opgeslagen in DB per gebruiker |
| Offline | Shell (header, navigatie) altijd cached; documenten 24u cached |
| URL | Aparte subdomain `app.cbrains.de` — zelfde portal, eigen Traefik router |

### Push-notificaties (kanalen)

Gebruikers abonneren zich per type:
- Nieuw document verwerkt
- Samenvatting klaar
- Taak of deadline nadert
- Betalingsherinnering
- Systeemmelding (admin)

---

## 3 — CollaBrains.mobileconfig (Apple)

### Wat het is

Een `.mobileconfig`-bestand dat gebruikers één keer installeren op hun iPhone of iPad. Alle accounts en instellingen worden in één keer geconfigureerd — geen handleiding nodig.

### Inhoud

| Payload | Protocol | Details |
|---|---|---|
| 📧 E-mail (IMAP/SMTP) | IMAP + SMTP | `username@cbrains.de` via Mailcow |
| 📅 Kalender | CalDAV | Radicale of Nextcloud CalDAV endpoint |
| 👥 Contacten | CardDAV | Radicale of Nextcloud CardDAV endpoint |
| 🔒 VPN | WireGuard / IKEv2 | Directe toegang tot interne services |
| 🔐 Certificaten | X.509 | Let's Encrypt CA indien self-signed wordt toegevoegd |
| ⚙️ Beveiligingsinstellingen | MDM | Schermvergrendeling, biometrie-vereiste |

### Distributie

```
portal.cbrains.de/dashboard
  └── Knop: "Download CollaBrains voor iPhone"
        └── GET /api/me/mobileconfig
              └── Gegenereerd .mobileconfig op basis van gebruikersgegevens
                    └── Gesigneerd met PKCS#12-certificaat (vertrouwde installatie)
```

Het bestand wordt per gebruiker gegenereerd — e-mailadres, gebruikersnaam en sleutels worden ingevuld. Ondertekening met een vertrouwd certificaat voorkomt de "Niet-geverifieerde profiel"-waarschuwing op iOS.

---

## 4 — Modulesysteem (gebruikersapp)

Elke module is een onafhankelijke sectie in de app, aangedreven door een eigen API-endpoint. Modules worden geladen op basis van gebruikersrechten en configuratie.

### Navigatiestructuur

```
app.cbrains.de
│
├── 📊  Dashboard          Overzicht: recente docs, deadlines, AI-tips, meldingen
├── 📁  Bestanden          Paperless-ngx integratie — bladeren, zoeken, uploaden
├── 📸  Foto's             Immich API — persoonlijk fotoarchief
├── 📧  Mail               Embedded IMAP-client (lezen, versturen)
├── 📅  Kalender           CalDAV — afspraken, herhalingen, gedeelde agenda's
├── ✅  Taken              Takenlijst met deadlines en herinneringen
├── 📝  Notities           Vrije tekst, gekoppeld aan dossiers of documenten
├── 🏢  Correspondenten    Adresboek van organisaties en personen
├── 📂  Dossiers           Gegroepeerde documenten per onderwerp of zaak
└── ⚙️  Instellingen       Profiel, notificaties, telefoonnummers, thema
```

### Bouwvolgorde

```
A (nu) → Dashboard + Documenten + Instellingen
B       → Mail (IMAP-integratie)
C       → Signal tickets + bevestigingsflow
D       → Rollen, audit trail, 2FA
E       → Foto's (Immich), Kalender, Taken
F       → Notities, Correspondenten, Dossiers
G       → PWA + Push-notificaties
H       → mobileconfig-generator
```

---

## 5 — Documentcategorieën & -types

De volgende taxonomie stuurt Paperless-tags, AI-classificatie (paperless-gpt) en de dashboardindeling.

### 👤 Profiel

| Type | Voorbeelden |
|---|---|
| Persoonlijke gegevens | BSN, DigiD, geboorteakte |
| 🏠 Adres | Inschrijvingsbewijs, verhuisbericht |
| 📞 Telefoonnummers | SIM-overeenkomsten, nummerbehoud |
| 🏦 Bankrekeningen | IBAN-overzicht, rekeningkoppelingen |
| 🪪 Identiteitsdocumenten | Paspoort, rijbewijs, verblijfsvergunning |

### 👨‍👩‍👧 Familie

| Type | Voorbeelden |
|---|---|
| Familieleden | Geboorteaktes, huwelijksakte |
| 🎒 Onderwijs & Opvang | Schoolinschrijvingen, kinderopvang |
| 🎂 Familiekalender | Verjaardagen, jubilea |

### 💰 Financieel

| Type | Voorbeelden |
|---|---|
| 💳 Transacties | Betalingsbewijzen, kassabonnen |
| 🏦 Bankafschriften | Maandoverzichten per rekening |
| 📊 Schuldenoverzicht | Leningen, schuldsanering |
| 📅 Begroting | Maand- en jaarbudget |
| 🏦 Spaaroverzicht | Spaarrekeningen, doelen |
| 📈 Investeringen | Portefeuille, dividenden |
| 💎 Nettovermogen | Periodieke vermogensstaat |
| 🏦 Pensioen | AOW, pensioenopgaven (NL + DE), prognose |
| 🧾 Belasting | Aangiften, aanslagen, teruggave |

### 📜 Contracten & Abonnementen

| Type | Voorbeelden |
|---|---|
| 📜 Contracten | Huur, koop, dienstverband |
| 📦 Abonnementen | Telecom, streaming, software |
| 🤖 AI Aanbevelingen | Goedkopere alternatieven, opzegtips |
| 💳 Betalingsregelingen | Termijnplannen, incasso-machtigingen |

### 📂 Dossiers & Akten

| Type | Voorbeelden |
|---|---|
| 📮 Correspondentie | Brieven, e-mails, aangetekende post |
| 🔗 Track & Trace | Verzendstatus, aangetekend volgen |
| 📎 Bewijsstukken | Foto's, screenshots, getuigenverklaringen |
| 📋 Dossier Acties | Openstaande stappen per dossier |
| 👥 Betrokken Partijen | Advocaten, instanties, tegenpartijen |
| 🕐 Tijdlijn | Chronologisch overzicht per zaak |

### 🚗 Voertuigen

| Type | Voorbeelden |
|---|---|
| 🔢 Kentekenhistorie | RDW-geschiedenis (NL), KBA (DE) |
| 🛡️ eVB Nummer | Tijdelijke verzekeringsdekking (DE) |
| 🛡️ Verzekeringen | Polissen, groene kaart, claim-history |
| 📋 Voertuigdocumenten | Kentekenbewijs, APK, TÜV |
| 🔧 Onderhoud | Servicehistorie, reparaties |
| ⛽ Brandstof / Laad | Verbruikslog per tank of laadbeurt |
| 🚗 Wegenbelasting | Kfz-Steuer (DE), motorrijtuigenbelasting (NL) |
| 🕐 Voertuig Tijdlijn | Overzicht per voertuig |

### 🏥 Medisch

| Type | Voorbeelden |
|---|---|
| 🛡️ Zorgverzekering | Polis, aanvullend pakket, vergoedingen |
| 👨‍⚕️ Zorgaanbieders | Huisarts, specialist, tandarts |
| 💊 Medicatie | Recepten, gebruiksaanwijzingen |
| 🏥 Afspraken | Verwijsbrieven, uitslagen, ontslagbrieven |
| 💶 Declaraties | Ingediende en vergoede nota's |

### 🛡️ Verzekeringen

| Type | Voorbeelden |
|---|---|
| Polissen | Aansprakelijkheid, inboedel, reis, leven |
| 📋 Schadeclaims | Lopende en afgeronde claims |

### 🏠 Onroerend Goed

| Type | Voorbeelden |
|---|---|
| 📋 Huurcontract / Hypotheek | Overeenkomst, aflossingsoverzicht |
| 🏢 VvE / WEG | Notulen, bijdragen, reservefonds |
| 📊 WOZ / Grundsteuer | Aanslagen, bezwaar |

### 🏛️ Overheid & Recht

| Type | Voorbeelden |
|---|---|
| Overheidsaanvragen | Toeslagen, subsidies, uitkeringen |
| ✅ Goedkeuringen | Vergunningen, beschikkingen |
| 🔐 Machtigingen | Volmachten, toestemmingsverklaringen |

### 🤖 AI-modules

| Module | Functie |
|---|---|
| 💡 AI Tips | Proactieve suggesties op basis van documentanalyse |
| 📊 AI Analyse | Financieel patroonherkenning, abonnementsscan |
| 🤖 Abonnement-aanbevelingen | Goedkopere alternatieven detecteren |
| 📋 AI Taaksuggesties | Openstaande acties uit documenten extraheren |

### 🔔 Systeem

| Module | Functie |
|---|---|
| 🔔 Notificaties Log | Alle Signal- en push-meldingen |
| 🗂️ Activiteit Log | Gebruikersacties en documentmutaties |
| ⚙️ Systeemstatus | Status van verbonden services |

---

## 6 — Admin Dashboard

Het beheerpaneel voor platformbeheerders.

### Modules

| Module | Functie |
|---|---|
| 👥 Users | Gebruikersbeheer, onboarding, rechten |
| 🏥 Systeem Health | Docker-containerstatus, disk, geheugen, CPU |
| 📡 Systeem Metrics | Requestaantallen, foutpercentages, latency |
| 💰 Financieel Totaal | Geaggregeerde inzichten over alle gebruikers |
| 📁 Document Pipeline | Paperless-ingestion stats, GPT-verwerkingsstatus |
| 🚨 Anomalieën | Afwijkende patronen automatisch gedetecteerd |
| 🌍 Cross-user Patronen | Terugkerende issues over gebruikers heen |
| 🔄 Onboarding Pipeline | Stappen en status per nieuwe gebruiker |
| 🔚 Offboarding Pipeline | Datexport, account-verwijdering, archivering |
| 🔧 Verbetervoorstellen | AI-suggesties voor platformoptimalisatie |
| 🔍 Review Queue | Documenten die handmatige beoordeling vereisen |
| ⚠️ Pipeline Fouten | Mislukte GPT-jobs, import-errors, retries |
| 💾 Backup Log | Status dagelijkse backups per component |
| 📦 Exports Log | Gebruikersexports, GDPR-verzoeken |
| 📊 AI Bedrijfsanalyse | Inzichten over platform-breed gebruik |
| ⚖️ Verwerkingsregister | GDPR-verwerkingsactiviteiten (Art. 30 AVG) |
| 🗂️ Audit Log | Alle admin-acties met timestamp en gebruiker |

---

## Implementatievolgorde

| Fase | Scope | Status |
|---|---|---|
| A | Dashboard, Documenten, Instellingen, Signal | ✅ Gereed |
| B | Mail-integratie (IMAP-embedded) | 🔜 Volgende |
| C | Signal tickets + bevestigingsflow | 🔜 |
| D | Rollen, audit trail, 2FA | 🔜 |
| **paperless-gpt** | AI-tagging + categorisatie | 🔜 |
| E | Foto's (Immich), Kalender, Taken | 🔜 |
| F | Notities, Correspondenten, Dossiers | 🔜 |
| G | PWA + Push-notificaties | 🔜 |
| H | mobileconfig-generator | 🔜 |
| I | Admin-uitbreiding (metrics, GDPR, audit) | 🔜 |
