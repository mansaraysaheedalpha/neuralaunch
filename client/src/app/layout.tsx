//client/src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css"; // Keep global styles
import Providers from "./providers"; // Keep providers (Theme, Session, etc.)
import { Toaster } from "react-hot-toast";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import { env } from "@/lib/env";

// Canonical site origin. Falls back to the production domain so
// metadata emitted at build time (sitemap, openGraph URLs, JSON-LD)
// never points at localhost when NEXT_PUBLIC_APP_URL is unset on a
// preview build.
const SITE_URL = env.NEXT_PUBLIC_APP_URL ?? "https://startupvalidator.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/neuralaunch_logo.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  title: {
    default: "NeuraLaunch — From Lost to Launched",
    template: "%s | NeuraLaunch",
  },
  description:
    "NeuraLaunch interviews your situation, commits to one clear recommendation, then partners with you through every task — until you've shipped, learned, or decided what comes next.",
  applicationName: "NeuraLaunch",
  // Brand-association keywords. Google does not rank on `keywords`
  // alone, but Bing + lesser engines still read it, and including the
  // brand variants we want to own ("NeuraLaunch") helps disambiguate
  // from the unrelated NeuroLaunch (mental-health site).
  keywords: [
    "NeuraLaunch",
    "Neura Launch",
    "startup validator",
    "AI startup advisor",
    "from lost to launched",
    "founder coach",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "NeuraLaunch",
    title: "NeuraLaunch — From Lost to Launched",
    description:
      "NeuraLaunch interviews your situation, commits to one clear recommendation, then partners with you through every task — until you've shipped, learned, or decided what comes next.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "NeuraLaunch — From Lost to Launched",
    description:
      "NeuraLaunch interviews your situation, commits to one clear recommendation, then partners with you through every task — until you've shipped, learned, or decided what comes next.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2563EB" },
    { media: "(prefers-color-scheme: dark)", color: "#070F1C" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const GA_MEASUREMENT_ID = "G-KN3B2XG85H";
  const HOTJAR_SITE_ID = "6553219";

  // JSON-LD structured data. Two graphs:
  //   1. Organization — tells Google the brand "NeuraLaunch" lives at
  //      this URL. Prerequisite for the brand panel + sitelinks under
  //      a brand-name search ("NeuraLaunch") instead of the unrelated
  //      NeuroLaunch (mental-health domain) Google currently surfaces.
  //   2. WebSite — declares the canonical site name; Google uses this
  //      to print "NeuraLaunch" rather than the bare domain in the
  //      result row, and as a hint for the in-result search box.
  // Both blocks are server-rendered into <head> as application/ld+json
  // so they're parsed by Googlebot on first crawl. alternateName covers
  // common spelling drift ("Neura Launch", "NeuraLaunch.app").
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "NeuraLaunch",
      alternateName: ["Neura Launch", "NeuraLaunch.app"],
      url: SITE_URL,
      logo: `${SITE_URL}/neuralaunch_logo.png`,
      description:
        "NeuraLaunch interviews your situation, commits to one clear recommendation, then partners with you through every task — until you've shipped, learned, or decided what comes next.",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "NeuraLaunch",
      alternateName: ["Neura Launch", "NeuraLaunch.app"],
      url: SITE_URL,
    },
  ];

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Plain inline <script> (not next/script) so the JSON-LD lands
            in the server-rendered HTML at first byte. Google's
            lightweight crawlers — including the Rich Results Test
            crawler and the Knowledge Graph indexer — read structured
            data out of the static HTML; they do not execute or wait
            for next/script's lifecycle. Keeping it inline is the
            documented best practice for static structured data.
            (See: nextjs.org/docs/app/api-reference/components/script
            §"JSON-LD".) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
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
