// Shared helpers for e2e controller tests.
// Creates a minimal NestJS test app with all external services mocked.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';

export function makeInternalHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'x-internal-secret': 'test-secret',
    'x-authentik-username': 'alice',
    'x-authentik-groups': '',
    ...overrides,
  };
}

export function makeAdminHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  return makeInternalHeaders({ 'x-authentik-groups': 'platform-admins', ...overrides });
}

export function makeWebhookHeaders(): Record<string, string> {
  return { authorization: 'Bearer test-webhook-secret' };
}

export function mockRepo<T = object>(): jest.Mocked<{
  find: jest.Mock; findOne: jest.Mock; findBy: jest.Mock;
  save: jest.Mock; create: jest.Mock; remove: jest.Mock;
  count: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock;
}> {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findBy: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((v: T) => Promise.resolve(v)),
    create: jest.fn().mockImplementation((v: Partial<T>) => v),
    remove: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: null }),
    }),
  } as unknown as jest.Mocked<typeof Object>;
}

export function mockService<T extends object>(methods: (keyof T)[]): jest.Mocked<T> {
  const obj: Record<string, jest.Mock> = {};
  for (const m of methods) obj[m as string] = jest.fn().mockResolvedValue(undefined);
  return obj as jest.Mocked<T>;
}

/** Set required env vars for auth guards before creating the app */
export function setTestEnv(): void {
  process.env.INTERNAL_API_SECRET = 'test-secret';
  process.env.AUTHENTIK_WEBHOOK_SECRET = 'test-webhook-secret';
  process.env.PRIMARY_DOMAIN = 'test.com';
  process.env.MAIL_DOMAIN = 'mail.test.com';
}

/**
 * Creates a NestJS testing app from a pre-built TestingModule.
 * Applies ValidationPipe and sets test env vars.
 */
export async function buildTestApp(module: TestingModule): Promise<INestApplication> {
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export { TestingModule, INestApplication };
