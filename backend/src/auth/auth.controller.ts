import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import type { AuthUser } from './jwt.strategy';
import { JwtAuthGuard } from './roles';

class LoginDto {
  @IsString() @MaxLength(64) username: string;
  @IsString() @MinLength(1) @MaxLength(128) password: string;
}

class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  @MaxLength(128)
  newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  // Tight limit against password guessing (per IP).
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Request() req: { user: AuthUser }) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    return { id: u.id, name: u.name, username: u.username, role: u.role };
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('change-password')
  changePassword(@Body() dto: ChangePasswordDto, @Request() req: { user: AuthUser }) {
    return this.auth.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }
}
