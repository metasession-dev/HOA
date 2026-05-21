import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PostHog } from 'posthog-node';

/**
 * Server-side PostHog client. Used for backend events the frontend can't see
 * (recurring jobs, webhook deliveries, payment intent state changes, etc.).
 *
 * Frontend continues to use posthog-js with its own key — the project key is
 * shared between client + server so events end up on the same dashboard.
 *
 * Disabled when POSTHOG_API_KEY is unset, so dev environments boot quietly.
 */
@Injectable()
export class PostHogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostHogService.name);
  private client: PostHog | null = null;

  onModuleInit() {
    const apiKey = process.env.POSTHOG_API_KEY;
    if (!apiKey) {
      this.logger.log('PostHog disabled (no POSTHOG_API_KEY).');
      return;
    }
    this.client = new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
      // Default flush settings are sensible; override only if a deployment
      // has unusual constraints.
      flushAt: 20,
      flushInterval: 10_000,
    });
    this.logger.log(`PostHog initialised (host=${process.env.POSTHOG_HOST || 'https://us.i.posthog.com'}).`);
  }

  async onModuleDestroy() {
    await this.client?.shutdown(2000).catch(() => undefined);
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  /**
   * Capture a domain event. `distinctId` should be the User.id when known so
   * server-side events show up under the same person who triggered them in
   * the browser; pass `org_<orgId>` for system actions.
   */
  capture(opts: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
    organizationId?: string;
  }) {
    if (!this.client) return;
    this.client.capture({
      distinctId: opts.distinctId,
      event: opts.event,
      properties: {
        ...opts.properties,
        $groups: opts.organizationId ? { organization: opts.organizationId } : undefined,
      },
    });
  }

  /** One-off user identity update (role change, plan upgrade, etc.). */
  identify(distinctId: string, properties: Record<string, unknown>) {
    if (!this.client) return;
    this.client.identify({ distinctId, properties });
  }

  /** Group-level properties (e.g. an organisation's tier, country). */
  groupIdentify(group: 'organization', key: string, properties: Record<string, unknown>) {
    if (!this.client) return;
    this.client.groupIdentify({ groupType: group, groupKey: key, properties });
  }
}
