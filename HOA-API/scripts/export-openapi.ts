// Phase 9.3: emit the OpenAPI 3.x document for downstream SDK codegen.
// Run with: `npx ts-node scripts/export-openapi.ts`
// Writes to ./openapi.json. CI should run this and fail the build when the
// committed file drifts from the generated one — that keeps the JS/Python
// SDKs aligned with the live controller surface.
import 'reflect-metadata';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  const config = new DocumentBuilder()
    .setTitle('HOA.africa API')
    .setDescription('Enterprise HOA Management Platform API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'BearerAuth')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'ApiKeyAuth')
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  const out = join(__dirname, '..', 'openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(`OpenAPI document written: ${out} (paths=${Object.keys(doc.paths || {}).length})`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
