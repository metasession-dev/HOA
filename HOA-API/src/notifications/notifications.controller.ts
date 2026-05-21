import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators';
import { PaginationDto, successResponse } from '../common/dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get()
  async list(@CurrentUser('sub') userId: string, @Query() query: PaginationDto & { unread?: string }) {
    return this.service.listForUser(userId, query);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser('sub') userId: string) {
    return successResponse(await this.service.unreadCount(userId));
  }

  @Post(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return successResponse(await this.service.markRead(id, userId));
  }

  @Post('read-all')
  async markAllRead(@CurrentUser('sub') userId: string) {
    return successResponse(await this.service.markAllRead(userId));
  }
}
