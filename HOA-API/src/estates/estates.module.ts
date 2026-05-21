import { Module } from '@nestjs/common';
import { EstatesController } from './estates.controller';
import { EstatesService } from './estates.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [EstatesController],
  providers: [EstatesService, PrismaService],
  exports: [EstatesService],
})
export class EstatesModule {}
