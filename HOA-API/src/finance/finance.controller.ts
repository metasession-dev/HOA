import { Controller, Get, Post, Put, Body, Param, Query, BadRequestException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FinanceService } from './finance.service';
import { ReportsService } from './reports.service';
import { FundsService } from './funds.service';
import { BudgetsService } from './budgets.service';
import { PdfRendererService } from './pdf/pdf-renderer.service';
import { CurrentUser, Roles } from '../common/decorators';
import { successResponse } from '../common/dto';

const GL_ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;

class CreateGLAccountDto {
  @IsString() @MaxLength(20) code: string;
  @IsString() @MaxLength(200) name: string;
  @IsIn(GL_ACCOUNT_TYPES) type: (typeof GL_ACCOUNT_TYPES)[number];
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateGLAccountDto {
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsIn(GL_ACCOUNT_TYPES) type?: (typeof GL_ACCOUNT_TYPES)[number];
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class JournalLineDto {
  @IsString() glAccountId: string;
  @IsOptional() @IsNumber() debit?: number;
  @IsOptional() @IsNumber() credit?: number;
  @IsOptional() @IsString() @MaxLength(500) memo?: string;
}

class CreateJournalEntryDto {
  @IsDateString() date: string;
  @IsString() @MaxLength(500) description: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() fundId?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}
import {
  CreateFundDto,
  UpdateFundDto,
  CreateBudgetDto,
  UpdateBudgetDto,
  BudgetTransitionDto,
} from './dto/budgets.dto';

// Read access: finance + board. Write access: finance only. Mutating endpoints
// override the class-level decorator with their own @Roles(...FINANCE_WRITE).
const FINANCE_READ = ['finance_officer', 'external_accountant', 'hoa_admin', 'super_admin', 'exco_member', 'exco_chairperson'] as const;
const FINANCE_WRITE = ['finance_officer', 'external_accountant', 'hoa_admin', 'super_admin'] as const;

@ApiTags('Finance')
@ApiBearerAuth()
@Roles(...FINANCE_READ)
@Controller('finance')
export class FinanceController {
  constructor(
    private service: FinanceService,
    private reports: ReportsService,
    private funds: FundsService,
    private budgets: BudgetsService,
    private pdfRenderer: PdfRendererService,
  ) {}

  private parseDate(s: string | undefined, fallback: Date): Date {
    if (!s) return fallback;
    const d = new Date(s);
    if (isNaN(d.getTime())) throw new BadRequestException(`Invalid date: ${s}`);
    return d;
  }

  @Get('gl-accounts')
  async getGLAccounts(@CurrentUser('organizationId') orgId: string) {
    const accounts = await this.service.getGLAccounts(orgId);
    return successResponse(accounts);
  }

  @Post('gl-accounts')
  @Roles(...FINANCE_WRITE)
  async createGLAccount(@CurrentUser('organizationId') orgId: string, @Body() data: CreateGLAccountDto) {
    const account = await this.service.createGLAccount(orgId, data);
    return successResponse(account);
  }

  @Put('gl-accounts/:id')
  @Roles(...FINANCE_WRITE)
  async updateGLAccount(@Param('id') id: string, @Body() data: UpdateGLAccountDto) {
    const account = await this.service.updateGLAccount(id, data);
    return successResponse(account);
  }

  @Get('journal-entries')
  async getJournalEntries(
    @CurrentUser('organizationId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getJournalEntries(orgId, page, limit);
  }

  @Post('journal-entries')
  @Roles(...FINANCE_WRITE)
  async createJournalEntry(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @Body() data: CreateJournalEntryDto,
  ) {
    const entry = await this.service.createJournalEntry(orgId, userId, data);
    return successResponse(entry);
  }

  @Get('reports/trial-balance')
  async getTrialBalance(@CurrentUser('organizationId') orgId: string) {
    const report = await this.service.getTrialBalance(orgId);
    return successResponse(report);
  }

  @Get('reports/arrears')
  async getArrearsReport(@CurrentUser('organizationId') orgId: string) {
    const report = await this.service.getArrearsReport(orgId);
    return successResponse(report);
  }

  @Get('reports/collections')
  async collectionsReport(
    @CurrentUser('organizationId') orgId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return successResponse(
      await this.service.getCollectionsReport(orgId, this.parseDate(from, yearStart), this.parseDate(to, now)),
    );
  }

  @Get('reports/income-statement')
  async incomeStatement(
    @CurrentUser('organizationId') orgId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return successResponse(
      await this.reports.incomeStatement(orgId, this.parseDate(from, yearStart), this.parseDate(to, now)),
    );
  }

  @Get('reports/balance-sheet')
  async balanceSheet(
    @CurrentUser('organizationId') orgId: string,
    @Query('asOf') asOf?: string,
  ) {
    return successResponse(
      await this.reports.balanceSheet(orgId, this.parseDate(asOf, new Date())),
    );
  }

  @Get('reports/cash-flow')
  async cashFlow(
    @CurrentUser('organizationId') orgId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return successResponse(
      await this.reports.cashFlow(orgId, this.parseDate(from, yearStart), this.parseDate(to, now)),
    );
  }

  @Get('reports/board-pack')
  async boardPack(
    @CurrentUser('organizationId') orgId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return successResponse(
      await this.reports.boardPack(orgId, this.parseDate(from, yearStart), this.parseDate(to, now)),
    );
  }

  /**
   * Phase 4.1 — PDF export of the board pack. Streams `application/pdf` so the
   * browser can either render inline or trigger a download via Content-Disposition.
   * Same RBAC as the JSON endpoint (finance + board can read).
   */
  @Get('reports/board-pack.pdf')
  async boardPackPdf(
    @CurrentUser('organizationId') orgId: string,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
  ) {
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const data = await this.reports.boardPack(
      orgId,
      this.parseDate(from, yearStart),
      this.parseDate(to, now),
    );
    const pdf = await this.pdfRenderer.renderBoardPack(data);
    const disposition = download === '1' ? 'attachment' : 'inline';
    const filename = `board-pack-${orgId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(pdf);
  }

  // ============== FUNDS ==============

  @Get('funds')
  async listFunds(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.funds.list(orgId));
  }

  @Get('funds/:id')
  async findFund(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.funds.findById(id, orgId));
  }

  @Post('funds')
  @Roles(...FINANCE_WRITE)
  async createFund(
    @Body() dto: CreateFundDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.funds.create(orgId, { userId, role }, dto));
  }

  @Put('funds/:id')
  @Roles(...FINANCE_WRITE)
  async updateFund(
    @Param('id') id: string,
    @Body() dto: UpdateFundDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.funds.update(id, orgId, { userId, role }, dto));
  }

  // ============== BUDGETS ==============

  @Get('budgets')
  async listBudgets(
    @CurrentUser('organizationId') orgId: string,
    @Query() query: { status?: string; fiscalYear?: string; fundId?: string },
  ) {
    return successResponse(
      await this.budgets.list(orgId, {
        status: query.status,
        fiscalYear: query.fiscalYear ? Number(query.fiscalYear) : undefined,
        fundId: query.fundId,
      }),
    );
  }

  @Get('budgets/:id')
  async findBudget(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.budgets.findById(id, orgId));
  }

  @Get('budgets/:id/variance')
  async budgetVariance(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @Query('asOfMonth') asOfMonth?: string,
  ) {
    return successResponse(
      await this.budgets.variance(id, orgId, asOfMonth ? Number(asOfMonth) : undefined),
    );
  }

  @Post('budgets')
  @Roles(...FINANCE_WRITE)
  async createBudget(
    @Body() dto: CreateBudgetDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.budgets.create(orgId, { userId, role }, dto));
  }

  @Put('budgets/:id')
  @Roles(...FINANCE_WRITE)
  async updateBudget(
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.budgets.update(id, orgId, { userId, role }, dto));
  }

  @Post('budgets/:id/transition')
  @Roles(...FINANCE_WRITE)
  async transitionBudget(
    @Param('id') id: string,
    @Body() dto: BudgetTransitionDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.budgets.transition(id, orgId, { userId, role }, dto.target),
    );
  }
}
