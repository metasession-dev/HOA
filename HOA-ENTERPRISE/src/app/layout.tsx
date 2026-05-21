import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/providers/auth-provider';
import { ObservabilityProvider } from '@/providers/observability-provider';
import { Toaster } from '@/components/ui/toaster';
import { ConfirmProvider } from '@/components/ui/confirm-provider';
import { PromptProvider } from '@/components/ui/prompt-provider';
import { CookieBanner } from '@/components/cookie-banner';
import { I18nProvider } from '@/lib/i18n';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter-google',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-display-google',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'HOA.africa — Enterprise',
  description: 'Enterprise-grade HOA & Resident Association Management Platform for Africa',
  icons: {
    // PNG-only favicon set. The generator writes a square /favicon.png plus
    // a 32px and 16px size into public/icons; we declare both so browsers
    // pick the best fit for their tab strip.
    icon: [
      { url: '/favicon.png', type: 'image/png', sizes: '32x32' },
      { url: '/icons/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#fbfaf9',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <ObservabilityProvider>
            <I18nProvider>
              <ConfirmProvider>
                <PromptProvider>
                  {children}
                  <Toaster />
                  <CookieBanner />
                </PromptProvider>
              </ConfirmProvider>
            </I18nProvider>
          </ObservabilityProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
