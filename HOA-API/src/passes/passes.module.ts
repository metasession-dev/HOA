import { Module } from '@nestjs/common';
import { PassesController, VisitorLogsController } from './passes.controller';
import { PassesService } from './passes.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [PassesController, VisitorLogsController],
  providers: [PassesService, PrismaService],
})
export class PassesModule {}
