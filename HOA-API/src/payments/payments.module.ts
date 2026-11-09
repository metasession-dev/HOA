import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentConfigController } from './payment-config.controller';
import { PlatformBillingWebhookController } from './platform-webhook.controller';
import { PaymentsService } from './payments.service';
import { PaymentIntentsService } from './payment-intents.service';
import { PaymentConfigService } from './payment-config.service';
import { PaystackService } from './paystack.service';
import { PaystackWebhookRouter } from './paystack-webhook.router';
import { PrismaService } from '../common/prisma.service';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformBillingModule } from '../platform-billing/platform-billing.module';

@Module({
  imports: [BillingModule, NotificationsModule, PlatformBillingModule],
  controllers: [PaymentsController, PaymentConfigController, PlatformBillingWebhookController],
  providers: [PaymentsService, PaymentIntentsService, PaymentConfigService, PaystackService, PaystackWebhookRouter, PrismaService],
  exports: [PaymentsService, PaymentIntentsService, PaymentConfigService],
})
export class PaymentsModule {}
