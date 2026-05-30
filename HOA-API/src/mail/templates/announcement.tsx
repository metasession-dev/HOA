import * as React from 'react';
import { Button, Text } from '@react-email/components';
import { EmailLayout, heading, bodyTextStyle, subStyle, buttonStyle } from './_layout';

export type AnnouncementData = {
  recipientFirstName: string;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

export function Announcement({ data }: { data: AnnouncementData }) {
  const paragraphs = (data.message || '').split(/\n{2,}/).map((p, i) => (
    <Text key={i} style={bodyTextStyle}>
      {p.split('\n').map((line, j) => (
        <React.Fragment key={j}>{line}{j < p.split('\n').length - 1 ? <br /> : null}</React.Fragment>
      ))}
    </Text>
  ));
  return (
    <EmailLayout preheader={data.title}>
      <Text style={heading}>{data.title}</Text>
      <Text style={bodyTextStyle}>Hi {data.recipientFirstName},</Text>
      {paragraphs}
      {data.ctaUrl && (
        <Button href={data.ctaUrl} style={buttonStyle}>{data.ctaLabel || 'Open'}</Button>
      )}
      <Text style={{ ...subStyle, marginTop: 16 }}>Sent from your HOA on HOA.africa.</Text>
    </EmailLayout>
  );
}

export const announcementSubject = (d: AnnouncementData) => d.title;
