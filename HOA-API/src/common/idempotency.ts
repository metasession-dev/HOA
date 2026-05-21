import {
  Injectable,
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  SetMetadata,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import { PrismaService } from './prisma.service';

const IDEMPOTENT_KEY = 'idempotent';
const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * Mark a controller method as idempotent. Clients must send `Idempotency-Key`
 * header on the request. Replays within {@link IDEMPOTENCY_TTL_HOURS} return
 * the original response unchanged.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isIdempotent) return next.handle();

    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.sub;
    const key = req.headers['idempotency-key'] || req.headers['Idempotency-Key'];

    // Anonymous endpoints can't enforce per-user idempotency.
    // For now, require auth + key; skip if either missing.
    if (!userId || !key || typeof key !== 'string') {
      throw new BadRequestException(
        'Idempotency-Key header is required for this endpoint',
      );
    }
    if (key.length < 8 || key.length > 128) {
      throw new BadRequestException(
        'Idempotency-Key must be 8-128 characters',
      );
    }

    return from(this.prisma.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } })).pipe(
      switchMap((existing) => {
        if (existing && existing.expiresAt > new Date()) {
          // Replay original response
          this.logger.log(`Idempotent replay user=${userId} key=${key}`);
          return of(existing.response);
        }
        // Run handler, then persist response.
        return next.handle().pipe(
          tap(async (body) => {
            try {
              const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3600 * 1000);
              await this.prisma.idempotencyKey.upsert({
                where: { userId_key: { userId, key } },
                update: { response: body as any, expiresAt },
                create: { userId, key, response: body as any, expiresAt },
              });
            } catch (err) {
              this.logger.error('Failed to persist idempotency key', err as Error);
            }
          }),
          catchError((err) => {
            // Don't cache errors — let the next attempt try afresh.
            throw err;
          }),
        );
      }),
    );
  }
}

// Cleanup helper — call from a future Bull cron to expire old keys.
// For now, expired rows linger until manually cleaned.
export async function purgeExpiredIdempotencyKeys(prisma: PrismaService): Promise<number> {
  const result = await prisma.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
