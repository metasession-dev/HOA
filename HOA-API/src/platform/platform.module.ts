import { Module, Global } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { ApiKeysService } from './api-keys.service';
import { WebhooksService } from './webhooks.service';
import { ApiKeyRateLimitInterceptor } from './api-key-rate-limit.interceptor';
import { PrismaService } from '../common/prisma.service';

/**
 * @Global so the JwtAuthGuard (in AuthModule) can inject ApiKeysService and
 * the WebhooksService dispatcher can be injected into any feature module
 * (payments, violations, etc.) without per-module re-imports.
 */
@Global()
@Module({
  controllers: [PlatformController],
  providers: [ApiKeysService, WebhooksService, ApiKeyRateLimitInterceptor, PrismaService],
  exports: [ApiKeysService, WebhooksService, ApiKeyRateLimitInterceptor],
})
export class PlatformModule {}
