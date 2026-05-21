import { Module } from '@nestjs/common';
import { ResaleController } from './resale.controller';
import { ResaleService } from './resale.service';
import { SnapshotService } from './snapshot.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [ResaleController],
  providers: [ResaleService, SnapshotService, PrismaService],
})
export class ResaleModule {}
