# Signal Tickets + Bevestigingsflow (Subsystem C) — Design Spec

**Goal:** Let users create to-do tickets via Signal messages, with a mandatory confirmation step before the ticket is saved. Tickets are visible in the dashboard and can be marked done.

**Architecture:** The existing `pollSignal` loop in `DocumentsService` is extended to recognise ticket commands and route them to `TicketsService`. A new `signal_tickets` table stores tickets. The `/users/me/tickets` REST endpoint serves the dashboard.

**Tech Stack:** TypeORM entity, NestJS service/module, Next.js server component (dashboard card).

---

## Signal Commands

| Command | Language | Action |
|---|---|---|
| `/taak [beschrijving]` | nl | Create ticket (pending confirm) |
| `/aufgabe [beschreibung]` | de | Create ticket (pending confirm) |
| `/task [description]` | en | Create ticket (pending confirm) |
| `/taken` | nl | List open tickets |
| `/aufgaben` | de | List open tickets |
| `/tasks` | en | List open tickets |
| `/klaar [nr]` | nl | Mark ticket #nr done |
| `/fertig [nr]` | de | Mark ticket #nr done |
| `/done [nr]` | en | Mark ticket #nr done |
| `✅` | all | Confirm pending ticket (or existing doc-summary flow) |
| `❌` | all | Cancel pending ticket |

`✅` priority: pending ticket **first**, then pending document notification (preserves existing behaviour).

---

## Database

**Table:** `signal_tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `owner` | varchar | Authentik username |
| `phone` | varchar | Phone that created the ticket |
| `title` | varchar | Ticket description |
| `seq` | int | Per-user sequential number (1, 2, 3 …) for `/klaar 3` |
| `status` | varchar | `pending_confirm` \| `open` \| `done` \| `cancelled` |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

---

## API

All under `InternalAuthGuard` (`x-internal-secret` + `x-authentik-uid`).

```
GET  /users/me/tickets            → { tickets: Ticket[] }
PATCH /users/me/tickets/:id       → { ok: true }   body: { status: 'done' | 'open' }
DELETE /users/me/tickets/:id      → { ok: true }
```

---

## Signal Reply Messages

### Ticket created (pending confirm)

```
nl: 📌 Nieuwe taak aangemaakt:
[beschrijving]

Stuur ✅ om te bevestigen of ❌ om te annuleren.

de: 📌 Neue Aufgabe erstellt:
[beschreibung]

Sende ✅ zum Bestätigen oder ❌ zum Abbrechen.

en: 📌 New task created:
[description]

Send ✅ to confirm or ❌ to cancel.
```

### Ticket confirmed

```
nl: ✅ Taak #[seq] opgeslagen: [title]
de: ✅ Aufgabe #[seq] gespeichert: [title]
en: ✅ Task #[seq] saved: [title]
```

### Ticket cancelled

```
nl: ❌ Taak geannuleerd.
de: ❌ Aufgabe abgebrochen.
en: ❌ Task cancelled.
```

### List open tickets

```
nl: 📋 Openstaande taken:

#1 — Belastingaangifte doen
#2 — APK plannen
#3 — Factuur betalen

nl (geen): Geen openstaande taken.
```

### Mark done

```
nl: ✅ Taak #[seq] afgerond: [title]
nl (niet gevonden): ❌ Taak #[nr] niet gevonden.
```

---

## Portal Dashboard Card

New server component `TicketsList` added to `/dashboard/page.tsx` (between DocumentsList and NotificationLog).

Shows:
- List of open Signal tickets (title, seq number, date)
- "Geen taken" empty state
- Completed tickets not shown (keep it clean)
