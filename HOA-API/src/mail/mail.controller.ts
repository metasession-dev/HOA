import {
  Controller, Get, Post, Param, Query, Body, Req, Headers, BadRequestException, UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import * as crypto from 'crypto';
import type { Request } from 'express';
import { MailService } from './mail.service';
import { CurrentUser, Roles, Public } from '../common/decorators';
import { successResponse } from '../common/dto';

/**
 * Phase 2.2 mail HTTP surface.
 * Admin endpoints under /api/mail/* require hoa_admin or super_admin.
 * Resend webhook is public + verified via Svix signature (Resend uses Svix).
 */
@ApiTags('Mail')
@ApiBearerAuth()
@Controller('mail')
export class MailController {
  constructor(private mail: MailService) {}

  @Get()
  @Roles('hoa_admin', 'super_admin')
  async list(
    @Query('status') status: string | undefined,
    @Query('templateKey') templateKey: string | undefined,
    @Query('entityId') entityId: string | undefined,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.mail.list(orgId, { status, templateKey, entityId }));
  }

  @Get(':id')
  @Roles('hoa_admin', 'super_admin')
  async findById(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.mail.findById(orgId, id));
  }

  @Post(':id/resend')
  @Roles('hoa_admin', 'super_admin')
  async resend(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.mail.resendDelivery(orgId, id));
  }

  /**
   * Inbound Resend webhook (delivered/opened/bounced/etc). Resend signs with
   * Svix. Verification uses the `RESEND_WEBHOOK_SECRET` env. Without that env
   * we refuse-by-default in production; in dev (NODE_ENV !== 'production') we
   * allow unsigned events so developers can curl the endpoint.
   */
  @Public()
  @Throttle({ short: { limit: 30, ttl: 1000 } })
  @Post('webhook/resend')
  async webhook(
    @Req() req: Request,
    @Headers('svix-id') id: string | undefined,
    @Headers('svix-timestamp') ts: string | undefined,
    @Headers('svix-signature') sig: string | undefined,
    @Body() body: any,
  ) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (secret) {
      if (!id || !ts || !sig) throw new UnauthorizedException('Missing Svix headers');
      const raw = (req as any).rawBody?.toString('utf8');
      if (!raw) throw new BadRequestException('Raw body unavailable');
      // Svix signature format: "v1,<base64-signature> v1,<another>"
      const sigs = sig.split(' ').filter((s) => s.startsWith('v1,')).map((s) => s.slice(3));
      const signedBytes = `${id}.${ts}.${raw}`;
      // RESEND_WEBHOOK_SECRET is a base64-encoded key per Svix convention.
      const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
      const expected = crypto.createHmac('sha256', secretBytes).update(signedBytes).digest('base64');
      const ok = sigs.some((s) => {
        try { return crypto.timingSafeEqual(Buffer.from(s, 'base64'), Buffer.from(expected, 'base64')); } catch { return false; }
      });
      if (!ok) throw new UnauthorizedException('Invalid Svix signature');
    } else if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('RESEND_WEBHOOK_SECRET not configured');
    }
    return successResponse(await this.mail.handleResendWebhook(body));
  }
}
