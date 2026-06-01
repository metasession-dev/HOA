import * as React from 'react';
import { Html, Head, Body, Container, Section, Text, Hr, Link, Img } from '@react-email/components';

/**
 * Per-org branding injected into every email. Threaded via React context so
 * individual templates don't each need a `branding` prop — they just render
 * inside <EmailLayout> which reads the context. Defaults fall back to the
 * platform brand when an org hasn't set its own.
 */
export type EmailBranding = {
  orgName: string;
  logoUrl: string | null;
  accentColor: string;
  tagline: string | null;
};

export const DEFAULT_BRANDING: EmailBranding = {
  orgName: 'HOA.africa',
  logoUrl: null,
  accentColor: '#ff3e00',
  tagline: null,
};

export const EmailBrandingContext = React.createContext<EmailBranding>(DEFAULT_BRANDING);

/**
 * Phase 2.2 — Shared shell for every transactional email. Inline styles only
 * (no Tailwind / CSS Modules) because email clients are unforgiving. The header
 * now renders the sending org's logo / name / accent colour (Phase: org email
 * branding); falls back to the platform brand when unset.
 */
export function EmailLayout({ children, preheader }: { children?: React.ReactNode; preheader?: string }) {
  const brand = React.useContext(EmailBrandingContext);
  const accent = brand.accentColor || DEFAULT_BRANDING.accentColor;
  return (
    <Html>
      <Head>
        <meta name="viewport" content="width=device-width" />
      </Head>
      <Body style={bodyStyle}>
        {preheader && (
          <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden', opacity: 0 }}>{preheader}</div>
        )}
        <Container style={containerStyle}>
          {/* Accent bar in the org's brand colour. */}
          <div style={{ height: 4, backgroundColor: accent }} />
          <Section style={{ padding: '24px 24px 8px' }}>
            {brand.logoUrl ? (
              <Img src={brand.logoUrl} alt={brand.orgName} height={36} style={{ maxHeight: 36, objectFit: 'contain' }} />
            ) : (
              <Text style={{ ...brandStyle, color: accent }}>{brand.orgName}</Text>
            )}
            {brand.tagline && <Text style={taglineStyle}>{brand.tagline}</Text>}
          </Section>
          <Section style={{ padding: '8px 24px 24px' }}>
            {children}
          </Section>
          <Hr style={{ borderColor: '#e8e5e1', margin: '0 24px' }} />
          <Section style={{ padding: '16px 24px' }}>
            <Text style={footerStyle}>
              You&rsquo;re receiving this because you&rsquo;re a member of {brand.orgName}.{' '}
              <Link href="https://hoa.africa" style={{ ...linkStyle, color: accent }}>Powered by HOA.africa →</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f4f1ec',
  color: '#1f1d1a',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  margin: 0, padding: '24px 0',
};
const containerStyle: React.CSSProperties = {
  backgroundColor: '#ffffff', borderRadius: 12, maxWidth: 600, margin: '0 auto', overflow: 'hidden',
};
const brandStyle: React.CSSProperties = {
  fontSize: 20, fontWeight: 600, color: '#ff3e00', margin: 0,
};
const footerStyle: React.CSSProperties = {
  color: '#7a756e', fontSize: 12, margin: 0,
};
const taglineStyle: React.CSSProperties = {
  color: '#7a756e', fontSize: 13, margin: '2px 0 0',
};
const linkStyle: React.CSSProperties = { color: '#ff3e00', textDecoration: 'none' };

export const buttonStyle: React.CSSProperties = {
  display: 'inline-block', padding: '10px 18px', backgroundColor: '#ff3e00',
  color: '#ffffff', textDecoration: 'none', borderRadius: 8, fontWeight: 600,
};
export const bodyTextStyle: React.CSSProperties = { color: '#1f1d1a', fontSize: 15, lineHeight: 1.6, margin: '0 0 12px' };
export const subStyle: React.CSSProperties = { color: '#7a756e', fontSize: 13, margin: '0 0 16px' };
export const heading: React.CSSProperties = { fontSize: 22, fontWeight: 600, color: '#1f1d1a', margin: '0 0 12px' };
