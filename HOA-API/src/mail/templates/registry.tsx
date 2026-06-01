import * as React from 'react';
import { render } from '@react-email/render';
import { EmailBrandingContext, DEFAULT_BRANDING, EmailBranding } from './_layout';
import { InvoiceIssued, invoiceIssuedSubject, InvoiceIssuedData } from './invoice-issued';
import { PaymentReceived, paymentReceivedSubject, PaymentReceivedData } from './payment-received';
import { MagicLink, magicLinkSubject, MagicLinkData } from './magic-link';
import { RequestUpdate, requestUpdateSubject, RequestUpdateData } from './request-update';
import { GatePassShared, gatePassSharedSubject, GatePassSharedData } from './gate-pass-shared';
import { Broadcast, broadcastSubject, BroadcastData } from './broadcast';
import { Invite, inviteSubject, InviteData } from './invite';
import { PasswordReset, passwordResetSubject, PasswordResetData } from './password-reset';
import { MeetingInvite, meetingInviteSubject, MeetingInviteData } from './meeting-invite';
import { Announcement, announcementSubject, AnnouncementData } from './announcement';
import { Welcome, welcomeSubject, WelcomeData } from './welcome';

/**
 * Phase 2.2 — Template registry.
 *
 * Each entry maps a stable `key` string to a renderer + subject builder. The
 * MailService never imports specific templates — it always dispatches through
 * this registry, which means adding a new email is a single change here.
 *
 * Stability contract: never delete a key once shipped; deprecate-by-comment
 * instead. Stored `EmailDelivery.templateKey` rows reference these.
 */
export type TemplateRender = { subject: string; html: string };

export const TEMPLATE_KEYS = {
  INVOICE_ISSUED: 'invoice_issued',
  PAYMENT_RECEIVED: 'payment_received',
  MAGIC_LINK: 'magic_link',
  REQUEST_UPDATE: 'request_update',
  GATE_PASS_SHARED: 'gate_pass_shared',
  BROADCAST: 'broadcast',
  INVITE: 'invite',
  PASSWORD_RESET: 'password_reset',
  MEETING_INVITE: 'meeting_invite',
  ANNOUNCEMENT: 'announcement',
  WELCOME: 'welcome',
} as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[keyof typeof TEMPLATE_KEYS];

type TemplateMap = {
  invoice_issued: InvoiceIssuedData;
  payment_received: PaymentReceivedData;
  magic_link: MagicLinkData;
  request_update: RequestUpdateData;
  gate_pass_shared: GatePassSharedData;
  broadcast: BroadcastData;
  invite: InviteData;
  password_reset: PasswordResetData;
  meeting_invite: MeetingInviteData;
  announcement: AnnouncementData;
  welcome: WelcomeData;
};

// Build the subject + body element for a template key. The body is wrapped in
// the branding provider at render time so every <EmailLayout> picks up the
// sending org's logo / name / accent colour.
function buildTemplate<K extends TemplateKey>(key: K, data: TemplateMap[K]): { subject: string; node: React.ReactElement } {
  switch (key) {
    case 'invoice_issued': {
      const d = data as InvoiceIssuedData;
      return { subject: invoiceIssuedSubject(d), node: <InvoiceIssued data={d} /> };
    }
    case 'payment_received': {
      const d = data as PaymentReceivedData;
      return { subject: paymentReceivedSubject(d), node: <PaymentReceived data={d} /> };
    }
    case 'magic_link': {
      const d = data as MagicLinkData;
      return { subject: magicLinkSubject(), node: <MagicLink data={d} /> };
    }
    case 'request_update': {
      const d = data as RequestUpdateData;
      return { subject: requestUpdateSubject(d), node: <RequestUpdate data={d} /> };
    }
    case 'gate_pass_shared': {
      const d = data as GatePassSharedData;
      return { subject: gatePassSharedSubject(d), node: <GatePassShared data={d} /> };
    }
    case 'broadcast': {
      const d = data as BroadcastData;
      return { subject: broadcastSubject(d), node: <Broadcast data={d} /> };
    }
    case 'invite': {
      const d = data as InviteData;
      return { subject: inviteSubject(d), node: <Invite data={d} /> };
    }
    case 'password_reset': {
      const d = data as PasswordResetData;
      return { subject: passwordResetSubject(), node: <PasswordReset data={d} /> };
    }
    case 'meeting_invite': {
      const d = data as MeetingInviteData;
      return { subject: meetingInviteSubject(d), node: <MeetingInvite data={d} /> };
    }
    case 'announcement': {
      const d = data as AnnouncementData;
      return { subject: announcementSubject(d), node: <Announcement data={d} /> };
    }
    case 'welcome': {
      const d = data as WelcomeData;
      return { subject: welcomeSubject(d), node: <Welcome data={d} /> };
    }
    default: {
      throw new Error(`Unknown email template: ${key}`);
    }
  }
}

export async function renderTemplate<K extends TemplateKey>(
  key: K,
  data: TemplateMap[K],
  branding?: Partial<EmailBranding> | null,
): Promise<TemplateRender> {
  const { subject, node } = buildTemplate(key, data);
  const brand: EmailBranding = { ...DEFAULT_BRANDING, ...(branding ?? {}) };
  const html = await render(
    <EmailBrandingContext.Provider value={brand}>{node}</EmailBrandingContext.Provider>,
  );
  return { subject, html };
}
