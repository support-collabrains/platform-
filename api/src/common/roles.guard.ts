import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

export const ADMIN_GROUP = 'platform-admins';
const ADMIN_GROUPS = [ADMIN_GROUP, 'authentik Admins'];

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const groups = (req.headers['x-authentik-groups'] ?? '').split(',').map((g) => g.trim());
    if (!groups.some((g) => ADMIN_GROUPS.includes(g))) throw new ForbiddenException('Admin role required');
    return true;
  }
}

export function isAdmin(groups: string): boolean {
  const parsed = groups.split(',').map((g) => g.trim());
  return parsed.some((g) => ADMIN_GROUPS.includes(g));
}
