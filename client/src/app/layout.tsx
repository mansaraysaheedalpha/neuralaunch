//src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IdeaSpark - AI-Powered Startup Idea Generator",
  description:
    "Transform your skills into innovative startup ideas with the power of AI. IdeaSpark uses Google Gemini to generate personalized, market-ready business concepts tailored to your expertise.",
  keywords: [
    "startup ideas",
    "AI",
    "business ideas",
    "Google Gemini",
    "entrepreneurship",
    "innovation",
  ],
  authors: [{ name: "IdeaSpark Team" }],
  creator: "IdeaSpark",
  openGraph: {
    type: "website",
    title: "IdeaSpark - AI-Powered Startup Idea Generator",
    description: "Transform your skills into innovative startup ideas with AI",
    siteName: "IdeaSpark",
  },
  twitter: {
    card: "summary_large_image",
    title: "IdeaSpark - AI-Powered Startup Idea Generator",
    description: "Transform your skills into innovative startup ideas with AI",
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Create a new, separate export for viewport
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💡</text></svg>"
        />
      </head>
      <body className={`${geistSans.variable} antialiased`}>
        <Providers>
          <div className="flex h-screen w-full bg-pattern">
            <div className="w-80 h-full hidden md:flex">
              <Sidebar />
            </div>
            {/* MAIN CONTENT AREA WITH HEADER */}
            <div className="flex flex-col flex-1 h-full">
              <Header />
              <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
