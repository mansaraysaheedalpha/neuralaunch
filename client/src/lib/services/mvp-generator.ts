// lib/services/mvp-generator.ts

/**
 * Generate package.json content for the MVP
 */
function generatePackageJson(): string {
  const packageJson = {
    name: "my-mvp-app",
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "prisma generate && next build",
      start: "next start",
      lint: "next lint",
    },
    dependencies: {
      next: "^15.0.0",
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      "@prisma/client": "^6.0.0",
      "next-auth": "^5.0.0-beta.29",
      "@auth/prisma-adapter": "^2.11.0",
      tailwindcss: "^3.4.0",
      stripe: "^17.0.0",
    },
    devDependencies: {
      "@types/node": "^20",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      typescript: "^5",
      prisma: "^6.0.0",
      autoprefixer: "^10.4.0",
      postcss: "^8.4.0",
    },
  };

  return JSON.stringify(packageJson, null, 2);
}

/**
 * Generate Prisma schema including NextAuth models
 */
function generatePrismaSchema(_blueprint: unknown): string {
  return `// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// NextAuth.js Models
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
`;
}

/**
 * Generate NextAuth route configuration
 */
function generateNextAuthRoute(): string {
  return `// app/api/auth/[...nextauth]/route.ts

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";
import type { Adapter } from "next-auth/adapters";

const prisma = new PrismaClient();

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});

export { handlers as GET, handlers as POST };
`;
}

/**
 * Generate root layout with Tailwind and SessionProvider
 */
function generateAppLayout(): string {
  return `// app/layout.tsx

import { SessionProvider } from "next-auth/react";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
`;
}

/**
 * Generate dashboard page
 */
function generateDashboardPage(): string {
  return `// app/dashboard/page.tsx

export default function DashboardPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <h1 className="text-4xl font-bold">Welcome to your Dashboard</h1>
    </div>
  );
}
`;
}

/**
 * Generate Stripe server action
 */
function generateStripeLib(): string {
  return `// lib/stripe.ts
"use server";

import Stripe from "stripe";
import { redirect } from "next/navigation";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});

export async function createCheckoutSession(priceId: string) {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: \`\${process.env.NEXT_PUBLIC_APP_URL}/success\`,
      cancel_url: \`\${process.env.NEXT_PUBLIC_APP_URL}/cancel\`,
    });

    if (session.url) {
      redirect(session.url);
    }
  } catch (error) {
    console.error("Error creating checkout session:", error);
    throw error;
  }
}
`;
}

/**
 * Generate Subscribe Button component
 */
function generateSubscribeButton(): string {
  return `// components/SubscribeButton.tsx
"use client";

import { createCheckoutSession } from "@/lib/stripe";
import { useState } from "react";

interface SubscribeButtonProps {
  priceId: string;
}

export default function SubscribeButton({ priceId }: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      await createCheckoutSession(priceId);
    } catch (error) {
      console.error("Subscription error:", error);
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSubscribe}
      disabled={loading}
      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
    >
      {loading ? "Loading..." : "Subscribe Now"}
    </button>
  );
}
`;
}

/**
 * Generate MVP codebase files
 */
export function generateMvpCodebase(
  _blueprint: unknown,
  _pricingTiers: unknown
): Record<string, string> {
  const files: Record<string, string> = {};

  // Generate package.json
  files["package.json"] = generatePackageJson();

  // Generate Prisma schema
  files["prisma/schema.prisma"] = generatePrismaSchema(_blueprint);

  // Generate NextAuth route
  files["app/api/auth/[...nextauth]/route.ts"] = generateNextAuthRoute();

  // Generate app layout
  files["app/layout.tsx"] = generateAppLayout();

  // Generate dashboard page
  files["app/dashboard/page.tsx"] = generateDashboardPage();

  // Generate Stripe lib
  files["lib/stripe.ts"] = generateStripeLib();

  // Generate Subscribe Button component
  files["components/SubscribeButton.tsx"] = generateSubscribeButton();

  return files;
}
