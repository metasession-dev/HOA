import * as React from 'react';
import { render } from '@react-email/render';
import { InvoiceIssued, invoiceIssuedSubject, InvoiceIssuedData } from './invoice-issued';
import { PaymentReceived, paymentReceivedSubject, PaymentReceivedData } from './payment-received';
import { MagicLink, magicLinkSubject, MagicLinkData } from './magic-link';
import { RequestUpdate, requestUpdateSubject, RequestUpdateData } from './request-update';
import { GatePassShared, gatePassSharedSubject, GatePassSharedData } from './gate-pass-shared';
import { Broadcast, broadcastSubject, BroadcastData } from './broadcast';
import { Invite, inviteSubject, InviteData } from './invite';
import { PasswordReset, passwordResetSubject, PasswordResetData } from './password-reset';
import { MeetingInvite, meetingInviteSubject, MeetingInviteData } from './meeting-invite';

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
};

export async function renderTemplate<K extends TemplateKey>(key: K, data: TemplateMap[K]): Promise<TemplateRender> {
  switch (key) {
    case 'invoice_issued': {
      const d = data as InvoiceIssuedData;
      return { subject: invoiceIssuedSubject(d), html: await render(<InvoiceIssued data={d} />) };
    }
    case 'payment_received': {
      const d = data as PaymentReceivedData;
      return { subject: paymentReceivedSubject(d), html: await render(<PaymentReceived data={d} />) };
    }
    case 'magic_link': {
      const d = data as MagicLinkData;
      return { subject: magicLinkSubject(), html: await render(<MagicLink data={d} />) };
    }
    case 'request_update': {
      const d = data as RequestUpdateData;
      return { subject: requestUpdateSubject(d), html: await render(<RequestUpdate data={d} />) };
    }
    case 'gate_pass_shared': {
      const d = data as GatePassSharedData;
      return { subject: gatePassSharedSubject(d), html: await render(<GatePassShared data={d} />) };
    }
    case 'broadcast': {
      const d = data as BroadcastData;
      return { subject: broadcastSubject(d), html: await render(<Broadcast data={d} />) };
    }
    case 'invite': {
      const d = data as InviteData;
      return { subject: inviteSubject(d), html: await render(<Invite data={d} />) };
    }
    case 'password_reset': {
      const d = data as PasswordResetData;
      return { subject: passwordResetSubject(), html: await render(<PasswordReset data={d} />) };
    }
    case 'meeting_invite': {
      const d = data as MeetingInviteData;
      return { subject: meetingInviteSubject(d), html: await render(<MeetingInvite data={d} />) };
    }
    default: {
      throw new Error(`Unknown email template: ${key}`);
    }
  }
}
