import * as React from 'react';
import { Button, Text, Link, Hr } from '@react-email/components';
import { EmailLayout, heading, bodyTextStyle, subStyle, buttonStyle } from './_layout';

/**
 * Welcome email — sent once when a new HOA registers. Orients the new admin
 * with the must-know first steps and a single CTA into the console.
 */
export type WelcomeData = {
  recipientFirstName: string;
  organizationName: string;
  dashboardUrl: string;
  supportEmail: string;
};

const steps = [
  {
    t: 'Set up your organisation',
    d: 'Confirm your currency, timezone and branding (logo + accent colour) in Settings so everything — invoices, the resident app, emails — looks and counts right.',
  },
  {
    t: 'Add your units & residents',
    d: 'Create units (or bulk-import them), capture owners and occupants, then invite residents to their portal.',
  },
  {
    t: 'Invite your team',
    d: 'Add finance officers, exco/board members and managers with role-based access — everyone sees exactly what they should.',
  },
  {
    t: 'Issue your first levy',
    d: 'Raise an invoice or a recurring levy schedule. Residents are emailed automatically and can pay online.',
  },
];

export function Welcome({ data }: { data: WelcomeData }) {
  const greetingName = data.recipientFirstName?.trim() || 'there';
  return (
    <EmailLayout preheader={`Welcome to HOA.africa — let's get ${data.organizationName} set up`}>
      <Text style={heading}>Welcome to HOA.africa 🎉</Text>
      <Text style={bodyTextStyle}>
        Hi {greetingName}, your account for <strong>{data.organizationName}</strong> is ready. HOA.africa is your
        single home base for levies &amp; payments, vendor invoicing, contract bidding, governance votes, gate
        passes and resident communication.
      </Text>
      <Text style={bodyTextStyle}>Here&apos;s how to get going in a few minutes:</Text>

      {steps.map((s, i) => (
        <Text key={i} style={{ ...bodyTextStyle, marginBottom: 10 }}>
          <strong>{i + 1}. {s.t}</strong>
          <br />
          {s.d}
        </Text>
      ))}

      <Button href={data.dashboardUrl} style={buttonStyle}>
        Open your dashboard
      </Button>

      <Hr style={{ borderColor: '#eee', margin: '24px 0' }} />

      <Text style={subStyle}>
        Good to know: residents and vendors get their own apps — invite them and they self-serve. Need a hand? Just
        reply to this email or reach us at{' '}
        <Link href={`mailto:${data.supportEmail}`} style={{ color: '#ff3e00' }}>
          {data.supportEmail}
        </Link>
        .
      </Text>
    </EmailLayout>
  );
}

export const welcomeSubject = (d: WelcomeData) => `Welcome to HOA.africa, ${d.organizationName}`;
