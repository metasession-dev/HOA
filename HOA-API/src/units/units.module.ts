import { Module } from '@nestjs/common';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';
import { PrismaService } from '../common/prisma.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  // BillingModule gives us UnitBillingService for the auto-attach-on-create hook.
  imports: [BillingModule],
  controllers: [UnitsController],
  providers: [UnitsService, PrismaService],
  exports: [UnitsService],
})
export class UnitsModule {}
