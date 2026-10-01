import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { ServerResponse } from 'http';
import { join } from 'path';
import { AnalyticsController } from './analytics/analytics.controller';
import { AuthModule } from './auth/auth.module';
import { CatalogCache } from './catalog/catalog-cache.service';
import { InvalidateCatalog } from './catalog/invalidate-catalog.interceptor';
import { CustomersController } from './customers/customers.controller';
import { HealthController } from './health/health.controller';
import { MenuController } from './menu/menu.controller';
import { OffersController } from './offers/offers.controller';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { PricingService } from './pricing/pricing.service';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsController } from './settings/settings.controller';
import { StockController } from './stock/stock.controller';
import { UploadsController } from './uploads/uploads.controller';
import { UsersController } from './users/users.controller';

// Angular emits content-hashed file names (e.g. chunk-AB12CD34.js): cache forever.
const HASHED = /-[A-Z0-9]{8}\.(js|css)$/;
// Self-hosted fonts never change between releases in practice.
const FONT = /\.woff2$/;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Per client IP. The 4 stall devices may share one IP, so the global limit is generous.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    PrismaModule,
    AuthModule,
    // Serves the built Angular app; the API lives under /api.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api{/*path}'],
      serveStaticOptions: {
        setHeaders: (res: ServerResponse, path: string) => {
          res.setHeader(
            'Cache-Control',
            HASHED.test(path)
              ? 'public, max-age=31536000, immutable'
              : FONT.test(path)
                ? 'public, max-age=2592000'
                : 'no-cache',
          );
        },
      },
    }),
  ],
  controllers: [
    HealthController,
    MenuController,
    SettingsController,
    UploadsController,
    OrdersController,
    CustomersController,
    UsersController,
    OffersController,
    StockController,
    AnalyticsController,
  ],
  providers: [
    PricingService,
    OrdersService,
    CatalogCache,
    InvalidateCatalog,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
