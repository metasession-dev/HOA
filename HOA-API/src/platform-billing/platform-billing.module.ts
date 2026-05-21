import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaystackService } from '../payments/paystack.service';
import {
  PlatformBillingController,
  PlatformBillingWebhookController,
} from './platform-billing.controller';
import { PlatformBillingService } from './platform-billing.service';

@Module({
  controllers: [PlatformBillingController, PlatformBillingWebhookController],
  providers: [PlatformBillingService, PaystackService, PrismaService],
  exports: [PlatformBillingService],
})
export class PlatformBillingModule {}
