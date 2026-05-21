import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { DocumentsService } from './documents.service';
import { CurrentUser, Roles } from '../common/decorators';
import { PaginationDto, successResponse } from '../common/dto';

class CreateDocumentDto {
  @IsString() @MaxLength(200) name: string;
  // `path` is a logical folder string (e.g. "minutes/2026/may"), not a
  // filesystem path. The service writes nothing to disk under this string —
  // the actual file already lives on R2 / local storage with an opaque
  // hashed key. Still cap length + reject control chars defensively.
  @IsOptional() @IsString() @MaxLength(500) path?: string;
  @IsString() @MaxLength(2000) fileUrl: string;
  @IsOptional() @IsInt() @Min(0) fileSize?: number;
  @IsOptional() @IsString() @MaxLength(120) mimeType?: string;
}

@ApiTags('Documents')
@ApiBearerAuth()
@Roles('property_manager')
@Controller('documents')
export class DocumentsController {
  constructor(private service: DocumentsService) {}

  @Get()
  async findAll(@CurrentUser('organizationId') orgId: string, @Query() query: PaginationDto & { path?: string }) {
    return this.service.findAll(orgId, query);
  }

  @Post()
  async create(@CurrentUser('organizationId') orgId: string, @CurrentUser('sub') userId: string, @Body() data: CreateDocumentDto) {
    const doc = await this.service.create(orgId, userId, data);
    return successResponse(doc);
  }

  /**
   * Delete a document. Scoped by the caller's org so a knowledge of the
   * cuid alone (e.g. from a logs leak) can't drop another HOA's records —
   * the service performs the ownership check before deleting.
   */
  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    await this.service.delete(id, orgId);
    return successResponse({ deleted: true });
  }
}
