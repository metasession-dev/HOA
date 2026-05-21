import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentIntentsService } from './payment-intents.service';
import { PaystackService } from './paystack.service';
import { PrismaService } from '../common/prisma.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentIntentsService, PaystackService, PrismaService],
  exports: [PaymentsService, PaymentIntentsService],
})
export class PaymentsModule {}
