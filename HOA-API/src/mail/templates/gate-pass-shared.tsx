import * as React from 'react';
import { Button, Text } from '@react-email/components';
import { EmailLayout, heading, bodyTextStyle, subStyle, buttonStyle } from './_layout';

export type GatePassSharedData = {
  recipientFirstName: string;
  hostName: string;
  estateName: string;
  validFrom: string;
  validUntil: string;
  passUrl: string;
  code: string;
};

export function GatePassShared({ data }: { data: GatePassSharedData }) {
  return (
    <EmailLayout preheader={`${data.hostName} added you as a visitor at ${data.estateName}`}>
      <Text style={heading}>You're on the list, {data.recipientFirstName}.</Text>
      <Text style={bodyTextStyle}>
        <strong>{data.hostName}</strong> registered you as a visitor at <strong>{data.estateName}</strong>.
      </Text>
      <Text style={bodyTextStyle}>
        Valid from <strong>{data.validFrom}</strong> until <strong>{data.validUntil}</strong>.
        Show the gate operator your code: <strong>{data.code}</strong>.
      </Text>
      <Button href={data.passUrl} style={buttonStyle}>View pass + QR</Button>
      <Text style={{ ...subStyle, marginTop: 16 }}>The QR is also displayed on this link in case you need it offline.</Text>
    </EmailLayout>
  );
}

export const gatePassSharedSubject = (d: GatePassSharedData) => `Visitor pass for ${d.estateName}`;
