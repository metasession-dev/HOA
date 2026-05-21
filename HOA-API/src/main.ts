import * as dotenv from 'dotenv';
import * as path from 'path';

// Load local .env with override so it takes precedence over system env vars
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), override: true });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';

/**
 * Production sanity checks. Refuse to boot if any of these critical secrets
 * are missing, default, or obviously weak. Better to crash on start than to
 * silently sign JWTs with `dev-secret-change-me` and ship a forgeable token
 * to production. Every entry here is a real footgun that's bitten someone:
 *
 *   - JWT_SECRET: the JWT signing key. Default `dev-secret-change-me`
 *     means any actor knowing that string can forge tokens. Must be ≥32
 *     chars and not the default.
 *   - APP_ENCRYPTION_KEY: AES-GCM key for TOTP secrets / sensitive payloads
 *     at rest. Missing it means we fall back to a JWT_SECRET-derived key,
 *     coupling encryption to signing — rotation of one breaks the other.
 *   - TRUST_PROXY_HOPS: see the inline TRUST_PROXY check below.
 */
function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  const errors: string[] = [];

  const jwt = process.env.JWT_SECRET;
  if (!jwt || jwt === 'dev-secret-change-me' || jwt.length < 32) {
    errors.push(
      'JWT_SECRET is missing, default, or too short (<32 chars). Generate with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"',
    );
  }
  const enc = process.env.APP_ENCRYPTION_KEY;
  if (!enc || enc.length < 32) {
    errors.push(
      'APP_ENCRYPTION_KEY is missing or too short. Encrypts TOTP secrets + sensitive payloads at rest. Generate the same way as JWT_SECRET.',
    );
  }
  if (errors.length > 0) {
    throw new Error(
      'Refusing to boot with insecure production config:\n  - ' +
        errors.join('\n  - '),
    );
  }
}

async function bootstrap() {
  assertProductionSecrets();
  const app = await NestFactory.create<import('@nestjs/platform-express').NestExpressApplication>(AppModule);

  // Trust the immediate reverse proxy (Railway, Cloudflare, etc.) so
  // req.ip resolves correctly via X-Forwarded-For when present. Configure
  // TRUST_PROXY_HOPS=1 in production behind a single proxy; set to '0' or
  // unset locally.
  const trustHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (Number.isFinite(trustHops) && trustHops > 0) {
    app.set('trust proxy', trustHops);
  } else if (process.env.NODE_ENV === 'production') {
    // Phase 6 review #12: refuse to start in production without trust proxy
    // configured. Without it, req.ip is the proxy's IP — throttler buckets
    // collapse to one global bucket and the IP allowlist matches every
    // request against the same address. Set TRUST_PROXY_HOPS=1 (or whatever
    // hop count your load balancer chain has).
    throw new Error(
      'TRUST_PROXY_HOPS must be > 0 in production. Set it to the number of trusted reverse proxies (typically 1 for Railway/Cloudflare).',
    );
  }

  // Security headers. We don't pull helmet to avoid the dep; the manual
  // set below covers the high-value defaults:
  //   - HSTS in production only (don't enforce HTTPS in localhost dev).
  //   - X-Content-Type-Options: nosniff — block MIME sniffing.
  //   - X-Frame-Options: DENY — kill clickjacking via iframe embedding.
  //     We don't render any embeddable UI from the API.
  //   - Referrer-Policy: strict-origin-when-cross-origin — never leak full
  //     URLs (with tokens in fragments / params) to third parties.
  //   - X-DNS-Prefetch-Control: off — minor speculative-leak hardening.
  app.use((_req: any, res: any, next: any) => {
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    next();
  });

  app.setGlobalPrefix('api');

  // Phase 1.3: capture the raw body on Paystack webhook so we can verify the
  // HMAC signature against the exact bytes Paystack signed. The JSON body
  // parser still runs after this for everything else.
  app.use(bodyParser.json({
    limit: '1mb',
    verify: (req: any, _res, buf) => {
      if (
        req.originalUrl?.startsWith('/api/payments/webhook/paystack') ||
        req.originalUrl?.startsWith('/api/mail/webhook/resend')
      ) {
        req.rawBody = buf;
      }
    },
  }));

  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  // Refuse a wildcard CORS origin combined with credentials. Browsers
  // silently reject this combo in newer versions, but older ones used to
  // honour it — and the misconfiguration is a session-theft footgun in
  // either case. Better to surface it as a boot failure.
  if (corsOrigins.includes('*')) {
    throw new Error(
      'CORS_ORIGIN cannot include "*" — `credentials: true` requires an explicit allow-list of origins.',
    );
  }
  app.enableCors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Reject requests with properties not on the DTO instead of silently
      // stripping them. Catches typos, mass-assignment attempts, and
      // accidental fields slipping through during refactors. New endpoints
      // pay zero cost; legacy callers sending extra junk surface clearly
      // with a 400 + the offending field name.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('HOA.africa API')
    .setDescription('Enterprise HOA Management Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || process.env.API_PORT || 3001;
  // Bind explicitly to 0.0.0.0 so the server is reachable through Railway's
  // (and every other PaaS') reverse proxy. Node's default host varies by
  // version and DNS family, and a healthcheck on /api/health that never
  // gets a TCP accept is impossible to diagnose from the outside.
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`HOA.africa API running on http://${host}:${port}`);
  console.log(`Swagger docs:  http://${host}:${port}/api/docs`);
  console.log(`Healthcheck:   http://${host}:${port}/api/health`);
}

// Surface boot failures explicitly. Without this, a throw inside bootstrap()
// (e.g. assertProductionSecrets, TRUST_PROXY_HOPS guard, Prisma init) becomes
// an unhandled promise rejection that Node may print without context — making
// the Railway "service unavailable" loop look opaque.
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[bootstrap] Fatal startup error:', err);
  process.exit(1);
});
