import { IsOptional, IsInt, Min, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export function paginatedResponse<T>(data: T[], total: number, page: number, limit: number) {
  return {
    success: true,
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Defensive pagination coercion. Use in any service that takes
 * `query: PaginationDto & { ... }` because NestJS's ValidationPipe
 * doesn't transform intersection types — `?limit=5` arrives as the string '5',
 * which crashes Prisma's `take`. Returns sanitized numeric values + clamps to
 * sane bounds.
 */
export function coercePagination(
  query: { page?: number | string; limit?: number | string } | undefined,
  defaults: { page?: number; limit?: number; maxLimit?: number } = {},
): { page: number; limit: number; skip: number } {
  const pageRaw = Number(query?.page);
  const limitRaw = Number(query?.limit);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : defaults.page ?? 1;
  const maxLimit = defaults.maxLimit ?? 100;
  const fallbackLimit = defaults.limit ?? 20;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(maxLimit, Math.floor(limitRaw))
    : fallbackLimit;
  return { page, limit, skip: (page - 1) * limit };
}

export function successResponse<T>(data: T) {
  return { success: true, data };
}

export function errorResponse(error: string) {
  return { success: false, error };
}
