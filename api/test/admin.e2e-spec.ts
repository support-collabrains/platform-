// Integration tests for AdminController.
// Covers: GET/POST /admin/users, DELETE /admin/users/:pk, PATCH /admin/users/:pk/role,
//         GET /admin/audit, GET /admin/tickets, PATCH /admin/apply-branding.
// Tests InternalSecretGuard + RolesGuard enforcement, webhook bearer token authorization.

import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import { UsersService } from '../src/users/users.service';
import { AuditService } from '../src/audit/audit.service';
import { TicketsService } from '../src/tickets/tickets.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { AuditEvent } from '../src/audit/audit.entity';
import { SignalTicket } from '../src/tickets/ticket.entity';
import { buildTestApp, makeAdminHeaders, makeInternalHeaders, makeWebhookHeaders, mockRepo, mockService, setTestEnv } from './helpers/test-app';

setTestEnv();

describe('AdminController (e2e)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let adminService: jest.Mocked<AdminService>;
  let usersService: jest.Mocked<UsersService>;
  let audit: jest.Mocked<AuditService>;
  let tickets: jest.Mocked<TicketsService>;
  let notifications: jest.Mocked<NotificationsService>;

  beforeAll(async () => {
    adminService = mockService<AdminService>(['listUsers', 'createUser', 'deleteUser', 'setRole', 'applyBranding', 'generateSetupLink']);
    adminService.listUsers.mockResolvedValue([]);
    adminService.createUser.mockResolvedValue({ pk: 10, setupLink: 'https://auth.test.com/setup/abc' });
    adminService.deleteUser.mockResolvedValue(undefined);
    adminService.setRole.mockResolvedValue(undefined);
    adminService.applyBranding.mockResolvedValue(undefined);

    usersService = mockService<UsersService>(['onboardUser']);

    audit = {
      log: jest.fn().mockResolvedValue(undefined),
      getAll: jest.fn().mockResolvedValue([]),
      getForUser: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<AuditService>;

    tickets = { listAll: jest.fn().mockResolvedValue([]) } as unknown as jest.Mocked<TicketsService>;
    notifications = { sendToNumber: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<NotificationsService>;

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: UsersService, useValue: usersService },
        { provide: AuditService, useValue: audit },
        { provide: TicketsService, useValue: tickets },
        { provide: NotificationsService, useValue: notifications },
        { provide: getRepositoryToken(AuditEvent), useValue: mockRepo() },
        { provide: getRepositoryToken(SignalTicket), useValue: mockRepo() },
      ],
    }).compile();

    app = await buildTestApp(moduleRef);
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => jest.clearAllMocks());

  // ── GET /admin/users ───────────────────────────────────────────────────────

  describe('GET /admin/users', () => {
    it('returns 401 when x-internal-secret header is missing', () => {
      return request(app.getHttpServer()).get('/admin/users').expect(403);
    });

    it('returns 403 when user is not admin', () => {
      return request(app.getHttpServer())
        .get('/admin/users')
        .set(makeInternalHeaders()) // no platform-admins in groups
        .expect(403);
    });

    it('returns 200 with { users } for authorized admin', async () => {
      adminService.listUsers.mockResolvedValueOnce([{ pk: 1, username: 'alice', name: 'Alice', email: 'a@t.com', isActive: true, role: 'user', totpEnabled: false }]);
      const res = await request(app.getHttpServer())
        .get('/admin/users')
        .set(makeAdminHeaders())
        .expect(200);
      expect(res.body).toHaveProperty('users');
      expect(Array.isArray(res.body.users)).toBe(true);
    });
  });

  // ── POST /admin/users ──────────────────────────────────────────────────────

  describe('POST /admin/users', () => {
    it('returns 401 when Authorization header is missing', () => {
      return request(app.getHttpServer())
        .post('/admin/users')
        .send({ username: 'bob', name: 'Bob', email: 'b@t.com' })
        .expect(401);
    });

    it('returns 401 when Authorization is wrong webhook secret', () => {
      return request(app.getHttpServer())
        .post('/admin/users')
        .set({ authorization: 'Bearer wrong-secret' })
        .send({ username: 'bob', name: 'Bob', email: 'b@t.com' })
        .expect(401);
    });

    it('returns 201 with { ok, pk, setupLink } for correct webhook secret', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/users')
        .set(makeWebhookHeaders())
        .send({ username: 'bob', name: 'Bob', email: 'b@t.com' })
        .expect(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.pk).toBe(10);
      expect(res.body.setupLink).toContain('auth.test.com');
    });

    it('calls usersService.onboardUser after adminService.createUser', async () => {
      await request(app.getHttpServer())
        .post('/admin/users')
        .set(makeWebhookHeaders())
        .send({ username: 'bob', name: 'Bob', email: 'b@t.com' })
        .expect(201);
      expect(usersService.onboardUser).toHaveBeenCalledWith(10);
    });

    it('sends Signal notification when phone is provided', async () => {
      await request(app.getHttpServer())
        .post('/admin/users')
        .set(makeWebhookHeaders())
        .send({ username: 'bob', name: 'Bob', email: 'b@t.com', phone: '+31611' })
        .expect(201);
      expect(notifications.sendToNumber).toHaveBeenCalledWith('+31611', expect.any(String));
    });

    it('does not send Signal when phone is absent', async () => {
      await request(app.getHttpServer())
        .post('/admin/users')
        .set(makeWebhookHeaders())
        .send({ username: 'bob', name: 'Bob', email: 'b@t.com' })
        .expect(201);
      expect(notifications.sendToNumber).not.toHaveBeenCalled();
    });

    it('records audit event user.create', async () => {
      await request(app.getHttpServer())
        .post('/admin/users')
        .set(makeWebhookHeaders())
        .send({ username: 'bob', name: 'Bob', email: 'b@t.com' })
        .expect(201);
      expect(audit.log).toHaveBeenCalledWith('system', 'user.create', 'bob');
    });
  });

  // ── DELETE /admin/users/:pk ────────────────────────────────────────────────

  describe('DELETE /admin/users/:pk', () => {
    it('returns 401 without webhook secret', () => {
      return request(app.getHttpServer()).delete('/admin/users/42').expect(401);
    });

    it('returns 204 on success', async () => {
      await request(app.getHttpServer())
        .delete('/admin/users/42')
        .set(makeWebhookHeaders())
        .expect(204);
      expect(adminService.deleteUser).toHaveBeenCalledWith(42);
    });

    it('records audit event user.delete', async () => {
      await request(app.getHttpServer())
        .delete('/admin/users/42')
        .set(makeWebhookHeaders())
        .expect(204);
      expect(audit.log).toHaveBeenCalledWith('system', 'user.delete', '42');
    });
  });

  // ── PATCH /admin/users/:pk/role ────────────────────────────────────────────

  describe('PATCH /admin/users/:pk/role', () => {
    it('returns 403 for non-admin', () => {
      return request(app.getHttpServer())
        .patch('/admin/users/5/role')
        .set(makeInternalHeaders())
        .send({ role: 'admin' })
        .expect(403);
    });

    it('returns 200 and calls setRole with correct role', async () => {
      const res = await request(app.getHttpServer())
        .patch('/admin/users/5/role')
        .set(makeAdminHeaders({ 'x-authentik-username': 'superadmin' }))
        .send({ role: 'admin' })
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(adminService.setRole).toHaveBeenCalledWith(5, 'admin');
    });

    it('records audit event role.set with role metadata', async () => {
      await request(app.getHttpServer())
        .patch('/admin/users/5/role')
        .set(makeAdminHeaders({ 'x-authentik-username': 'superadmin' }))
        .send({ role: 'user' })
        .expect(200);
      expect(audit.log).toHaveBeenCalledWith('superadmin', 'role.set', '5', { role: 'user' });
    });
  });

  // ── GET /admin/audit ───────────────────────────────────────────────────────

  describe('GET /admin/audit', () => {
    it('requires InternalSecretGuard + RolesGuard', () => {
      return request(app.getHttpServer()).get('/admin/audit').expect(403);
    });

    it('returns { events } for admin', async () => {
      audit.getAll.mockResolvedValueOnce([{ id: '1', actor: 'alice', action: 'login', target: null, metadata: null, createdAt: new Date() }] as unknown as ReturnType<typeof audit.getAll> extends Promise<infer T> ? T : never);
      const res = await request(app.getHttpServer())
        .get('/admin/audit')
        .set(makeAdminHeaders())
        .expect(200);
      expect(Array.isArray(res.body.events)).toBe(true);
    });
  });

  // ── GET /admin/tickets ─────────────────────────────────────────────────────

  describe('GET /admin/tickets', () => {
    it('requires InternalSecretGuard + RolesGuard', () => {
      return request(app.getHttpServer()).get('/admin/tickets').expect(403);
    });

    it('returns { tickets } for admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/tickets')
        .set(makeAdminHeaders())
        .expect(200);
      expect(Array.isArray(res.body.tickets)).toBe(true);
    });
  });

  // ── PATCH /admin/apply-branding ────────────────────────────────────────────

  describe('PATCH /admin/apply-branding', () => {
    it('returns 401 without webhook secret', () => {
      return request(app.getHttpServer()).patch('/admin/apply-branding').expect(401);
    });

    it('returns 200 and calls applyBranding', async () => {
      const res = await request(app.getHttpServer())
        .patch('/admin/apply-branding')
        .set(makeWebhookHeaders())
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(adminService.applyBranding).toHaveBeenCalled();
    });
  });
});
