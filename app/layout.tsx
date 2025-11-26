import type { Metadata } from 'next'
import { Work_Sans } from 'next/font/google'
import './globals.css'

const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-work-sans',
})

export const metadata: Metadata = {
  title: 'Coffee Shop ERP',
  description: 'Point of Sale, Inventory Management, and Reports',
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
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                  // Unregister any existing service workers first to avoid conflicts
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for (var i = 0; i < registrations.length; i++) {
                      registrations[i].unregister().then(function() {
                        console.log('Unregistered existing service worker');
                      });
                    }
                  });
                  
                  // Small delay before registering to ensure unregistration completes
                  setTimeout(function() {
                    window.addEventListener('load', function() {
                      navigator.serviceWorker
                        .register('/sw.js')
                        .then(function(registration) {
                          console.log('Service Worker registered successfully:', registration.scope);
                          setInterval(function() {
                            registration.update();
                          }, 60 * 60 * 1000);
                        })
                        .catch(function(error) {
                          console.error('Service Worker registration failed:', error);
                        });
                      navigator.serviceWorker.addEventListener('controllerchange', function() {
                        console.log('Service Worker controller changed, reloading page...');
                        window.location.reload();
                      });
                    });
                  }, 100);
                }
              })();
            `,
          }}
        />
      </body>
    </html>
  )
}

