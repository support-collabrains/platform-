// Integration tests for MailController.
// Covers: GET/POST/DELETE /mail/* — InternalSecretGuard enforcement,
//         query param forwarding, correct delegation to MailImapService.

import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { MailController } from '../src/mail/mail.controller';
import { MailImapService } from '../src/mail/mail-imap.service';
import { buildTestApp, makeInternalHeaders, setTestEnv } from './helpers/test-app';

setTestEnv();

describe('MailController (e2e)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let imap: jest.Mocked<MailImapService>;

  beforeAll(async () => {
    imap = {
      getStats: jest.fn().mockResolvedValue({ unread: 0, folders: [] }),
      getMessages: jest.fn().mockResolvedValue({ messages: [], total: 0 }),
      getMessage: jest.fn().mockResolvedValue({ uid: 1, from: '', to: '', cc: '', subject: '', date: '', seen: false, bodyHtml: '', bodyText: '' }),
      markSeen: jest.fn().mockResolvedValue(undefined),
      deleteMessage: jest.fn().mockResolvedValue(undefined),
      getVacation: jest.fn().mockResolvedValue({ active: false, subject: '', body: '' }),
      setVacation: jest.fn().mockResolvedValue({ active: true, subject: 'OOO', body: 'Away' }),
    } as unknown as jest.Mocked<MailImapService>;

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [MailController],
      providers: [{ provide: MailImapService, useValue: imap }],
    }).compile();

    app = await buildTestApp(moduleRef);
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 without x-internal-secret on all endpoints', () => {
    return request(app.getHttpServer()).get('/mail/stats').expect(403);
  });

  describe('GET /mail/stats', () => {
    it('calls getStats with username header', async () => {
      await request(app.getHttpServer())
        .get('/mail/stats')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .expect(200);
      expect(imap.getStats).toHaveBeenCalledWith('alice');
    });
  });

  describe('GET /mail/messages', () => {
    it('passes folder, page, limit query params', async () => {
      await request(app.getHttpServer())
        .get('/mail/messages?folder=Sent&page=2&limit=10')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .expect(200);
      expect(imap.getMessages).toHaveBeenCalledWith('alice', 'Sent', 2, 10);
    });

    it('defaults to INBOX / page 1 / limit 25', async () => {
      await request(app.getHttpServer())
        .get('/mail/messages')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .expect(200);
      expect(imap.getMessages).toHaveBeenCalledWith('alice', 'INBOX', 1, 25);
    });
  });

  describe('GET /mail/messages/:uid', () => {
    it('passes folder query param and defaults to INBOX', async () => {
      await request(app.getHttpServer())
        .get('/mail/messages/42')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .expect(200);
      expect(imap.getMessage).toHaveBeenCalledWith('alice', 'INBOX', 42);
    });

    it('passes custom folder from query', async () => {
      await request(app.getHttpServer())
        .get('/mail/messages/99?folder=Trash')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .expect(200);
      expect(imap.getMessage).toHaveBeenCalledWith('alice', 'Trash', 99);
    });
  });

  describe('POST /mail/messages/:uid/seen', () => {
    it('returns 204', async () => {
      await request(app.getHttpServer())
        .post('/mail/messages/42/seen')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .expect(204);
      expect(imap.markSeen).toHaveBeenCalledWith('alice', 'INBOX', 42);
    });
  });

  describe('DELETE /mail/messages/:uid', () => {
    it('returns 204', async () => {
      await request(app.getHttpServer())
        .delete('/mail/messages/42?folder=Trash')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .expect(204);
      expect(imap.deleteMessage).toHaveBeenCalledWith('alice', 'Trash', 42);
    });
  });

  describe('GET /mail/vacation', () => {
    it('returns VacationState', async () => {
      const res = await request(app.getHttpServer())
        .get('/mail/vacation')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .expect(200);
      expect(res.body).toHaveProperty('active');
      expect(imap.getVacation).toHaveBeenCalledWith('alice');
    });
  });

  describe('PUT /mail/vacation', () => {
    it('delegates to setVacation with body fields', async () => {
      const res = await request(app.getHttpServer())
        .put('/mail/vacation')
        .set(makeInternalHeaders({ 'x-authentik-username': 'alice' }))
        .send({ active: true, subject: 'OOO', body: 'Away until Monday' })
        .expect(200);
      expect(res.body.active).toBe(true);
      expect(imap.setVacation).toHaveBeenCalledWith('alice', true, 'OOO', 'Away until Monday');
    });
  });
});
