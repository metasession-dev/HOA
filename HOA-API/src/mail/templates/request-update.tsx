import * as React from 'react';
import { Button, Text } from '@react-email/components';
import { EmailLayout, heading, bodyTextStyle, subStyle, buttonStyle } from './_layout';

export type RequestUpdateData = {
  recipientFirstName: string;
  subject: string;
  status: string;
  message: string;
  detailUrl: string;
};

export function RequestUpdate({ data }: { data: RequestUpdateData }) {
  return (
    <EmailLayout preheader={`${data.subject} · ${data.status.replace(/_/g, ' ')}`}>
      <Text style={heading}>{data.subject}</Text>
      <Text style={bodyTextStyle}>
        Hi {data.recipientFirstName}, your request status is now <strong>{data.status.replace(/_/g, ' ')}</strong>.
      </Text>
      <Text style={bodyTextStyle}>{data.message}</Text>
      <Button href={data.detailUrl} style={buttonStyle}>Open request</Button>
      <Text style={{ ...subStyle, marginTop: 16 }}>You'll receive another email when this request changes again.</Text>
    </EmailLayout>
  );
}

export const requestUpdateSubject = (d: RequestUpdateData) => `${d.subject} · ${d.status.replace(/_/g, ' ')}`;
