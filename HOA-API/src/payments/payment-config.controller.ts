import { Body, Controller, Get, Put, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, Roles } from '../common/decorators';
import { successResponse } from '../common/dto';
import { PaymentConfigService } from './payment-config.service';

class UpdatePaystackConfigDto {
  @IsOptional() @IsString() @MaxLength(200) publicKey?: string;
  // Write-only. Omit/blank to keep the stored key. Never returned by the API.
  @IsOptional() @IsString() @MaxLength(200) secretKey?: string;
  @IsOptional() @IsString() @MaxLength(100) subaccountCode?: string;
  @IsOptional() @IsIn(['account', 'subaccount']) feeBearer?: 'account' | 'subaccount';
  @IsOptional() @IsBoolean() isEnabled?: boolean;
  @IsOptional() @IsBoolean() testMode?: boolean;
}

/**
 * Per-org Paystack settings. Admin-only. The secret key is write-only — the GET
 * returns `secretKeySet` (boolean) but never the key itself.
 */
@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments/config')
export class PaymentConfigController {
  constructor(private readonly config: PaymentConfigService) {}

  @Roles('hoa_admin', 'super_admin')
  @Get('paystack')
  async getPaystack(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.config.getPublicConfig(orgId));
  }

  @Roles('hoa_admin', 'super_admin')
  @Put('paystack')
  async updatePaystack(
    @Body() dto: UpdatePaystackConfigDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    try {
      return successResponse(await this.config.update(orgId, { userId, role }, dto));
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Could not update Paystack configuration');
    }
  }
}
