import { Module } from '@nestjs/common';
import { BookkeepingController } from './bookkeeping.controller';
import { BookkeepingService } from './bookkeeping.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [BookkeepingController],
  providers: [BookkeepingService, PrismaService],
  exports: [BookkeepingService],
})
export class BookkeepingModule {}
