import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaginationDto, paginatedResponse, coercePagination } from '../common/dto';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string, query: PaginationDto & { path?: string; search?: string }) {
    // ValidationPipe's @Type(() => Number) doesn't fire on intersection types,
    // so coerce page/limit defensively. See common/dto.ts:coercePagination.
    const { page, limit, skip } = coercePagination(query);
    const { search, path } = query || ({} as any);
    const where: any = { organizationId: orgId };
    if (path) where.path = path;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.document.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
  }

  async create(
    orgId: string,
    userId: string,
    data: { name: string; path?: string; fileUrl: string; fileSize?: number; mimeType?: string },
  ) {
    return this.prisma.document.create({
      data: {
        organizationId: orgId,
        uploadedBy: userId,
        name: data.name,
        path: data.path ?? '',
        fileUrl: data.fileUrl,
        fileSize: data.fileSize ?? 0,
        mimeType: data.mimeType ?? 'application/octet-stream',
      },
    });
  }

  /**
   * Org-scoped delete. Knowing only the cuid isn't enough — the caller's
   * org must match the document's organizationId. The previous version
   * accepted any id and would happily drop another HOA's document on a
   * misrouted call, so this hardens the trivial IDOR.
   */
  async delete(id: string, orgId: string) {
    const existing = await this.prisma.document.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Document not found');
    return this.prisma.document.delete({ where: { id } });
  }
}
