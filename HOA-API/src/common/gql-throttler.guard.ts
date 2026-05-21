import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Phase 9.1: the default ThrottlerGuard pulls req/res from the HTTP execution
 * context, which is a NestJS-supplied shim under GraphQL — `req` is undefined
 * there, and the guard then dies reading `req.ip`. This subclass extracts the
 * underlying Express req/res from the GraphQL context when applicable so the
 * same per-IP rate limit applies to /graphql calls.
 */
@Injectable()
export class GqlAwareThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext): { req: any; res: any } {
    if (context.getType<string>() === 'graphql') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { GqlExecutionContext } = require('@nestjs/graphql');
        const gqlCtx = GqlExecutionContext.create(context).getContext();
        return { req: gqlCtx.req, res: gqlCtx.res ?? gqlCtx.req?.res };
      } catch {
        // fall through to HTTP shim
      }
    }
    return super.getRequestResponse(context);
  }
}
