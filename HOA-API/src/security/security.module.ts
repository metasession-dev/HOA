import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { MfaService } from './mfa.service';
import { SessionsService } from './sessions.service';
import { MagicLinksService } from './magic-links.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../common/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [SecurityController],
  providers: [MfaService, SessionsService, MagicLinksService, PrismaService],
  exports: [MfaService, SessionsService],
})
export class SecurityModule {}
