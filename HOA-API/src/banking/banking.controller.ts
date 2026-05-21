import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BankAccountsService } from './bank-accounts.service';
import { BankTransactionsService } from './bank-transactions.service';
import { CategorizationRulesService } from './categorization-rules.service';
import { CurrentUser, Roles } from '../common/decorators';
import { successResponse } from '../common/dto';
import { Idempotent, IdempotencyInterceptor } from '../common/idempotency';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
  ImportTransactionsDto,
  MatchTransactionDto,
  CreateCategorizationRuleDto,
  UpdateCategorizationRuleDto,
  StartReconciliationDto,
} from './dto/banking.dto';

// Read access includes board so exco can review reconciliations.
// Write access is finance-only since these mutations create journal entries
// or lock reconciliation periods.
const BANKING_READ = ['finance_officer', 'external_accountant', 'hoa_admin', 'super_admin', 'exco_member', 'exco_chairperson'] as const;
const BANKING_WRITE = ['finance_officer', 'external_accountant', 'hoa_admin', 'super_admin'] as const;

@ApiTags('Banking')
@ApiBearerAuth()
@Roles(...BANKING_READ)
@Controller('banking')
@UseInterceptors(IdempotencyInterceptor)
export class BankingController {
  constructor(
    private accounts: BankAccountsService,
    private transactions: BankTransactionsService,
    private rules: CategorizationRulesService,
  ) {}

  // ============== Bank accounts ==============

  @Get('accounts')
  async listAccounts(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.accounts.list(orgId));
  }

  @Get('accounts/:id')
  async findAccount(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.accounts.findById(id, orgId));
  }

  @Post('accounts')
  @Roles(...BANKING_WRITE)
  async createAccount(
    @Body() dto: CreateBankAccountDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.accounts.create(orgId, { userId, role }, dto));
  }

  @Put('accounts/:id')
  @Roles(...BANKING_WRITE)
  async updateAccount(
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.accounts.update(id, orgId, { userId, role }, dto));
  }

  // ============== Bank transactions ==============

  @Get('accounts/:accountId/transactions')
  async listTransactions(
    @Param('accountId') accountId: string,
    @CurrentUser('organizationId') orgId: string,
    @Query() query: { status?: string; from?: string; to?: string; search?: string },
  ) {
    return successResponse(await this.transactions.list(accountId, orgId, query));
  }

  @Post('accounts/:accountId/transactions/import')
  @Idempotent()
  @Roles(...BANKING_WRITE)
  async importTransactions(
    @Param('accountId') accountId: string,
    @Body() dto: ImportTransactionsDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.transactions.import(accountId, orgId, { userId, role }, dto));
  }

  @Get('transactions/:id/suggestions')
  async suggestMatches(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.transactions.suggestMatches(id, orgId));
  }

  @Post('transactions/:id/match')
  @Idempotent()
  @Roles(...BANKING_WRITE)
  async match(
    @Param('id') id: string,
    @Body() dto: MatchTransactionDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.transactions.match(id, orgId, { userId, role }, dto));
  }

  @Post('transactions/:id/exclude')
  @Idempotent()
  @Roles(...BANKING_WRITE)
  async exclude(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.transactions.exclude(id, orgId, { userId, role }, body.reason || 'No reason given'));
  }

  @Post('transactions/:id/unmatch')
  @Roles(...BANKING_WRITE)
  async unmatch(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.transactions.unmatch(id, orgId, { userId, role }));
  }

  // ============== Categorization rules ==============

  @Get('categorization-rules')
  async listRules(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.rules.list(orgId));
  }

  @Post('categorization-rules')
  @Roles(...BANKING_WRITE)
  async createRule(
    @Body() dto: CreateCategorizationRuleDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.rules.create(orgId, { userId, role }, dto));
  }

  @Put('categorization-rules/:id')
  @Roles(...BANKING_WRITE)
  async updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateCategorizationRuleDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.rules.update(id, orgId, { userId, role }, dto));
  }

  @Delete('categorization-rules/:id')
  @Roles(...BANKING_WRITE)
  async removeRule(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.rules.remove(id, orgId, { userId, role }));
  }

  // ============== Reconciliations ==============

  @Get('accounts/:accountId/reconciliations')
  async listReconciliations(
    @Param('accountId') accountId: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.transactions.listReconciliations(accountId, orgId));
  }

  @Post('accounts/:accountId/reconciliations')
  @Idempotent()
  @Roles(...BANKING_WRITE)
  async startReconciliation(
    @Param('accountId') accountId: string,
    @Body() dto: StartReconciliationDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.transactions.startReconciliation(accountId, orgId, { userId, role }, dto),
    );
  }

  @Post('reconciliations/:id/lock')
  @Idempotent()
  @Roles(...BANKING_WRITE)
  async lockReconciliation(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.transactions.lockReconciliation(id, orgId, { userId, role }));
  }
}
