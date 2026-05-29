// Integration tests for UsersMeController.
// Covers: all /users/me/* endpoints — guard enforcement, header propagation, response shapes,
//         preferences update (audit logging), audit, tickets CRUD.

import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { UsersMeController } from '../src/users-me/users-me.controller';
import { UsersMeService } from '../src/users-me/users-me.service';
import { TicketsService } from '../src/tickets/tickets.service';
import { AuditService } from '../src/audit/audit.service';
import { buildTestApp, makeInternalHeaders, mockService, setTestEnv } from './helpers/test-app';

setTestEnv();

describe('UsersMeController (e2e)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let service: jest.Mocked<UsersMeService>;
  let tickets: jest.Mocked<TicketsService>;
  let audit: jest.Mocked<AuditService>;

  const baseUser = { pk: 1, username: 'alice', name: 'Alice', email: 'a@t.com', groups_obj: [], attributes: { language: 'nl' } };

  beforeAll(async () => {
    service = {
      getProfile: jest.fn().mockResolvedValue({ username: 'alice', email: 'a@t.com', name: 'Alice', role: 'user', totpEnabled: false }),
      resolveUser: jest.fn().mockResolvedValue(baseUser),
      getDocuments: jest.fn().mockResolvedValue([]),
      getNotifications: jest.fn().mockResolvedValue([]),
      getPhonesFromAttributes: jest.fn().mockReturnValue([]),
      parsePreferences: jest.fn().mockReturnValue({ signal_doc_notify: true, signal_digest_mode: false, language: 'nl' }),
      updatePreferences: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UsersMeService>;

    tickets = {
      getTicketsForUser: jest.fn().mockResolvedValue([]),
      updateTicket: jest.fn().mockResolvedValue(true),
      deleteTicket: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<TicketsService>;

    audit = {
      log: jest.fn().mockResolvedValue(undefined),
      getForUser: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<AuditService>;

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [UsersMeController],
      providers: [
        { provide: UsersMeService, useValue: service },
        { provide: TicketsService, useValue: tickets },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    app = await buildTestApp(moduleRef);
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => jest.clearAllMocks());

  // ── All endpoints require InternalSecretGuard ──────────────────────────────

  it('returns 403 when x-internal-secret is missing (profile)', () => {
    return request(app.getHttpServer()).get('/users/me/profile').expect(403);
  });

  // ── GET /users/me/profile ──────────────────────────────────────────────────

  describe('GET /users/me/profile', () => {
    it('returns profile object', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me/profile')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .expect(200);
      expect(res.body).toMatchObject({ username: 'alice', role: 'user' });
    });

    it('passes groups header to service', async () => {
      await request(app.getHttpServer())
        .get('/users/me/profile')
        .set(makeInternalHeaders({ 'x-authentik-groups': 'platform-admins' }))
        .expect(200);
      expect(service.getProfile).toHaveBeenCalledWith(expect.any(String), 'platform-admins');
    });
  });

  // ── GET /users/me/documents ────────────────────────────────────────────────

  describe('GET /users/me/documents', () => {
    it('returns { docs } array', async () => {
      service.getDocuments.mockResolvedValueOnce([{ id: 1, title: 'Invoice', created: '2024' }] as never);
      const res = await request(app.getHttpServer())
        .get('/users/me/documents')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .expect(200);
      expect(Array.isArray(res.body.docs)).toBe(true);
    });
  });

  // ── GET /users/me/notifications ────────────────────────────────────────────

  describe('GET /users/me/notifications', () => {
    it('returns { notifications } array', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me/notifications')
        .set(makeInternalHeaders())
        .expect(200);
      expect(Array.isArray(res.body.notifications)).toBe(true);
    });
  });

  // ── GET /users/me/preferences ──────────────────────────────────────────────

  describe('GET /users/me/preferences', () => {
    it('returns preference object', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me/preferences')
        .set(makeInternalHeaders())
        .expect(200);
      expect(res.body).toHaveProperty('signal_doc_notify');
      expect(res.body).toHaveProperty('language');
    });
  });

  // ── PATCH /users/me/preferences ────────────────────────────────────────────

  describe('PATCH /users/me/preferences', () => {
    it('updates preferences and records audit', async () => {
      await request(app.getHttpServer())
        .patch('/users/me/preferences')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .send({ signal_doc_notify: false })
        .expect(200);
      expect(service.updatePreferences).toHaveBeenCalledWith('alice', { signal_doc_notify: false });
      expect(audit.log).toHaveBeenCalledWith('alice', 'prefs.update', undefined, expect.any(Object));
    });
  });

  // ── GET /users/me/audit ────────────────────────────────────────────────────

  describe('GET /users/me/audit', () => {
    it('returns { events } array', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me/audit')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .expect(200);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(audit.getForUser).toHaveBeenCalledWith('alice');
    });
  });

  // ── GET /users/me/tickets ──────────────────────────────────────────────────

  describe('GET /users/me/tickets', () => {
    it('returns { tickets } for current user', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me/tickets')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .expect(200);
      expect(Array.isArray(res.body.tickets)).toBe(true);
      expect(tickets.getTicketsForUser).toHaveBeenCalledWith('alice');
    });
  });

  // ── PATCH /users/me/tickets/:id ────────────────────────────────────────────

  describe('PATCH /users/me/tickets/:id', () => {
    it('marks ticket done and records audit', async () => {
      const res = await request(app.getHttpServer())
        .patch('/users/me/tickets/t1')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .send({ status: 'done' })
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(audit.log).toHaveBeenCalledWith('alice', 'ticket.done', 't1');
    });
  });

  // ── DELETE /users/me/tickets/:id ───────────────────────────────────────────

  describe('DELETE /users/me/tickets/:id', () => {
    it('removes ticket and returns { ok: true }', async () => {
      const res = await request(app.getHttpServer())
        .delete('/users/me/tickets/t1')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(tickets.deleteTicket).toHaveBeenCalledWith('t1', 'alice');
    });
  });
});
