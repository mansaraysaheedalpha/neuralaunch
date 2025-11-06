// src/lib/agent/tech-stack-reference.ts

/**
 * Modern Tech Stack Reference for AI Agent Planner
 *
 * This document defines the CURRENT, MODERN patterns and libraries
 * that the AI planning agent MUST use when architecting projects.
 *
 * Last Updated: November 2024
 */

export const MODERN_TECH_STACK = {
  // ============================================
  // FRAMEWORK & CORE
  // ============================================
  framework: {
    name: "Next.js 14+",
    version: "14.x or 15.x",
    router: "App Router (app/ directory)",
    rendering: "React Server Components by default",
    banned: [
      "pages/ directory",
      "getServerSideProps",
      "getStaticProps",
      "getInitialProps",
    ],
    preferred: [
      "Server Components",
      "Server Actions",
      "Route Handlers (route.ts)",
      "Parallel Routes",
      "Intercepting Routes",
    ],
  },

  // ============================================
  // AUTHENTICATION
  // ============================================
  authentication: {
    library: "NextAuth.js v5 (Auth.js)",
    version: "next-auth@beta (v5.0.0-beta.x)",
    configFile: "src/lib/auth.ts or src/auth.ts",

    // ❌ BANNED PATTERNS (NextAuth v4)
    banned: {
      patterns: [
        "authOptions",
        "getServerSession",
        "[...nextauth].ts in pages/api",
        "useSession from next-auth/react in Server Components",
      ],
      reason: "These are NextAuth v4 patterns. We use v5.",
    },

    // ✅ MODERN PATTERNS (NextAuth v5)
    preferred: {
      serverAuth:
        "import { auth } from '@/auth' - use in Server Components/Actions",
      clientAuth:
        "import { useSession } from 'next-auth/react' - use in Client Components",
      middleware: "export { auth as middleware } from './auth'",
      routeHandlers:
        "export { GET, POST } from '@/auth' for [...nextauth]/route",

      example: `
// src/auth.ts (NextAuth v5)
import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "./lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
})

// src/app/api/auth/[...nextauth]/route.ts
export { GET, POST } from "@/auth"

// Usage in Server Component:
const session = await auth()

// Usage in Server Action:
"use server"
import { auth } from "@/auth"
const session = await auth()
      `,
    },
  },

  // ============================================
  // DATABASE & ORM
  // ============================================
  database: {
    orm: "Prisma",
    version: "5.x",
    client: "@prisma/client",
    schemaLocation: "prisma/schema.prisma",

    patterns: {
      clientImport: 'import prisma from "@/lib/prisma"',
      clientSetup: `
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
      `,

      modernRelations: [
        "Use @relation with onDelete and onUpdate",
        "Valid actions: Cascade, Restrict, NoAction, SetNull, SetDefault",
        "NEVER use: List, Array, or any other value",
      ],

      migrations: {
        development: "npx prisma db push (for prototyping)",
        production: "npx prisma migrate deploy (for production)",
        generate: "npx prisma generate (always after schema changes)",
      },
    },

    banned: [
      "Sequelize",
      "TypeORM (unless specifically requested)",
      "Raw SQL without Prisma (unless necessary)",
    ],
  },

  // ============================================
  // UI & STYLING
  // ============================================
  ui: {
    componentLibrary: "Shadcn UI",
    styling: "Tailwind CSS",
    version: "Tailwind 3.x",

    installation: "npx shadcn@latest init",
    components: "npx shadcn@latest add [component-name]",

    patterns: {
      serverComponents: "Use Shadcn components directly in Server Components",
      clientComponents:
        "Add 'use client' only when needed (forms, interactions)",
      theming: "Use CSS variables for theming (--primary, --background, etc.)",
      darkMode: "Use Tailwind's dark: prefix",
    },

    designPrinciples: [
      "Modern, clean aesthetics",
      "Glassmorphism for cards/modals",
      "Gradient accents for CTAs",
      "Smooth animations with Framer Motion",
      "Mobile-first responsive design",
      "Accessibility (ARIA labels, keyboard nav)",
    ],

    banned: [
      "Material UI (unless user requests)",
      "Bootstrap (outdated for modern Next.js)",
      "Inline styles (use Tailwind classes)",
    ],
  },

  // ============================================
  // STATE MANAGEMENT
  // ============================================
  state: {
    default: "React Server Components + URL state",
    clientState: "useState, useReducer",
    globalState: {
      light: "React Context",
      medium: "Zustand",
      heavy: "Redux Toolkit (only if necessary)",
    },

    rules: [
      "Prefer server-side data fetching in Server Components",
      "Use URL search params for filters/pagination",
      "Use React Context for theme, user preferences",
      "Use Zustand for complex client-side state (cart, multi-step forms)",
      "Avoid Redux unless app is extremely complex",
    ],
  },

  // ============================================
  // DATA FETCHING
  // ============================================
  dataFetching: {
    serverComponents: {
      method: "Direct async/await in component",
      caching: "Automatic with fetch() or unstable_cache()",
      revalidation: "Use revalidatePath() or revalidateTag()",
      example: `
// Server Component
export default async function Page() {
  const data = await prisma.post.findMany()
  return <div>{/* render data */}</div>
}
      `,
    },

    clientComponents: {
      library: "SWR or TanStack Query (React Query)",
      when: "User interactions, real-time data, optimistic updates",
      example: `
"use client"
import useSWR from 'swr'

export default function ClientComponent() {
  const { data } = useSWR('/api/data', fetcher)
  return <div>{/* render data */}</div>
}
      `,
    },

    serverActions: {
      when: "Forms, mutations, data writes",
      pattern: "use server directive",
      example: `
// actions.ts
"use server"
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'

export async function createPost(formData: FormData) {
  const title = formData.get('title')
  await prisma.post.create({ data: { title } })
  revalidatePath('/posts')
}
      `,
    },

    banned: [
      "getServerSideProps",
      "getStaticProps",
      "API routes for simple data fetching (use Server Components)",
    ],
  },

  // ============================================
  // PAYMENTS
  // ============================================
  payments: {
    provider: "Stripe",
    approach: "Stripe Checkout (recommended) or Stripe Elements",

    checkout: {
      when: "Simple subscription/payment flow",
      pattern: "Redirect to Stripe-hosted page",
      webhook: "Required for subscription status updates",
    },

    elements: {
      when: "Custom payment UI needed",
      complexity: "Higher - requires more code",
    },

    structure: [
      "Create checkout session API route",
      "Webhook handler for payment events",
      "Store subscription status in database",
      "Middleware to check subscription status",
    ],
  },

  // ============================================
  // FILE STRUCTURE
  // ============================================
  fileStructure: {
    recommended: `
src/
  app/
    (auth)/           # Auth routes (login, register)
      login/
        page.tsx
    (marketing)/      # Public routes (landing, pricing)
      page.tsx
      pricing/
        page.tsx
    dashboard/        # Protected routes
      page.tsx
      settings/
        page.tsx
    api/
      auth/
        [...nextauth]/
          route.ts
      webhooks/
        stripe/
          route.ts
  components/
    ui/              # Shadcn components
    [feature]/       # Feature-specific components
      FeatureCard.tsx
  lib/
    auth.ts          # NextAuth config
    prisma.ts        # Prisma client
    utils.ts         # Utility functions
  actions/           # Server Actions
    auth-actions.ts
    post-actions.ts
  prisma/
    schema.prisma
    `,
  },

  // ============================================
  // ENVIRONMENT VARIABLES
  // ============================================
  envVars: {
    required: ["DATABASE_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET"],

    naming: [
      "NEXT_PUBLIC_ prefix for client-side variables",
      "SCREAMING_SNAKE_CASE for all env vars",
    ],

    security: [
      "Never commit .env to git",
      "Use .env.example for documentation",
      "Validate env vars at startup (use Zod)",
    ],
  },
};

// ============================================
// HELPER: CHECK IF PATTERN IS BANNED
// ============================================
export function isBannedPattern(code: string): {
  isBanned: boolean;
  reason?: string;
  suggestion?: string;
} {
  // Check for NextAuth v4 patterns
  if (code.includes("authOptions")) {
    return {
      isBanned: true,
      reason: "Using NextAuth v4 'authOptions' pattern",
      suggestion:
        "Use NextAuth v5: export const { auth, handlers } = NextAuth({ ... })",
    };
  }

  if (code.includes("getServerSession")) {
    return {
      isBanned: true,
      reason: "Using NextAuth v4 'getServerSession' pattern",
      suggestion: "Use NextAuth v5: const session = await auth()",
    };
  }

  // Check for Pages Router patterns
  if (code.includes("getServerSideProps") || code.includes("getStaticProps")) {
    return {
      isBanned: true,
      reason: "Using Pages Router data fetching",
      suggestion: "Use App Router: async Server Components or Server Actions",
    };
  }

  // Check for invalid Prisma relation actions
  const invalidRelationActions = ["List", "Array"];
  for (const action of invalidRelationActions) {
    if (
      code.includes(`onDelete: ${action}`) ||
      code.includes(`onUpdate: ${action}`)
    ) {
      return {
        isBanned: true,
        reason: `Invalid Prisma relation action: ${action}`,
        suggestion: "Use: Cascade, Restrict, NoAction, SetNull, or SetDefault",
      };
    }
  }

  return { isBanned: false };
}

// Export for use in planning prompt
export const TECH_STACK_SUMMARY = `
MODERN TECH STACK (${new Date().getFullYear()}):
- Framework: Next.js 14+ (App Router ONLY)
- Auth: NextAuth v5 (use auth(), NOT authOptions/getServerSession)
- Database: Prisma 5.x
- UI: Shadcn UI + Tailwind CSS
- State: Server Components + URL state (Zustand for complex client state)
- Data: Server Components (async/await) or Server Actions
- Payments: Stripe Checkout
- Deployment: Vercel
`;
