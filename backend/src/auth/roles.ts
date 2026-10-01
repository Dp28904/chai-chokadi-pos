import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { AuthUser } from './jwt.strategy';

export const Roles = (...roles: AuthUser['role'][]) => SetMetadata('roles', roles);

export const JwtAuthGuard = AuthGuard('jwt');

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AuthUser['role'][]>('roles', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length) return true;
    const { user } = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    return !!user && roles.includes(user.role);
  }
}
