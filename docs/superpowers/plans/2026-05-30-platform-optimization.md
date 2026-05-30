# Platform Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully optimize the CollaBrains platform with PWA support, unified API gateway (Paperless + Immich proxies), document AI categorization (10 categories), web push notifications, LDAP self-service profile editing, and GitHub Actions CI/CD.

**Architecture:** The existing NestJS 11 backend (Express adapter — keep as-is, Fastify migration too risky) gains: GatewayModule (dashboard aggregation + Paperless/Immich proxies), PushModule (web-push subscriptions), and enhanced DocumentsService (AI category tagging + push notification). The Next.js 16 portal gains PWA (next-pwa), profile phone/archive-path editing. Infrastructure gets missing healthchecks, updated .env.example, and GitHub Actions.

**Tech Stack:** NestJS 11 (Express, TypeORM), Next.js 16 (App Router, Tailwind v4), BullMQ, web-push, @ducanh2912/next-pwa, GitHub Actions, Docker Compose v2

**Key decisions:**
- Keep Express adapter (not Fastify) — SSE in bootstrap module + existing middleware would need full refactor
- Document AI tagging runs using existing OllamaService with new category prompt (in addition to paperless-gpt)
- Push subscriptions stored in PostgreSQL via new TypeORM entity PushSubscription
- LDAP profile PATCH reuses existing LdapMetadataService.setAttributes()

---

## Tasks

### Task 1: Backend Push Notifications Module
### Task 2: Backend Gateway Module
### Task 3: Backend LDAP Profile PATCH
### Task 4: Backend Document AI Category Tagging
### Task 5: Frontend PWA Setup
### Task 6: Frontend Profile LDAP Editing
### Task 7: Infrastructure Docker + .env.example + CI/CD
### Task 8: Frontend API Proxy Routes
