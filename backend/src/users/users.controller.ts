import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { hashPassword } from '../auth/auth.service';
import type { AuthUser } from '../auth/jwt.strategy';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/roles';
import { PrismaService } from '../prisma/prisma.service';

class CreateCounterUserDto {
  @IsString() @MinLength(1) @MaxLength(60) name: string;
  @IsString()
  @Matches(/^[a-z0-9._-]{3,32}$/i, { message: 'Username: 3-32 letters, numbers, . _ or -' })
  username: string;
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(128)
  password: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(128)
  password?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

const select = { id: true, name: true, username: true, role: true, isActive: true } as const;

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.user.findMany({ select, orderBy: { id: 'asc' } });
  }

  @Post()
  async create(@Body() dto: CreateCounterUserDto) {
    return this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        username: dto.username.trim().toLowerCase(),
        passwordHash: await hashPassword(dto.password),
        role: 'COUNTER',
      },
      select,
    });
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Request() req: { user: AuthUser },
  ) {
    if (dto.isActive === false && id === req.user.id) {
      throw new BadRequestException('You cannot disable your own account');
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        isActive: dto.isActive,
        passwordHash: dto.password ? await hashPassword(dto.password) : undefined,
      },
      select,
    });
  }
}
