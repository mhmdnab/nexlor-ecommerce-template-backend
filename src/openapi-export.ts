/**
 * Generate a static OpenAPI document without starting the HTTP server:
 *   npm run openapi:export   ->   writes openapi.json at the backend root.
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function run() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  const config = new DocumentBuilder()
    .setTitle('Nexlor Commerce API')
    .setDescription('Storefront + Admin API for the Nexlor commerce template.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const out = join(process.cwd(), 'openapi.json');
  writeFileSync(out, JSON.stringify(document, null, 2));
  await app.close();
  // eslint-disable-next-line no-console
  console.log(`Wrote ${out}`);
}

void run();
