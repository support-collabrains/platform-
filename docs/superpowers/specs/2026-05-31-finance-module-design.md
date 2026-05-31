# Finance Module — Design Spec

**Datum:** 2026-05-31  
**Status:** Goedgekeurd

---

## Doel

Een self-hosted finance module die facturen en abonnementen automatisch herkent uit Paperless en IMAP-mail via Ollama LLM-extractie, een review-wachtrij biedt voor correctie, en maandelijkse overzichten toont. Abonnement-alerts gaan via Signal, portal en de bestaande Diggi proactieve agent.

---

## Architectuur

### Databronnen → extractie-pipeline

1. **Paperless** — bij elke nieuwe `DocDocument` in de bestaande `documents` queue wordt de documenttekst via de Paperless API opgehaald en naar `FinanceExtractorService` gestuurd
2. **IMAP mail** — een nieuwe `FinanceMailPollerService` draait elke 15 minuten, scant INBOX op berichten met financiële kenmerken (factuur/rekening/abonnement in onderwerp, PDF-bijlage), en stuurt relevante tekst naar de extractor
3. **Handmatig** — gebruiker voert transactie in via portal

### Extractie (Ollama)

`FinanceExtractorService.extract(text, source)` stuurt tekst naar Ollama (`llama3.1:8b`) met een strak JSON-prompt. Output:

```ts
interface ExtractedTransaction {
  leverancier: string;
  bedrag: number;           // in euros, negatief = uitgave
  datum: string;            // YYYY-MM-DD
  categorie: Categorie;
  type: 'eenmalig' | 'abonnement';
  interval?: 'maandelijks' | 'kwartaal' | 'jaarlijks';
  opzegtermijn_dagen?: number;
  confidence: number;       // 0-1
}
```

Resultaat wordt opgeslagen als `FinanceTransaction` met `status: 'pending'` (review-wachtrij).

### Database — 2 nieuwe tabellen

**`finance_transactions`**
- `id` (uuid), `owner` (username), `source` ('paperless' | 'mail' | 'manual')
- `sourceRef` (paperless doc id of mail uid, nullable)
- `leverancier`, `bedrag` (decimal 10,2), `datum` (date)
- `categorie` (enum), `type` ('eenmalig' | 'abonnement')
- `status` ('pending' | 'approved' | 'rejected')
- `notes` (nullable), `createdAt`

**`finance_subscriptions`**
- `id` (uuid), `owner`, `transactionId` (nullable FK → finance_transactions)
- `naam`, `bedrag` (decimal 10,2), `interval` (enum)
- `volgendeBetaaldatum` (date), `opzegtermijnDagen` (int default 30)
- `actief` (boolean default true), `createdAt`

### Categorieën (vaste lijst)

`Wonen | Boodschappen | Abonnementen | Verzekeringen | Transport | Gezondheid | Overig`

---

## API endpoints (NestJS, onder `/me/finance/`)

| Method | Path | Beschrijving |
|--------|------|--------------|
| GET | `/me/finance/summary` | Maandtotalen laatste 6 maanden + actieve abonnementen teller |
| GET | `/me/finance/transactions` | Lijst transacties (filter: status, categorie, maand) |
| POST | `/me/finance/transactions` | Handmatig toevoegen |
| PATCH | `/me/finance/transactions/:id` | Corrigeren + goedkeuren/afwijzen |
| DELETE | `/me/finance/transactions/:id` | Verwijderen |
| GET | `/me/finance/subscriptions` | Abonnementenlijst |
| POST | `/me/finance/subscriptions` | Handmatig abonnement toevoegen |
| PATCH | `/me/finance/subscriptions/:id` | Bewerken |
| DELETE | `/me/finance/subscriptions/:id` | Verwijderen |

---

## Portal UI (3 views onder `/dashboard/finance`)

### 1. Overzicht (standaard)
- 3 stat-tiles: *Uitgaven deze maand*, *Abonnementen (maandlast)*, *Te controleren (badge)*
- Staafgrafiek uitgaven per maand (6 maanden), kleuren per categorie — CSS-only, geen chart library
- Lijst laatste 5 transacties

### 2. Transacties-tab
- Tabs: Alle | Te controleren | Abonnementen
- Per rij: leverancier, bedrag, datum, categorie-chip, bron-icoon, status-badge
- Inline review: goedkeuren-knop, correctie-formulier (leverancier, bedrag, categorie)
- Floating "+" knop voor handmatige invoer

### 3. Abonnementen-tab
- Kaartjes: naam, bedrag/interval, volgende betaaldatum, opzegtermijn-indicator (groen/oranje/rood)
- Alert-banner als opzegtermijn binnen 14 dagen
- Handmatig toevoegen/bewerken

### Sidebar
- Nieuw nav-item **Finance** (euro-icoon) tussen Taken en Mail
- Badge met aantal pending reviews

---

## Alerts & integraties

- **Signal**: `FinanceAlertService` stuurt bericht via bestaande `NotificationsService` als `volgendeBetaaldatum - opzegtermijnDagen ≤ 14 dagen`
- **Diggi proactive scan**: `ProactiveService.scanUser()` krijgt een extra stap die `FinanceAlertService.checkUser(username)` aanroept — abonnement-alerts verschijnen als `ProactiveHint`
- **Portal badge**: `/me/finance/summary` geeft `pendingCount` terug; Sidebar toont dit als badge

---

## Niet in scope (bewust weggelaten)

- Inkomsten bijhouden (alleen uitgaven)
- Bank-koppeling / OFX / CSV import
- Budgetten instellen
- Multi-currency
- Belastingaangifte export

---

## Testbare eenheden

- `FinanceExtractorService.extract()` — mock Ollama, verifieer JSON-parsing + fallback bij lege response
- `FinanceMailPollerService.isFinancialMail()` — unit test op onderwerp-keywords + bijlage-detectie
- `FinanceAlertService.getUpcomingDeadlines()` — datum-logica met vaste testdata
- API endpoints — integration tests met echte PostgreSQL (conform project-conventie: geen mocks)
