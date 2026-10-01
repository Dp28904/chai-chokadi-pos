import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Turns known database errors into clear 4xx responses instead of 500s. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('Prisma');

  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, 'That name is already taken'],
      P2003: [HttpStatus.CONFLICT, 'This record is still in use'],
      P2025: [HttpStatus.NOT_FOUND, 'Record not found'],
    };
    const known = map[e.code];
    if (!known) this.log.error(`${e.code}: ${e.message}`);
    const [statusCode, message] = known ?? [HttpStatus.INTERNAL_SERVER_ERROR, 'Something went wrong'];
    res.status(statusCode).json({ statusCode, message });
  }
}
