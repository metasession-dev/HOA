import { Module } from '@nestjs/common';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [FxController],
  providers: [FxService, PrismaService],
  exports: [FxService],
})
export class FxModule {}
