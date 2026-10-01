import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SessionCache } from './session-cache.service';

export interface JwtPayload {
  sub: number;
  username: string;
  role: 'ADMIN' | 'COUNTER';
}

export interface AuthUser {
  id: number;
  username: string;
  role: 'ADMIN' | 'COUNTER';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionCache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: loadEnv().jwtSecret,
    });
  }

  // Checked on every request (cached briefly; disabling a user clears the cache).
  async validate(payload: JwtPayload): Promise<AuthUser> {
    let user = this.sessions.get(payload.sub);
    if (user === undefined) {
      const row = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      user = row?.isActive ? { id: row.id, username: row.username, role: row.role } : null;
      this.sessions.set(payload.sub, user);
    }
    if (!user) throw new UnauthorizedException('Account is disabled');
    return user;
  }
}
