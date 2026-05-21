import { Injectable, Logger, BadRequestException } from '@nestjs/common';

/**
 * Phase 2.2 Resend adapter. Pure HTTP wrapper around the Resend REST API so we
 * never pull in a SDK that breaks compilation in environments without a key.
 *
 * Configured via:
 *   RESEND_API_KEY — your Resend secret (re_...).
 *   MAIL_FROM      — display + address, e.g. "HOA.africa <noreply@metasession.co>".
 *                    Defaults to that exact value so a fresh install Just Works
 *                    once RESEND_API_KEY lands. The metasession.co domain is
 *                    verified in Resend and is the canonical sender for every
 *                    transactional + broadcast email the platform produces.
 *
 * When the key is missing, `isConfigured()` returns false and callers fall back
 * to the mock provider — the in-app email log still gets a row so dev
 * environments can exercise the full pipeline.
 */
export type SendInput = {
  from?: string;
  to: string;
  toName?: string;
  subject: string;
  html: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
};

@Injectable()
export class ResendProvider {
  private readonly logger = new Logger(ResendProvider.name);

  isConfigured(): boolean {
    return !!process.env.RESEND_API_KEY;
  }

  defaultFrom(): string {
    // The metasession.co domain is verified in Resend — keep this as the
    // single source of truth for the sender across every email type.
    return process.env.MAIL_FROM || 'HOA.africa <noreply@metasession.co>';
  }

  async send(input: SendInput): Promise<{ id: string }> {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new BadRequestException('Resend not configured');

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: input.from || this.defaultFrom(),
          to: input.toName ? `${input.toName} <${input.to}>` : input.to,
          subject: input.subject,
          html: input.html,
          reply_to: input.replyTo,
          tags: input.tags,
        }),
        signal: ctrl.signal,
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new BadRequestException(`Resend ${res.status}: ${data?.message || 'send failed'}`);
      }
      if (!data?.id) throw new BadRequestException('Resend response missing id');
      return { id: data.id };
    } finally {
      clearTimeout(t);
    }
  }
}
