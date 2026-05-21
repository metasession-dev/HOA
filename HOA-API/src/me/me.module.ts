import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [MeController],
  providers: [MeService, PrismaService],
  exports: [MeService],
})
export class MeModule {}
