import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from './common/prisma.service';
import { GqlAwareThrottlerGuard } from './common/gql-throttler.guard';
import { IpAllowlistGuard } from './auth/guards/ip-allowlist.guard';
import { ApiKeyRateLimitInterceptor } from './platform/api-key-rate-limit.interceptor';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { EstatesModule } from './estates/estates.module';
import { UnitsModule } from './units/units.module';
import { PeopleModule } from './people/people.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { FinanceModule } from './finance/finance.module';
import { CommunicationsModule } from './communications/communications.module';
import { DocumentsModule } from './documents/documents.module';
import { AuditModule } from './audit/audit.module';
import { PassesModule } from './passes/passes.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ViolationsModule } from './violations/violations.module';
import { VotesModule } from './votes/votes.module';
import { VendorsModule } from './vendors/vendors.module';
import { ResaleModule } from './resale/resale.module';
import { BankingModule } from './banking/banking.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TeamModule } from './team/team.module';
import { SecurityModule } from './security/security.module';
import { AssistantModule } from './assistant/assistant.module';
import { FxModule } from './fx/fx.module';
import { PrivacyModule } from './privacy/privacy.module';
import { PlatformModule } from './platform/platform.module';
import { RequestsModule } from './requests/requests.module';
import { BillingModule } from './billing/billing.module';
import { JobsModule } from './jobs/jobs.module';
import { MailModule } from './mail/mail.module';
import { EmailIntelModule } from './email-intel/email-intel.module';
import { GraphqlModule } from './graphql/graphql.module';
import { BookkeepingModule } from './bookkeeping/bookkeeping.module';
import { PlatformBillingModule } from './platform-billing/platform-billing.module';
import { ObservabilityModule } from './observability/observability.module';
import { StorageModule } from './storage/storage.module';
import { MeModule } from './me/me.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Observability first — exception filter + metrics middleware are registered
    // here, so they wrap every subsequent module.
    ObservabilityModule,
    // Global rate limiter: short burst window (per-IP), with three tiers.
    // Tighter limits per-endpoint are declared via @Throttle({...}) where needed
    // (login, magic-link request/redeem, invite lookup).
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },    // 20 req/sec per IP
      { name: 'medium', ttl: 60_000, limit: 300 }, // 300 req/min per IP
      { name: 'long', ttl: 60 * 60 * 1000, limit: 5000 }, // 5000 req/hour per IP
    ]),
    // PlatformModule first so ApiKeysService is resolvable by the
    // JwtAuthGuard in AuthModule. @Global on PlatformModule exposes it
    // everywhere without per-module imports.
    PlatformModule,
    AuthModule,
    OrganizationsModule,
    EstatesModule,
    UnitsModule,
    PeopleModule,
    InvoicesModule,
    PaymentsModule,
    FinanceModule,
    CommunicationsModule,
    DocumentsModule,
    AuditModule,
    PassesModule,
    NotificationsModule,
    ViolationsModule,
    VotesModule,
    VendorsModule,
    ResaleModule,
    BankingModule,
    DashboardModule,
    TeamModule,
    SecurityModule,
    AssistantModule,
    FxModule,
    PrivacyModule,
    RequestsModule,
    BillingModule,
    JobsModule.register(),
    MailModule,
    EmailIntelModule,
    GraphqlModule,
    BookkeepingModule,
    PlatformBillingModule,
    StorageModule,
    MeModule,
    // PlatformModule already imported above (must precede AuthModule).
  ],
  providers: [
    PrismaService,
    // Order matters for global guards: JwtAuthGuard + RolesGuard come from
    // AuthModule. We add IP allowlist (must run after auth so user.org is set),
    // throttler (per-IP), and permissions (after roles).
    { provide: APP_GUARD, useClass: GqlAwareThrottlerGuard },
    { provide: APP_GUARD, useClass: IpAllowlistGuard },
    // PermissionsGuard moved into AuthModule so it runs after JwtAuthGuard.
    // Phase 9.2: per-API-key rate limit interceptor — no-ops for JWT callers.
    { provide: APP_INTERCEPTOR, useClass: ApiKeyRateLimitInterceptor },
  ],
  exports: [PrismaService],
})
export class AppModule {}
