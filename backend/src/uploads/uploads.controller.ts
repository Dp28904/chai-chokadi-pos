import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/roles';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

@Controller('uploads')
export class UploadsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (!ALLOWED.includes(file.mimetype)) {
      throw new BadRequestException('Only PNG, JPEG or WebP images are allowed');
    }
    const row = await this.prisma.upload.create({
      data: { mime: file.mimetype, data: new Uint8Array(file.buffer) },
    });
    return { id: row.id, url: `/api/uploads/${row.id}` };
  }

  // Public so <img> tags work without an auth header. Uploads never change: cache forever.
  @Get(':id')
  @SkipThrottle()
  async get(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const row = await this.prisma.upload.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    res.setHeader('Content-Type', row.mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(row.data));
  }
}
