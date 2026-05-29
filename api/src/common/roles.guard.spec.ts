// Covers: RolesGuard.canActivate (allow/deny/comma-separated groups), isAdmin helper

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard, isAdmin, ADMIN_GROUP } from './roles.guard';

function makeCtx(groups: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-authentik-groups': groups } }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard();
  });

  it('allows request when groups header contains platform-admins', () => {
    expect(guard.canActivate(makeCtx('platform-admins'))).toBe(true);
  });

  it('allows request when platform-admins is in a comma-separated list', () => {
    expect(guard.canActivate(makeCtx('other-group,platform-admins,another'))).toBe(true);
  });

  it('throws ForbiddenException when group is not in header', () => {
    expect(() => guard.canActivate(makeCtx('some-other-group'))).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when header is empty', () => {
    expect(() => guard.canActivate(makeCtx(''))).toThrow(ForbiddenException);
  });

  it('trims whitespace from group names', () => {
    expect(guard.canActivate(makeCtx(' platform-admins , other '))).toBe(true);
  });
});

describe('isAdmin()', () => {
  it('returns true when groups string contains platform-admins', () => {
    expect(isAdmin(ADMIN_GROUP)).toBe(true);
  });

  it('returns true when platform-admins is in comma-separated string', () => {
    expect(isAdmin('some-group,platform-admins,other')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isAdmin('')).toBe(false);
  });

  it('returns false when group is not present', () => {
    expect(isAdmin('admins,superusers')).toBe(false);
  });

  it('trims surrounding spaces', () => {
    expect(isAdmin(' platform-admins ')).toBe(true);
  });
});
