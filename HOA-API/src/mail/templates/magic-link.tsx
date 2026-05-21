import * as React from 'react';
import { Button, Text, Link } from '@react-email/components';
import { EmailLayout, heading, bodyTextStyle, subStyle, buttonStyle } from './_layout';

export type MagicLinkData = {
  recipientFirstName: string;
  loginUrl: string;
  expiresMinutes: number;
};

export function MagicLink({ data }: { data: MagicLinkData }) {
  return (
    <EmailLayout preheader={`Sign in to HOA.africa — link expires in ${data.expiresMinutes} minutes`}>
      <Text style={heading}>Sign in to HOA.africa</Text>
      <Text style={bodyTextStyle}>Hi {data.recipientFirstName}, click below to finish signing in.</Text>
      <Button href={data.loginUrl} style={buttonStyle}>Sign in</Button>
      <Text style={{ ...subStyle, marginTop: 16 }}>
        The link expires in {data.expiresMinutes} minutes. If you didn't request this, ignore this email — nothing will change.
      </Text>
      <Text style={subStyle}>
        Or paste this URL into your browser:{' '}
        <Link href={data.loginUrl} style={{ color: '#ff3e00', wordBreak: 'break-all' }}>{data.loginUrl}</Link>
      </Text>
    </EmailLayout>
  );
}

export const magicLinkSubject = () => `Your HOA.africa sign-in link`;
