import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { Env } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const config = app.get(ConfigService<Env, true>);

  // Behind a hosting proxy (Render/etc.): trust X-Forwarded-* so Express knows
  // the request was HTTPS — required for Secure cookies to actually be set.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(cookieParser());

  // Browser apps send credentials (cookies); reflect only allow-listed origins.
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // 400 on unexpected props
      transform: true, // coerce to DTO types
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Swagger / OpenAPI at /docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Nexlor Commerce API')
    .setDescription('Storefront + Admin API for the Nexlor commerce template.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('access_token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get('PORT', { infer: true });
  // Bind all interfaces so the platform's router can reach the container.
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`🚀 API on http://localhost:${port}  •  docs at http://localhost:${port}/docs`);
}

void bootstrap();
