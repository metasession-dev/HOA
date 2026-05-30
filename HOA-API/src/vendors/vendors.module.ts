import { Module } from '@nestjs/common';
import {
  VendorsController,
  VendorInvoicesController,
  ApprovalRulesController,
} from './vendors.controller';
import { VendorsService } from './vendors.service';
import { VendorInvoicesService } from './vendor-invoices.service';
import { ApprovalRulesService } from './approval-rules.service';
import { VendorPortalController } from './vendor-portal.controller';
import { VendorPortalService } from './vendor-portal.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../common/prisma.service';
import { IdempotencyInterceptor } from '../common/idempotency';

@Module({
  imports: [NotificationsModule],
  controllers: [
    VendorsController,
    VendorInvoicesController,
    ApprovalRulesController,
    VendorPortalController,
  ],
  providers: [
    VendorsService,
    VendorInvoicesService,
    ApprovalRulesService,
    VendorPortalService,
    PrismaService,
    IdempotencyInterceptor,
  ],
})
export class VendorsModule {}
