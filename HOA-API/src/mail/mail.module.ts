import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';
import { ResendProvider } from './resend.provider';
import { PrismaService } from '../common/prisma.service';
import { QUEUE_NAMES } from '../jobs/queue-names';

const jobsDisabled = process.env.JOBS_DISABLED === '1';

@Global()
@Module({
  imports: jobsDisabled ? [] : [BullModule.registerQueue({ name: QUEUE_NAMES.EMAIL_DELIVERIES })],
  controllers: [MailController],
  providers: [MailService, ResendProvider, PrismaService],
  exports: [MailService],
})
export class MailModule {}
