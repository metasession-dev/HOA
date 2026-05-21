import * as React from 'react';
import { Button, Text, Link } from '@react-email/components';
import { EmailLayout, heading, bodyTextStyle, subStyle, buttonStyle } from './_layout';

export type PasswordResetData = {
  recipientFirstName: string;
  resetUrl: string;
  expiresMinutes: number;
};

export function PasswordReset({ data }: { data: PasswordResetData }) {
  return (
    <EmailLayout
      preheader={`Reset your HOA.africa password — link expires in ${data.expiresMinutes} minutes`}
    >
      <Text style={heading}>Reset your HOA.africa password</Text>
      <Text style={bodyTextStyle}>
        Hi {data.recipientFirstName || 'there'}, click below to set a new password for your
        account. If you didn't request this, ignore this email — your existing
        password stays unchanged.
      </Text>
      <Button href={data.resetUrl} style={buttonStyle}>
        Reset password
      </Button>
      <Text style={{ ...subStyle, marginTop: 16 }}>
        This link expires in {data.expiresMinutes} minutes and can only be used
        once. If it's already been used, request a new one from the sign-in
        page.
      </Text>
      <Text style={subStyle}>
        Or paste this URL into your browser:{' '}
        <Link href={data.resetUrl} style={{ color: '#ff3e00', wordBreak: 'break-all' }}>
          {data.resetUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

export const passwordResetSubject = () => 'Reset your HOA.africa password';
