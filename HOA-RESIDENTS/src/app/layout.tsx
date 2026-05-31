import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/providers/auth-provider';
import { ObservabilityProvider } from '@/providers/observability-provider';
import { BrandingProvider } from '@/providers/branding-provider';
import { Toaster } from '@/components/ui/toaster';
import { ConfirmProvider } from '@/components/ui/confirm-provider';

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
  title: 'HOA.africa Resident Portal',
  description: 'Pay levies, submit requests and manage your community on the go.',
  manifest: '/manifest.webmanifest',
  icons: {
    // PNG-only. The generator writes both small favicons + a 512 master that
    // browsers and OS share-sheets can pick from. SVG icon was dropped to
    // keep one source of truth (HOA-DOCS/brand/logo.png).
    icon: [
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'HOA',
    // Phase 10.2: iOS splash screens by viewport (Safari ignores those without media queries).
    startupImage: [
      { url: '/splash/apple-splash-750x1334.png', media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)' },
      { url: '/splash/apple-splash-1170x2532.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/apple-splash-1290x2796.png', media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#fbfaf9',
  width: 'device-width',
  initialScale: 1,
  // Pin the scale so iOS doesn't zoom in when an input is focused, and doesn't
  // zoom out / reflow when the device is rotated. Combined with the 16px control
  // floor in globals.css this keeps the app feeling native on phones.
  maximumScale: 1,
  userScalable: false,
  // Draw under the notch / home indicator (we pair this with env(safe-area-*)).
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <ObservabilityProvider>
            <BrandingProvider>
              <ConfirmProvider>
                {children}
                <Toaster />
              </ConfirmProvider>
            </BrandingProvider>
          </ObservabilityProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
