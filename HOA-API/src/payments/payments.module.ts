import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentConfigController } from './payment-config.controller';
import { PaymentsService } from './payments.service';
import { PaymentIntentsService } from './payment-intents.service';
import { PaymentConfigService } from './payment-config.service';
import { PaystackService } from './paystack.service';
import { PrismaService } from '../common/prisma.service';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [BillingModule, NotificationsModule],
  controllers: [PaymentsController, PaymentConfigController],
  providers: [PaymentsService, PaymentIntentsService, PaymentConfigService, PaystackService, PrismaService],
  exports: [PaymentsService, PaymentIntentsService, PaymentConfigService],
})
export class PaymentsModule {}
