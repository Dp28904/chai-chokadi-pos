import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Pinged by UptimeRobot to keep the free host and database awake.
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, uptime: Math.round(process.uptime()) };
  }
}
