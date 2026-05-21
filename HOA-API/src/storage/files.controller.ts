import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, Public } from '../common/decorators';
import { successResponse } from '../common/dto';
import { StorageService } from './storage.service';

const VALID_KINDS = [
  'org_logo',
  'user_avatar',
  'document',
  'violation_photo',
  'vendor_invoice',
  'resale_attachment',
  'broadcast_attachment',
  'misc',
] as const;
type ValidKind = (typeof VALID_KINDS)[number];

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  /**
   * Multipart upload. Form fields:
   *   file (binary, required)
   *   kind (string, required) — one of VALID_KINDS
   *   refType (string, optional)
   *   refId   (string, optional)
   *   isPublic (string "true"/"false", optional)
   *
   * Returns the StoredFile id + a signed download URL the caller can stash
   * on the parent record.
   */
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: VALID_KINDS as unknown as string[] },
        refType: { type: 'string' },
        refId: { type: 'string' },
        isPublic: { type: 'string' },
      },
      required: ['file', 'kind'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { kind?: string; refType?: string; refId?: string; isPublic?: string },
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!file) throw new BadRequestException('file is required');
    const kind = body.kind as ValidKind;
    if (!VALID_KINDS.includes(kind)) {
      throw new BadRequestException(`kind must be one of: ${VALID_KINDS.join(', ')}`);
    }
    const result = await this.storage.upload({
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
      kind,
      organizationId,
      uploaderUserId: userId,
      refType: body.refType,
      refId: body.refId,
      isPublic: body.isPublic === 'true',
    });
    const signed = this.storage.signUrl(result.id);
    return successResponse({ ...result, downloadUrl: signed.url, expiresAt: signed.expiresAt });
  }

  /** Metadata + a fresh signed URL. Used when the page rendering already has the id. */
  @Get(':id')
  async meta(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    const file = await this.storage.get(id, { userId, organizationId });
    const signed = this.storage.signUrl(file.id);
    return successResponse({
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      kind: file.kind,
      isPublic: file.isPublic,
      createdAt: file.createdAt,
      downloadUrl: signed.url,
      expiresAt: signed.expiresAt,
    });
  }

  /**
   * Signed-URL download. Public (no JWT) — the signature *is* the auth.
   * The endpoint resolves the file, verifies expiry+HMAC, then streams bytes
   * with content-disposition matching the stored filename.
   */
  @Public()
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    this.storage.verifySignedUrl(id, exp, sig);
    const file = await this.storage.getForSignedDownload(id);
    const data = await this.storage.read(file.storageKey);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(data);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    await this.storage.softDelete(id, { organizationId });
    return successResponse({ id, deleted: true });
  }
}
