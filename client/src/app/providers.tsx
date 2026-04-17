// client/src/app/providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { ReactNode } from "react";
import { PaddleProvider } from "@/components/PaddleProvider";

interface Props {
  children: ReactNode;
}

// Read public env vars at module load so Paddle.js initialises with
// the right environment in both sandbox and production builds.
const PADDLE_CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
const PADDLE_ENV: 'sandbox' | 'production' =
  process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox';

export default function Providers({ children }: Props) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <PaddleProvider clientToken={PADDLE_CLIENT_TOKEN} environment={PADDLE_ENV}>
          {children}
        </PaddleProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
