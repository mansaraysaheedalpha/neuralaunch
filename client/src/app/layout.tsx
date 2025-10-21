//src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import Providers from "./providers";
import { Toaster } from "react-hot-toast";
import MainLayout from "@/components/MainLayout"; // 1. Import our new component
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "IdeaSpark - AI-Powered Startup Idea Generator",
  description:
    "Transform your skills into innovative startup ideas with the power of AI.",
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
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          strategy="afterInteractive" // Load GA after the page is interactive
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        />
        <Script
          id="google-analytics"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            // Use dangerouslySetInnerHTML for inline scripts
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}');
            `,
          }}
        />
        {/* --- End Google Analytics Scripts --- */}
      </head>
      <body className={`${GeistSans.className} antialiased`}>
        <Providers>
          {/* 2. Use the MainLayout component to wrap the children */}
          <MainLayout>{children}</MainLayout>
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
          <Analytics />
          <SpeedInsights />
        </Providers>
      </body>
    </html>
  );
}
