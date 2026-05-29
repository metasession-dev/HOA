import * as React from 'react';
import { Text, Link, Section } from '@react-email/components';
import { EmailLayout, heading, bodyTextStyle, subStyle, buttonStyle } from './_layout';

export type MeetingInviteData = {
  recipientFirstName: string;
  title: string;
  whenText: string; // pre-formatted, e.g. "Fri 12 Jun 2026, 18:00–19:00 (SAST)"
  location?: string;
  onlineUrl?: string; // Zoom / Google Meet
  description?: string;
  googleCalUrl: string;
  icsUrl: string;
  cancelled?: boolean;
};

export function MeetingInvite({ data }: { data: MeetingInviteData }) {
  const preheader = data.cancelled ? `Cancelled: ${data.title}` : `You're invited: ${data.title}`;
  return (
    <EmailLayout preheader={preheader}>
      <Text style={heading}>{data.cancelled ? `Cancelled — ${data.title}` : data.title}</Text>
      <Text style={bodyTextStyle}>Hi {data.recipientFirstName},</Text>
      <Text style={bodyTextStyle}>
        {data.cancelled
          ? 'This meeting has been cancelled. You can remove it from your calendar.'
          : "You're invited to the following meeting:"}
      </Text>

      <Section style={{ backgroundColor: '#f4f1ec', borderRadius: 8, padding: '12px 16px', margin: '4px 0 16px' }}>
        <Text style={{ ...bodyTextStyle, margin: '0 0 4px', fontWeight: 600 }}>{data.title}</Text>
        <Text style={{ ...subStyle, margin: '0 0 2px' }}>🗓 {data.whenText}</Text>
        {data.location && <Text style={{ ...subStyle, margin: '0 0 2px' }}>📍 {data.location}</Text>}
        {data.onlineUrl && (
          <Text style={{ ...subStyle, margin: 0 }}>
            💻 <Link href={data.onlineUrl} style={{ color: '#ff3e00' }}>Join online</Link>
          </Text>
        )}
      </Section>

      {data.description && <Text style={bodyTextStyle}>{data.description}</Text>}

      {!data.cancelled && (
        <Section style={{ margin: '8px 0 4px' }}>
          {data.onlineUrl && (
            <Link href={data.onlineUrl} style={{ ...buttonStyle, marginRight: 8 }}>Join meeting</Link>
          )}
          <Link href={data.googleCalUrl} style={{ ...buttonStyle, backgroundColor: '#1f1d1a', marginRight: 8 }}>
            Add to Google Calendar
          </Link>
          <Link href={data.icsUrl} style={{ ...buttonStyle, backgroundColor: '#7a756e' }}>
            Add to other calendar
          </Link>
        </Section>
      )}
    </EmailLayout>
  );
}

export const meetingInviteSubject = (d: MeetingInviteData) =>
  d.cancelled ? `Cancelled: ${d.title}` : `Invitation: ${d.title}`;
