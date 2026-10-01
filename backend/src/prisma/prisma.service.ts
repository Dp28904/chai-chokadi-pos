import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Queries slower than this are logged as warnings (also in production). */
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 250);
/** PRISMA_QUERY_LOG=1 prints every query with its duration (for profiling only). */
const LOG_ALL = process.env.PRISMA_QUERY_LOG === '1';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger('Prisma');

  constructor() {
    super({ log: [{ emit: 'event', level: 'query' }] });
    this.$on('query', (e: Prisma.QueryEvent) => {
      if (LOG_ALL) this.log.log(`[query] ${e.duration}ms ${e.query.slice(0, 160)}`);
      else if (e.duration >= SLOW_QUERY_MS)
        this.log.warn(`Slow query ${e.duration}ms: ${e.query.slice(0, 300)}`);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
