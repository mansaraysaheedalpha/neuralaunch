// src/lib/services/mvp-generator.ts
import { OpenAI } from "openai";
import { AI_MODELS } from "@/lib/models"; // We'll use your GPT model

// --- AI CLIENT INITIALIZATION ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- TYPE DEFINITIONS ---

// This now matches the JSON you save in `LandingPage.pricingTiers`
interface PricingTier {
  name: string;
  price: string; // e.g., "$10/mo", "Free"
  description: string;
}

// These are the *output* types from our AI parser
interface DatabaseField {
  name: string;
  type: string; // e.g., "String", "Int?", "DateTime", "User @relation(...)"
}

interface DatabaseModel {
  name: string; // e.g., "Project", "Task"
  fields: DatabaseField[];
}

// This is the structured object we'll get from parsing the markdown
interface ParsedBlueprint {
  pitch: string; // e.g., "ClarityLedger"
  solution: {
    features: Array<{
      name: string;
      description: string;
    }>;
  };
  databaseModels: DatabaseModel[];
}

// --- UTILITY FUNCTIONS ---
function slugify(text: string): string {
  if (!text) return "my-mvp-app";
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

/**
 * NEW: This function uses GPT-5 Pro to parse the raw markdown blueprint
 * into a structured JSON object. This is the "magic" step.
 */
async function parseBlueprint(
  blueprintString: string
): Promise<ParsedBlueprint> {
  console.log(`Parsing blueprint with ${AI_MODELS.OPENAI}...`);

  const parserPrompt = `
You are an expert system that parses a markdown-based startup blueprint and converts it into a structured JSON object.
The user's markdown blueprint is provided below.
Your task is to extract the following information:
1.  **pitch**: The startup name, e.g., "ClarityLedger".
2.  **solution.features**: A list of features from the "What You're Building" section.
3.  **databaseModels**: Infer a list of Prisma database models required to build this app. Be smart. A "Cash Runway" feature implies a "CashRunway" model. A "Scenario Planner" implies a "Scenario" model. ALWAYS include a primary model (like "Project" or "Report") that links to the user.

RULES:
-   ALWAYS add standard fields: id, createdAt, updatedAt.
-   ALWAYS link primary models back to the "User" model with a 'userId' field (e.g., \`user User @relation(fields: [userId], references: [id])\` and \`userId String\`).
-   Be minimalist. Only extract the most essential models.
-   Return ONLY the valid JSON object. Do not add any other text.

Example Output Format:
{
  "pitch": "ClarityLedger",
  "solution": {
    "features": [
      { "name": "Cash Runway", "description": "A visual forecast..." },
      { "name": "Scenario Planner", "description": "Simple sliders..." }
    ]
  },
  "databaseModels": [
    {
      "name": "FinancialReport",
      "fields": [
        { "name": "id", "type": "String @id @default(cuid())" },
        { "name": "createdAt", "type": "DateTime @default(now())" },
        { "name": "updatedAt", "type": "DateTime @updatedAt" },
        { "name": "cashRunwayMonths", "type": "Float" },
        { "name": "anomalies", "type": "Json" },
        { "name": "user", "type": "User @relation(fields: [userId], references: [id], onDelete: Cascade)" },
        { "name": "userId", "type": "String" }
      ]
    },
    {
      "name": "Scenario",
      "fields": [
        { "name": "id", "type": "String @id @default(cuid())" },
        { "name": "name", "type": "String" },
        { "name": "assumptions", "type": "Json" },
        { "name": "impact", "type": "Json" },
        { "name": "user", "type": "User @relation(fields: [userId], references: [id], onDelete: Cascade)" },
        { "name": "userId", "type": "String" }
      ]
    }
  ]
}

---
MARKDOWN BLUEPRINT:
---
${blueprintString}
`;

  try {
    const response = await openai.chat.completions.create({
      model: AI_MODELS.OPENAI,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: parserPrompt }],
    });

    const jsonString = response.choices[0]?.message?.content;
    if (!jsonString) {
      throw new Error("OpenAI returned an empty response.");
    }

    return JSON.parse(jsonString) as ParsedBlueprint;
  } catch (error) {
    console.error("Error parsing blueprint:", error);
    // Fallback in case parsing fails
    return {
      pitch: "My MVP App",
      solution: { features: [] },
      databaseModels: [],
    };
  }
}

// --- GENERATOR FUNCTIONS (Updated) ---

/**
 * Generate package.json content for the MVP
 */
function generatePackageJson(appName: string): string {
  // (This function remains unchanged from your file)
  const packageJson = {
    name: appName,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "prisma generate && next build",
      start: "next start",
      lint: "next lint",
    },
    dependencies: {
      next: "^14.2.0",
      react: "^18",
      "react-dom": "^18",
      "@prisma/client": "5.17.0",
      "next-auth": "5.0.0-beta.19",
      "@auth/prisma-adapter": "2.4.1",
      tailwindcss: "^3.4.0",
      stripe: "^16.5.0",
      "lucide-react": "^0.417.0",
    },
    devDependencies: {
      "@types/node": "^20",
      "@types/react": "^18",
      "@types/react-dom": "^18",
      typescript: "^5",
      prisma: "5.17.0",
      autoprefixer: "^10.4.0",
      postcss: "^8.4.0",
    },
  };

  return JSON.stringify(packageJson, null, 2);
}

/**
 * Generate Prisma schema including NextAuth models AND dynamic models
 */
function generatePrismaSchema(blueprint: ParsedBlueprint): string {
  // 1. Start with the standard boilerplate
  let schema = `// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// --- NextAuth.js Models ---
// (These are required for authentication)

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
  
  // --- THIS IS NEW ---
  // Added the Stripe Customer ID, fixing the TODO in stripe.ts
  stripeCustomerId String? @unique @map("stripe_customer_id")

  // --- Custom Relations ---
  // Add relations from User to your custom models here
  ${
    blueprint.databaseModels
      .map((model) => `${model.name.toLowerCase()}s ${model.name}[]`)
      .join("\n  ") || "// e.g., projects Project[]"
  }
}

model Account {
// (This model remains unchanged)
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
// (This model remains unchanged)
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
// (This model remains unchanged)
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// --- Custom Application Models ---
// (Generated from your NeuraLaunch Blueprint)
`;

  // 2. Parse and add the dynamic models from the blueprint
  if (blueprint.databaseModels && blueprint.databaseModels.length > 0) {
    for (const model of blueprint.databaseModels) {
      schema += `\nmodel ${model.name} {\n`;
      for (const field of model.fields) {
        schema += `  ${field.name} ${field.type}\n`;
      }
      schema += `}\n`;
    }
  } else {
    // Add a placeholder if no models were defined
    schema += `\n// No database models were inferred from your blueprint.
// Add your own models here, for example:
//
// model Project {
//   id        String   @id @default(cuid())
//   createdAt DateTime @default(now())
//   name      String
//   user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
//   userId    String
// }
`;
  }

  return schema;
}

/**
 * Generate NextAuth route configuration (static, but good)
 */
function generateNextAuthRoute(): string {
  // (This function remains unchanged)
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
function generateAppLayout(appName: string, appDescription: string): string {
  // (Now uses dynamic appName and description)
  return `// app/layout.tsx
import { SessionProvider } from "next-auth/react";
import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "${appName}",
  description: "${appDescription}",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <SessionProvider>
          <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            {children}
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
`;
}

/**
 * Generate a custom dashboard page based on blueprint features
 */
function generateDashboardPage(blueprint: ParsedBlueprint): string {
  // (This function remains unchanged)
  const appName = blueprint.pitch || "Dashboard";
  const features = blueprint.solution?.features || [];

  return `// app/dashboard/page.tsx
// TODO: Add a component to fetch session and protect this page
export default function DashboardPage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-4xl font-bold mb-6">
        Welcome to ${appName}
      </h1>
      <p className="text-xl text-gray-400 mb-8">
        Your dashboard is ready. Here are the features from your blueprint:
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${
          features.length > 0
            ? features
                .map(
                  (feature) => `
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold mb-3">${
              feature.name || "Unnamed Feature"
            }</h2>
            <p className="text-gray-500">
              ${feature.description || "No description provided."}
            </p>
          </div>
        `
                )
                .join("\n        ")
            : `
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 col-span-full">
            <h2 className="text-2xl font-semibold mb-3">No Features Defined</h2>
            <p className="text-gray-500">
              Your blueprint didn't have any features listed.
            </p>
          </div>
        `
        }
      </div>

      <div className="mt-12">
        <h2 className="text-3xl font-semibold mb-4">Next Steps</h2>
        <ul className="list-disc list-inside space-y-2 text-lg">
          <li>Run \`npx prisma db push\` to sync your database schema.</li>
          <li>Build out the components for your features.</li>
          <li><a href="/pricing" className="text-blue-400 hover:underline">Check out your new Pricing Page!</a></li>
        </ul>
      </div>
    </div>
  );
}
`;
}

/**
 * Generate Stripe server action
 */
function generateStripeLib(): string {
  // (This function is updated to use the new prisma schema)
  return `// lib/stripe.ts
"use server";

import Stripe from "stripe";
import { redirect } from "next/navigation";
import { auth } from "@/app/api/auth/[...nextauth]/route"; // Import auth
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createCheckoutSession(priceId: string) {
  const session = await auth(); // Get the user's session
  
  if (!session?.user?.id) {
    throw new Error("User must be logged in to subscribe.");
  }

  const userId = session.user.id;
  
  // Check if user is already a Stripe customer
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true } // We select the new field
  });

  let stripeCustomerId = user?.stripeCustomerId;

  if (!stripeCustomerId) {
    // Create a new Stripe customer
    const customer = await stripe.customers.create({
      email: session.user.email!,
      name: session.user.name!,
    });
    stripeCustomerId = customer.id;
    
    // Save the new customer ID to your database
    // This will now work because generatePrismaSchema() added the field!
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: stripeCustomerId },
    });
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer: stripeCustomerId, // Pass the customer ID
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: \`\${process.env.NEXT_PUBLIC_APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}\`,
      cancel_url: \`\${process.env.NEXT_PUBLIC_APP_URL}/pricing\`,
    });

    if (checkoutSession.url) {
      redirect(checkoutSession.url);
    }
  } catch (error) {
    console.error("Error creating checkout session:", error);
    throw new Error("Could not create checkout session.");
  }
}
`;
}

/**
 * Generate Subscribe Button component
 */
function generateSubscribeButton(): string {
  // (This function remains unchanged)
  return `// components/SubscribeButton.tsx
"use client";

import { createCheckoutSession } from "@/lib/stripe";
import { useState } from "react";

interface SubscribeButtonProps {
  priceId: string;
  className?: string;
  children?: React.ReactNode;
}

export default function SubscribeButton({ 
  priceId, 
  className,
  children 
}: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);
    try {
      await createCheckoutSession(priceId);
    } catch (err) {
      const e = err as Error;
      console.error("Subscription error:", e);
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleSubscribe}
        disabled={loading}
        className={className || "px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all"}
      >
        {loading ? "Redirecting..." : children || "Subscribe Now"}
      </button>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}
`;
}

/**
 * Generate a dynamic pricing page
 */
function generatePricingPage(tiers: PricingTier[]): string {
  // (This function is UPDATED to use `tier.description`
  // and handle potentially empty or invalid tier data)

  const validTiers = Array.isArray(tiers) ? tiers : [];

  return `// app/pricing/page.tsx
import SubscribeButton from "@/components/SubscribeButton";
import { Check } from "lucide-react";

// TODO: Replace these with your actual Stripe Price IDs
// You must create these Price IDs in your Stripe Dashboard
const PRICE_IDS: Record<string, string> = {
  ${
    validTiers.length > 0
      ? validTiers
          .map(
            (tier) =>
              `"${(tier.name || "default")
                .toLowerCase()
                .replace(" ", "-")}": "price_YOUR_ID_HERE"`
          )
          .join(",\n  ")
      : '"starter": "price_YOUR_ID_HERE"'
  }
};

const pricingTiers = ${JSON.stringify(validTiers, null, 2)};

export default function PricingPage() {
  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold sm:text-5xl">
          Find the perfect plan
        </h1>
        <p className="mt-4 text-xl text-gray-400">
          Generated from your NeuraLaunch blueprint.
        </p>
      </div>

      <div className="mt-16 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-${
        validTiers.length || 1
      } gap-8">
        {pricingTiers.length > 0 ? (
          pricingTiers.map((tier) => (
            <div 
              key={tier.name} 
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 flex flex-col"
            >
              <h3 className="text-2xl font-semibold">{tier.name}</h3>
              <div className="mt-4">
                <span className="text-5xl font-bold">{tier.price}</span>
                <span className="text-lg text-gray-400">{tier.price.toLowerCase() !== 'free' && tier.price.toLowerCase() !== 'contact us' ? '/mo' : ''}</span>
              </div>
              <p className="mt-4 text-gray-500 flex-grow">
                {tier.description}
              </p>

              {/* We don't have a feature list, so we'll add placeholders */}
              <ul className="mt-8 space-y-4">
                <li className="flex items-center space-x-3">
                  <Check className="flex-shrink-0 h-5 w-5 text-green-500" />
                  <span className="text-gray-300">Core Feature 1</span>
                </li>
                <li className="flex items-center space-x-3">
                  <Check className="flex-shrink-0 h-5 w-5 text-green-500" />
                  <span className="text-gray-300">Core Feature 2</span>
                </li>
              </ul>

              <div className="mt-10">
                <SubscribeButton 
                  priceId={PRICE_IDS[tier.name.toLowerCase().replace(" ", "-")] || ""}
                  className="w-full py-3 px-6 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all"
                >
                  {tier.price.toLowerCase() === 'contact us' ? 'Contact Sales' : 'Get Started'}
                </SubscribeButton>
              </div>
            </div>
          ))
        ) : (
          <p>No pricing tiers found.</p>
        )}
      </div>
    </div>
  );
}
`;
}

// (All other config file generators remain unchanged)
function generateTsConfig(): string {
  return `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
`;
}
function generateTailwindConfig(): string {
  return `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;
`;
}
function generatePostCssConfig(): string {
  return `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;
}
function generateGlobalsCss(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;
`;
}
function generateEnvExample(tiers: PricingTier[]): string {
  const validTiers = Array.isArray(tiers) ? tiers : [];
  return `# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"

# NextAuth
NEXTAUTH_SECRET="your-secret-key-here-generate-one"
NEXTAUTH_URL="http://localhost:3000"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# --- NEW: OpenAI API Key ---
OPENAI_API_KEY="sk-..."

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Stripe Price IDs (Add your real IDs from the Stripe Dashboard)
${validTiers
  .map(
    (tier) =>
      `NEXT_PUBLIC_STRIPE_${tier.name
        .toUpperCase()
        .replace(" ", "_")}_PRICE_ID="price_YOUR_ID_HERE"`
  )
  .join("\n")}
`;
}
function generateReadme(appName: string): string {
  return `# ${appName}

This is an MVP application generated by NeuraLaunch (https://neuralaunch.ai).

## Getting Started

1.  **Install dependencies:**
    \`\`\`bash
    npm install
    \`\`\`

2.  **Set up your environment variables:**
    Copy \`.env.example\` to a new file named \`.env\` and fill in all the required values.
    \`\`\`bash
    cp .env.example .env
    \`\`\`
    *You must fill in your Database URL, Auth secrets, Stripe keys, and OPENAI_API_KEY.*

3.  **Set up the database:**
    Run the Prisma commands to generate your client and sync your database schema.
    \`\`\`bash
    npx prisma generate
    npx prisma db push
    \`\`\`

4.  **Run the development server:**
    \`\`\`bash
    npm run dev
    \`\`\`

5.  Open [http://localhost:3000](http://localhost:3000) with your browser.

## Features

-   🔐 Authentication with NextAuth.js (Google Provider)
-   📊 PostgreSQL database with Prisma ORM (custom schema inferred by AI)
-   💳 Stripe payment integration (Subscriptions)
-   🎨 Tailwind CSS for styling
-   ⚡ Next.js 14 with App Router
-   📄 Custom schema and dashboard generated from your NeuraLaunch blueprint.
`;
}

/**
 * Generate MVP codebase files
 */
export async function generateMvpCodebase(
  blueprintString: string,
  pricingTiers: PricingTier[]
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  // --- THIS IS THE NEW ASYNC STEP ---
  // 1. Parse the raw blueprint string into a structured object
  const blueprint = await parseBlueprint(blueprintString);
  // ------------------------------------

  const appName = slugify(blueprint.pitch);
  const appDescription = `MVP for ${blueprint.pitch}, generated by NeuraLaunch.`;

  // Generate package.json
  files["package.json"] = generatePackageJson(appName);

  // Generate Prisma schema
  files["prisma/schema.prisma"] = generatePrismaSchema(blueprint);

  // Generate NextAuth route
  files["app/api/auth/[...nextauth]/route.ts"] = generateNextAuthRoute();

  // Generate app layout
  files["app/layout.tsx"] = generateAppLayout(appName, appDescription);

  // Generate dashboard page
  files["app/dashboard/page.tsx"] = generateDashboardPage(blueprint);

  // Generate pricing page
  files["app/pricing/page.tsx"] = generatePricingPage(pricingTiers);

  // Generate Stripe lib
  files["lib/stripe.ts"] = generateStripeLib();

  // Generate Subscribe Button component
  files["components/SubscribeButton.tsx"] = generateSubscribeButton();

  // Generate configuration files
  files["tsconfig.json"] = generateTsConfig();
  files["tailwind.config.ts"] = generateTailwindConfig();
  files["postcss.config.js"] = generatePostCssConfig();
  files["app/globals.css"] = generateGlobalsCss();
  files[".env.example"] = generateEnvExample(pricingTiers);
  files["README.md"] = generateReadme(appName);

  return files;
}
