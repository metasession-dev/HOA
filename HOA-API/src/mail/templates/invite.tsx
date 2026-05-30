import * as React from 'react';
import { Button, Text, Link } from '@react-email/components';
import { EmailLayout, heading, bodyTextStyle, subStyle, buttonStyle } from './_layout';

/**
 * Invitation email — one template, two flavours:
 *   • kind='team_member' → staff joining the admin console
 *   • kind='resident'    → owner/tenant joining the resident PWA
 *
 * The differences are purely copy: the link, role name, and organization are
 * supplied by the caller. We branch on `kind` for the subject + button copy
 * so the recipient understands which app they're being onboarded into.
 */
export type InviteData = {
  recipientFirstName: string;
  organizationName: string;
  inviterName: string;
  roleDisplayName: string;
  redeemUrl: string;
  expiresAt: string; // ISO; we format human-readable below
  kind: 'team_member' | 'resident' | 'vendor';
};

export function Invite({ data }: { data: InviteData }) {
  const isResident = data.kind === 'resident';
  const isVendor = data.kind === 'vendor';
  const expires = new Date(data.expiresAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const greetingName = data.recipientFirstName?.trim() || 'there';
  return (
    <EmailLayout
      preheader={
        isResident
          ? `Join ${data.organizationName} on HOA.africa — set your password to get started`
          : isVendor
            ? `${data.organizationName} invited you to their vendor portal on HOA.africa`
            : `Join the ${data.organizationName} admin team on HOA.africa`
      }
    >
      <Text style={heading}>
        {isResident
          ? `Welcome to ${data.organizationName}`
          : `You've been invited to ${data.organizationName}`}
      </Text>
      <Text style={bodyTextStyle}>
        Hi {greetingName}, {data.inviterName} has invited you to join{' '}
        <strong>{data.organizationName}</strong> on HOA.africa as a{' '}
        <strong>{data.roleDisplayName}</strong>.
      </Text>
      <Text style={bodyTextStyle}>
        {isResident
          ? 'Set a password to view your unit details, levies, gate passes and notices.'
          : isVendor
            ? 'Set a password to access the vendor portal, where you can submit invoices and track their approval and payment status.'
            : 'Set a password to access the admin console and start managing the HOA.'}
      </Text>
      <Button href={data.redeemUrl} style={buttonStyle}>
        {isResident ? 'Set up my resident account' : isVendor ? 'Set up my vendor account' : 'Set up my admin account'}
      </Button>
      <Text style={{ ...subStyle, marginTop: 16 }}>
        This invitation expires on <strong>{expires}</strong>. If you weren't expecting it, you can ignore this email.
      </Text>
      <Text style={subStyle}>
        Or paste this URL into your browser:{' '}
        <Link href={data.redeemUrl} style={{ color: '#ff3e00', wordBreak: 'break-all' }}>
          {data.redeemUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

export const inviteSubject = (data: InviteData) =>
  data.kind === 'resident'
    ? `Welcome to ${data.organizationName} — set your password`
    : data.kind === 'vendor'
      ? `${data.organizationName} invited you to their vendor portal`
      : `You're invited to join ${data.organizationName} on HOA.africa`;
