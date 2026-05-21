import { Module } from '@nestjs/common';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { InvitesService } from './invites.service';
import { CustomRolesService } from './custom-roles.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { PrismaService } from '../common/prisma.service';
import { IdempotencyInterceptor } from '../common/idempotency';

@Module({
  imports: [NotificationsModule, MailModule],
  controllers: [TeamController],
  providers: [TeamService, InvitesService, CustomRolesService, PrismaService, IdempotencyInterceptor],
  exports: [InvitesService],
})
export class TeamModule {}
