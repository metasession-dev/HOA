import * as React from 'react';
import { Text, Link } from '@react-email/components';
import { EmailLayout, heading, bodyTextStyle, subStyle } from './_layout';

export type BroadcastData = {
  recipientFirstName: string;
  subject: string;
  body: string;
  optOutUrl?: string;
  // Download links for any files on the broadcast. Image/PDF (≤20MB) are also
  // attached to the email itself; video / large files are link-only.
  attachments?: { filename: string; url: string }[];
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
      {data.attachments && data.attachments.length > 0 && (
        <>
          <Text style={{ ...bodyTextStyle, marginTop: 16, marginBottom: 4, fontWeight: 600 }}>
            Attachments
          </Text>
          {data.attachments.map((a, i) => (
            <Text key={i} style={{ ...bodyTextStyle, margin: '2px 0' }}>
              📎 <Link href={a.url} style={{ color: '#2563EB' }}>{a.filename}</Link>
            </Text>
          ))}
        </>
      )}
      {data.optOutUrl && (
        <Text style={{ ...subStyle, marginTop: 24 }}>
          Don't want to hear about this anymore? <Link href={data.optOutUrl} style={{ color: '#7a756e' }}>Unsubscribe</Link>.
        </Text>
      )}
    </EmailLayout>
  );
}

export const broadcastSubject = (d: BroadcastData) => d.subject;
