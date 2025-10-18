//src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import Providers from "./providers";
import { Toaster } from "react-hot-toast";
import MainLayout from "@/components/MainLayout"; // 1. Import our new component

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
  return (
    <html lang="en" suppressHydrationWarning>
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
        </Providers>
      </body>
    </html>
  );
}
