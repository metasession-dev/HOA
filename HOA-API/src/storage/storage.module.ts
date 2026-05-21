import { Global, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PrismaService } from '../common/prisma.service';
import { FilesController } from './files.controller';
import { StorageService } from './storage.service';

/**
 * Storage is @Global so any module (org branding, profile avatars, violations,
 * vendor invoices, board pack export) can inject StorageService directly.
 *
 * Multer uses in-memory storage so the interceptor hands us a Buffer that
 * StorageService can hash + write atomically. The per-kind size cap is
 * enforced after multer parses — multer's global limit (50 MiB) acts as a
 * hard ceiling, but the service refines per use case.
 */
@Global()
@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  ],
  controllers: [FilesController],
  providers: [StorageService, PrismaService],
  exports: [StorageService],
})
export class StorageModule {}
