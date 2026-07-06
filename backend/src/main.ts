import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Base64 receipt images (POST /receipts/scan) can be a few MB — the default
  // 100kb JSON body limit would reject them with 413.
  app.useBodyParser('json', { limit: '12mb' });
  // Web builds (Expo web, e.g. http://localhost:8081) make cross-origin XHR
  // calls; native builds never hit CORS. Set CORS_ORIGINS to a comma list to
  // restrict; unset reflects the request origin (dev default).
  const origins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins?.length ? origins : true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application running on port ${port}`);
}
bootstrap();
