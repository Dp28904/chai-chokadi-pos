import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/roles';
import { PrismaService } from '../prisma/prisma.service';

const KEYS = ['stallName', 'upiId', 'paymentQrUrl'] as const;

class UpdateSettingsDto {
  @IsOptional() @IsString() @MaxLength(60) stallName?: string;
  @IsOptional() @IsString() @MaxLength(80) upiId?: string;
  @IsOptional()
  @IsString()
  @Matches(/^(\/api\/uploads\/\d+)?$/, { message: 'Upload the QR image' })
  paymentQrUrl?: string;
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  private async all() {
    const rows = await this.prisma.setting.findMany();
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return Object.fromEntries(KEYS.map((k) => [k, map[k] ?? ''])) as Record<(typeof KEYS)[number], string>;
  }

  /** Branding for the login screen - no secrets. */
  @Get('public')
  async publicInfo() {
    return { stallName: (await this.all()).stallName || 'Stall POS' };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  get() {
    return this.all();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async update(@Body() dto: UpdateSettingsDto) {
    await this.prisma.$transaction(
      KEYS.filter((k) => dto[k] !== undefined).map((key) =>
        this.prisma.setting.upsert({
          where: { key },
          update: { value: dto[key]!.trim() },
          create: { key, value: dto[key]!.trim() },
        }),
      ),
    );
    return this.all();
  }
}
