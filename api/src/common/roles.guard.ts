import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

export const ADMIN_GROUP = 'platform-admins';

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const groups = (req.headers['x-authentik-groups'] ?? '').split(',').map((g) => g.trim());
    if (!groups.includes(ADMIN_GROUP)) throw new ForbiddenException('Admin role required');
    return true;
  }
}

export function isAdmin(groups: string): boolean {
  return groups.split(',').map((g) => g.trim()).includes(ADMIN_GROUP);
}
