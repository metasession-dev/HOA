import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaystackService } from '../payments/paystack.service';
import {
  PlatformBillingController,
} from './platform-billing.controller';
import { PlatformBillingService } from './platform-billing.service';

@Module({
  controllers: [PlatformBillingController],
  providers: [PlatformBillingService, PaystackService, PrismaService],
  exports: [PlatformBillingService],
})
export class PlatformBillingModule {}
