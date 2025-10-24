//client/src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css"; // Keep global styles
import Providers from "./providers"; // Keep providers (Theme, Session, etc.)
import { Toaster } from "react-hot-toast";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";

export const metadata: Metadata = {
  // Keep your metadata
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  title: "NeuraLaunch - AI Startup Co-Pilot", // Updated name
  description: "Go from skill to validated startup blueprint with AI.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const GA_MEASUREMENT_ID = "G-KN3B2XG85H";
  const HOTJAR_SITE_ID = "6553219";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* --- Analytics Scripts --- */}
        <Script
          strategy="afterInteractive"
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        />
        <Script
          id="google-analytics"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}');
            `,
          }}
        />
        <Script
          id="hotjar-tracking"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(h,o,t,j,a,r){
                  h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
                  h._hjSettings={hjid:${HOTJAR_SITE_ID},hjsv:6};
                  a=o.getElementsByTagName('head')[0];
                  r=o.createElement('script');r.async=1;
                  r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
                  a.appendChild(r);
              })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
            `,
          }}
        />
      </head>
      <body className={`${GeistSans.className} antialiased`}>
        {/* Providers wrap everything */}
        <Providers>
          {/* Children are the page content (landing page OR app layout + page) */}
          {children}
          {/* Toaster is available globally */}
          <Toaster
            position="bottom-center"
            toastOptions={{
              style: {
                background: "hsl(var(--card))",
                color: "hsl(var(--foreground))",
                border: "1px solid hsl(var(--border))",
              },
            }}
          />
          {/* Vercel Analytics */}
          <Analytics />
          <SpeedInsights />
        </Providers>
      </body>
    </html>
  );
}
