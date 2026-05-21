import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { ReportsService } from './reports.service';
import { FundsService } from './funds.service';
import { BudgetsService } from './budgets.service';
import { PdfRendererService } from './pdf/pdf-renderer.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, ReportsService, FundsService, BudgetsService, PdfRendererService, PrismaService],
})
export class FinanceModule {}
