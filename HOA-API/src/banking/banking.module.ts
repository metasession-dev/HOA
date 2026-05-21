import { Module } from '@nestjs/common';
import { BankingController } from './banking.controller';
import { BankAccountsService } from './bank-accounts.service';
import { BankTransactionsService } from './bank-transactions.service';
import { CategorizationRulesService } from './categorization-rules.service';
import { PrismaService } from '../common/prisma.service';
import { IdempotencyInterceptor } from '../common/idempotency';

@Module({
  controllers: [BankingController],
  providers: [
    BankAccountsService,
    BankTransactionsService,
    CategorizationRulesService,
    PrismaService,
    IdempotencyInterceptor,
  ],
})
export class BankingModule {}
