# Roles, Audit Trail & 2FA (Subsystem D) — Design Spec

**Goal:** Add role-based access control, a full audit trail, and 2FA status visibility to the platform.

---

## 1 — Roles

Authentik is the identity source. The forward-auth proxy injects `x-authentik-groups` (comma-separated group names) into every request to the portal and API.

**Groups:**
| Group | Role |
|---|---|
| `platform-admins` | Full admin access |
| _(none / other)_ | Regular user |

**API guard:** `RolesGuard` reads `x-authentik-groups` and rejects requests not matching the required role. Applies to admin-facing endpoints.

**Admin endpoints (new, user-facing, protected by RolesGuard):**
```
GET  /admin/users              → list users with roles + 2fa status
PATCH /admin/users/:pk/role   → { role: 'admin' | 'user' }  set group membership
GET  /admin/audit              → last 100 audit events (all users)
```

**Portal:** Dashboard shows role badge. Admin users see an "Beheer" link. `ProfilePanel` component shows username, email, role, 2FA status.

---

## 2 — Audit Trail

**Table:** `audit_events`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `actor` | varchar | Authentik username performing the action |
| `action` | varchar | Namespaced action string (see below) |
| `target` | varchar \| null | What was affected (username, ticket id, etc.) |
| `metadata` | jsonb | Extra context |
| `createdAt` | timestamptz | |

**Action strings:**
| Action | When |
|---|---|
| `prefs.update` | User updates preferences |
| `ticket.create` | Signal ticket confirmed |
| `ticket.done` | Ticket marked done |
| `ticket.cancel` | Ticket cancelled |
| `user.create` | Admin creates user |
| `user.delete` | Admin deletes user |
| `role.set` | Admin changes user role |

**API endpoints:**
```
GET /users/me/audit      → last 20 audit events for this user
GET /admin/audit         → last 100 events (all users) — admin only
```

---

## 3 — 2FA

Authentik tracks TOTP devices via `GET /api/v3/authenticators/totp/?user=<pk>`.

**API:**
```
GET /users/me/profile
Response: {
  username: string,
  email: string,
  name: string,
  role: 'admin' | 'user',
  totpEnabled: boolean
}
```

**Portal:** `ProfilePanel` component shows:
- Avatar + name + username badge
- Role chip (`Beheerder` / `Gebruiker`)
- 2FA status: enabled (green) or not enabled (amber) + "Instellen →" link to Authentik user settings
