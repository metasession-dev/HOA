import * as React from 'react';
import { Text } from '@react-email/components';
import { EmailLayout, heading, bodyTextStyle, subStyle } from './_layout';

export type PaymentReceivedData = {
  recipientFirstName: string;
  invoiceNumber: string;
  amountFormatted: string;
  method: string;
  receiptUrl?: string;
};

export function PaymentReceived({ data }: { data: PaymentReceivedData }) {
  return (
    <EmailLayout preheader={`Payment received · ${data.invoiceNumber} · ${data.amountFormatted}`}>
      <Text style={heading}>Thanks, {data.recipientFirstName}.</Text>
      <Text style={bodyTextStyle}>
        We've received your payment of <strong>{data.amountFormatted}</strong> against invoice {data.invoiceNumber} via {data.method}.
      </Text>
      <Text style={subStyle}>
        {data.receiptUrl ? <>A receipt is available at {data.receiptUrl}.</> : 'A receipt has been logged against your account.'}
      </Text>
    </EmailLayout>
  );
}

export const paymentReceivedSubject = (d: PaymentReceivedData) => `Payment received · ${d.amountFormatted}`;
