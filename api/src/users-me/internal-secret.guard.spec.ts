import { ExecutionContext } from '@nestjs/common';
import { InternalSecretGuard } from './internal-secret.guard';

function mockCtx(secret: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-internal-secret': secret } }),
    }),
  } as unknown as ExecutionContext;
}

describe('InternalSecretGuard', () => {
  let guard: InternalSecretGuard;

  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = 'test-secret-abc';
    guard = new InternalSecretGuard();
  });

  it('allows correct secret', () => {
    expect(guard.canActivate(mockCtx('test-secret-abc'))).toBe(true);
  });

  it('blocks wrong secret', () => {
    expect(guard.canActivate(mockCtx('wrong'))).toBe(false);
  });

  it('blocks missing secret', () => {
    expect(guard.canActivate(mockCtx(''))).toBe(false);
  });
});
