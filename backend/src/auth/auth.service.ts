import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly log = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** First boot on an empty database: create the admin from ADMIN_USERNAME / ADMIN_PASSWORD. */
  async onApplicationBootstrap() {
    if ((await this.prisma.user.count()) > 0) return;
    const env = loadEnv();
    if (!env.adminPassword) {
      this.log.warn('No users exist and ADMIN_PASSWORD is not set - cannot create the admin account');
      return;
    }
    await this.prisma.user.create({
      data: {
        name: 'Admin',
        username: env.adminUsername,
        role: 'ADMIN',
        passwordHash: await hashPassword(env.adminPassword),
      },
    });
    this.log.log(`Created admin account "${env.adminUsername}"`);
  }

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username: username.trim() } });
    // Compare even when the user is missing so timing doesn't reveal valid usernames.
    const ok = await bcrypt.compare(
      password,
      user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva',
    );
    if (!user || !ok) throw new UnauthorizedException('Invalid username or password');
    if (!user.isActive) throw new UnauthorizedException('This account has been disabled');
    const token = await this.jwt.signAsync({ sub: user.id, username: user.username, role: user.role });
    return { token, user: { id: user.id, name: user.name, username: user.username, role: user.role } };
  }

  async changePassword(userId: number, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(next) },
    });
    return { ok: true };
  }
}
