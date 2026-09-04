import type { Metadata } from 'next'
import { Work_Sans } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/AuthProvider'
import { UserMonitoring } from '@/components/UserMonitoring'
import { AppLifecycle } from '@/components/AppLifecycle'

const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-work-sans',
})

export const metadata: Metadata = {
  title: 'Coffee Shop ERP',
  description: 'Point of Sale, Inventory Management, and Reports',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${workSans.variable} font-display bg-background-light text-slate-900`}
      >
        <AuthProvider>
          <UserMonitoring>
            <AppLifecycle />
            {children}
          </UserMonitoring>
        </AuthProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                  // NOTE: This app is packaged as a Tauri desktop app with a static export.
                  // Next.js API routes do not run in that environment, so we keep service
                  // workers disabled to avoid offline queueing pointing at non-existent /api/* routes.
                  // Unregister any existing service workers to avoid stale caching/blank screens.
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for (var i = 0; i < registrations.length; i++) {
                      registrations[i].unregister().then(function() {
                        console.log('Unregistered existing service worker');
                      });
                    }
                  });
                }
              })();
            `,
          }}
        />
      </body>
    </html>
  )
}

