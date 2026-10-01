import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv(); // throws before anything starts if config is bad

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: env.production ? ['log', 'warn', 'error'] : undefined,
  });

  // Render and similar hosts sit behind one proxy hop; needed for real client IPs.
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Angular component styles
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.useBodyParser('json', { limit: '256kb' });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  if (env.corsOrigin) app.enableCors({ origin: env.corsOrigin.split(',').map((o) => o.trim()) });
  app.enableShutdownHooks();

  await app.listen(env.port, '0.0.0.0');
  new Logger('Bootstrap').log(
    `Listening on port ${env.port} (${env.production ? 'production' : 'development'})`,
  );
}

bootstrap().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
