// Integration tests for UsersController (webhook endpoint).
// Covers: POST /webhook/authentik — token validation, model_created routing,
//         other event types ignored, missing pk handled gracefully.

import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { buildTestApp, setTestEnv } from './helpers/test-app';

setTestEnv();

describe('UsersController / webhook (e2e)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let usersService: jest.Mocked<UsersService>;

  beforeAll(async () => {
    usersService = { onboardUser: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<UsersService>;

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    app = await buildTestApp(moduleRef);
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => jest.clearAllMocks());

  describe('POST /webhook/authentik', () => {
    it('returns 401 when token query param is wrong', () => {
      return request(app.getHttpServer())
        .post('/webhook/authentik?token=wrong')
        .send({})
        .expect(401);
    });

    it('returns 401 when token is missing', () => {
      return request(app.getHttpServer())
        .post('/webhook/authentik')
        .send({})
        .expect(401);
    });

    it('returns { ok: true } for valid token', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhook/authentik?token=test-webhook-secret')
        .send({})
        .expect(201);
      expect(res.body.ok).toBe(true);
    });

    it('calls onboardUser when action=model_created and model_name=user', async () => {
      await request(app.getHttpServer())
        .post('/webhook/authentik?token=test-webhook-secret')
        .send({ event: { action: 'model_created', context: { model: { pk: 42, model_name: 'user' } } } })
        .expect(201);
      // onboardUser is called async (fire-and-forget), wait a tick
      await new Promise((r) => setImmediate(r));
      expect(usersService.onboardUser).toHaveBeenCalledWith(42);
    });

    it('does not call onboardUser for non-model_created events', async () => {
      await request(app.getHttpServer())
        .post('/webhook/authentik?token=test-webhook-secret')
        .send({ event: { action: 'model_updated', context: { model: { pk: 42, model_name: 'user' } } } })
        .expect(201);
      await new Promise((r) => setImmediate(r));
      expect(usersService.onboardUser).not.toHaveBeenCalled();
    });

    it('does not call onboardUser when pk is missing', async () => {
      await request(app.getHttpServer())
        .post('/webhook/authentik?token=test-webhook-secret')
        .send({ event: { action: 'model_created', context: { model: { model_name: 'user' } } } })
        .expect(201);
      await new Promise((r) => setImmediate(r));
      expect(usersService.onboardUser).not.toHaveBeenCalled();
    });

    it('handles missing event payload gracefully', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhook/authentik?token=test-webhook-secret')
        .send({ something: 'else' })
        .expect(201);
      expect(res.body.ok).toBe(true);
    });
  });
});
