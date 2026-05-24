import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class InternalSecretGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const secret = req.headers['x-internal-secret'];
    return !!secret && secret === process.env.INTERNAL_API_SECRET;
  }
}
