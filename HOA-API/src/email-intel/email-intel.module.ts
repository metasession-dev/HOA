import { Module } from '@nestjs/common';
import { EmailIntelController } from './email-intel.controller';
import { EmailIntelService } from './email-intel.service';
import { PrismaService } from '../common/prisma.service';
import { AssistantModule } from '../assistant/assistant.module';

@Module({
  imports: [AssistantModule],
  controllers: [EmailIntelController],
  providers: [EmailIntelService, PrismaService],
  exports: [EmailIntelService],
})
export class EmailIntelModule {}
