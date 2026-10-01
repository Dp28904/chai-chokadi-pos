import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { tap } from 'rxjs';
import { CatalogCache } from './catalog-cache.service';

/** Clears the catalog cache after any successful write on the decorated controller. */
@Injectable()
export class InvalidateCatalog implements NestInterceptor {
  constructor(private readonly cache: CatalogCache) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const write = ctx.switchToHttp().getRequest<Request>().method !== 'GET';
    return next.handle().pipe(tap(() => write && this.cache.invalidate()));
  }
}
