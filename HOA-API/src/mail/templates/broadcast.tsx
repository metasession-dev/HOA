import * as React from 'react';
import { Text, Link } from '@react-email/components';
import { EmailLayout, heading, bodyTextStyle, subStyle } from './_layout';

export type BroadcastData = {
  recipientFirstName: string;
  subject: string;
  body: string;
  optOutUrl?: string;
};

export function Broadcast({ data }: { data: BroadcastData }) {
  // Render multi-paragraph body — split on blank lines.
  const paragraphs = data.body.split(/\n{2,}/).map((p, i) => (
    <Text key={i} style={bodyTextStyle}>{p.split('\n').map((line, j) => (
      <React.Fragment key={j}>{line}{j < p.split('\n').length - 1 ? <br /> : null}</React.Fragment>
    ))}</Text>
  ));
  return (
    <EmailLayout preheader={data.subject}>
      <Text style={heading}>{data.subject}</Text>
      {paragraphs}
      {data.optOutUrl && (
        <Text style={{ ...subStyle, marginTop: 24 }}>
          Don't want to hear about this anymore? <Link href={data.optOutUrl} style={{ color: '#7a756e' }}>Unsubscribe</Link>.
        </Text>
      )}
    </EmailLayout>
  );
}

export const broadcastSubject = (d: BroadcastData) => d.subject;
