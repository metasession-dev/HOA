import * as React from 'react';
import { Button, Text } from '@react-email/components';
import { EmailLayout, heading, bodyTextStyle, subStyle, buttonStyle } from './_layout';

export type InvoiceIssuedData = {
  recipientFirstName: string;
  invoiceNumber: string;
  amountFormatted: string;
  dueDateFormatted: string;
  estateName: string;
  unitNumber: string;
  payUrl: string;
};

export function InvoiceIssued({ data }: { data: InvoiceIssuedData }) {
  return (
    <EmailLayout preheader={`Invoice ${data.invoiceNumber} · ${data.amountFormatted} · due ${data.dueDateFormatted}`}>
      <Text style={heading}>Hi {data.recipientFirstName},</Text>
      <Text style={bodyTextStyle}>
        Your HOA has issued a new invoice for <strong>{data.estateName} #{data.unitNumber}</strong>.
      </Text>
      <Text style={bodyTextStyle}>
        <strong>{data.invoiceNumber}</strong> · {data.amountFormatted} · due <strong>{data.dueDateFormatted}</strong>
      </Text>
      <Text style={subStyle}>Click below to pay securely — Paystack will email you a receipt once the payment clears.</Text>
      <Button href={data.payUrl} style={buttonStyle}>Pay now</Button>
    </EmailLayout>
  );
}

export const invoiceIssuedSubject = (d: InvoiceIssuedData) => `Invoice ${d.invoiceNumber} · ${d.amountFormatted}`;
