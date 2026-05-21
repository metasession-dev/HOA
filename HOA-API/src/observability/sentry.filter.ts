import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { SentryService } from './sentry.service';

/**
 * Global exception filter that forwards 5xx + uncaught errors to Sentry,
 * then delegates to Nest's BaseExceptionFilter so the response is still
 * formatted by the default handler.
 *
 * 4xx HTTP exceptions are *expected* business outcomes (validation failures,
 * 404s, auth denials) — we don't ship those to Sentry to keep the issue list
 * actionable.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  private readonly log = new Logger(SentryExceptionFilter.name);
  constructor(private readonly sentry: SentryService) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? (exception as HttpException).getStatus() : 500;

    if (status >= 500) {
      const ctx = host.switchToHttp();
      const req: any = ctx.getRequest();
      this.sentry.captureException(exception, {
        userId: req?.user?.sub,
        organizationId: req?.user?.organizationId,
        tags: { method: req?.method, path: req?.route?.path || req?.path },
      });
      this.log.error(exception);
    }

    return super.catch(exception, host);
  }
}
