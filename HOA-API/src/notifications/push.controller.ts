import {
  Body, Controller, Delete, Get, NotFoundException, Param, Post, ForbiddenException, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength } from 'class-validator';
import { PushService } from './push.service';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, Public } from '../common/decorators';
import { successResponse } from '../common/dto';

class SubscribeDto {
  @IsString() @MinLength(10)
  endpoint!: string;

  @IsString() @MinLength(10)
  p256dh!: string;

  @IsString() @MinLength(4)
  auth!: string;

  @IsOptional() @IsString()
  userAgent?: string;
}

class TestPushDto {
  @IsOptional() @IsString()
  title?: string;
  @IsOptional() @IsString()
  body?: string;
  @IsOptional() @IsString()
  url?: string;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications/push')
export class PushController {
  constructor(private readonly push: PushService, private readonly prisma: PrismaService) {}

  /**
   * Browsers fetch this to call `pushManager.subscribe({applicationServerKey})`.
   * Public — the key is not a secret and the client needs it before login
   * (e.g., the install banner may show before the user authenticates).
   */
  @Public()
  @Get('vapid-public-key')
  getVapidKey() {
    const key = this.push.getPublicKey();
    return successResponse({ publicKey: key, enabled: !!key });
  }

  @Get()
  async listMine(@CurrentUser('sub') userId: string) {
    return successResponse(await this.push.listForUser(userId));
  }

  @Post('subscribe')
  async subscribe(
    @Body() dto: SubscribeDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    const sub = await this.push.subscribe({
      userId,
      organizationId,
      endpoint: dto.endpoint,
      p256dh: dto.p256dh,
      auth: dto.auth,
      userAgent: dto.userAgent,
    });
    return successResponse({ id: sub.id });
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    const existing = await this.prisma.pushSubscription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Subscription not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    await this.push.revoke(id);
  }

  /**
   * Dev-only convenience: send a test push to the caller's own subscriptions.
   * Useful for "Test notification" buttons in the resident settings UI.
   */
  @Post('test')
  async test(@Body() dto: TestPushDto, @CurrentUser('sub') userId: string) {
    const result = await this.push.sendToUser(userId, {
      title: dto.title || 'HOA.africa',
      body: dto.body || 'This is a test push notification.',
      url: dto.url || '/',
      tag: 'test',
    });
    return successResponse(result);
  }
}
