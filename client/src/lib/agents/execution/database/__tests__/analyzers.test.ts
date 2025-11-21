// src/lib/agents/execution/database/__tests__/analyzers.test.ts
/**
 * Tests for Database Analyzers
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { dependencyAnalyzer } from "../analyzers/dependency-analyzer";
import { featureAnalyzer } from "../analyzers/feature-analyzer";
import { analyzeProject, selectProvider, estimateStorage } from "../analyzers";

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

describe("DependencyAnalyzer", () => {
  it("should detect npm as default package manager", async () => {
    const files = {
      "package.json": JSON.stringify({ name: "test-app" }),
    };

    const result = await dependencyAnalyzer.analyze(files);
    expect(result.packageManager).toBe("npm");
  });

  it("should detect pnpm from lock file", async () => {
    const files = {
      "package.json": JSON.stringify({ name: "test-app" }),
      "pnpm-lock.yaml": "lockfileVersion: 6.0",
    };

    const result = await dependencyAnalyzer.analyze(files);
    expect(result.packageManager).toBe("pnpm");
  });

  it("should detect Prisma ORM", async () => {
    const files = {
      "package.json": JSON.stringify({
        name: "test-app",
        dependencies: {
          "@prisma/client": "^5.0.0",
        },
        devDependencies: {
          prisma: "^5.0.0",
        },
      }),
    };

    const result = await dependencyAnalyzer.analyze(files);
    expect(result.orm).toBe("prisma");
    expect(result.ormVersion).toBe("5.0.0");
  });

  it("should detect Drizzle ORM", async () => {
    const files = {
      "package.json": JSON.stringify({
        name: "test-app",
        dependencies: {
          "drizzle-orm": "^0.29.0",
        },
        devDependencies: {
          "drizzle-kit": "^0.20.0",
        },
      }),
    };

    const result = await dependencyAnalyzer.analyze(files);
    expect(result.orm).toBe("drizzle");
  });

  it("should detect Mongoose", async () => {
    const files = {
      "package.json": JSON.stringify({
        name: "test-app",
        dependencies: {
          mongoose: "^8.0.0",
        },
      }),
    };

    const result = await dependencyAnalyzer.analyze(files);
    expect(result.orm).toBe("mongoose");
  });

  it("should detect Next.js framework", async () => {
    const files = {
      "package.json": JSON.stringify({
        name: "test-app",
        dependencies: {
          next: "^14.0.0",
          react: "^18.0.0",
        },
      }),
    };

    const result = await dependencyAnalyzer.analyze(files);
    expect(result.framework).toBe("next");
  });

  it("should detect TypeScript", async () => {
    const files = {
      "package.json": JSON.stringify({ name: "test-app" }),
      "tsconfig.json": JSON.stringify({ compilerOptions: {} }),
    };

    const result = await dependencyAnalyzer.analyze(files);
    expect(result.language).toBe("typescript");
  });

  it("should detect migrations", async () => {
    const files = {
      "package.json": JSON.stringify({ name: "test-app" }),
      "prisma/migrations/001_init/migration.sql": "CREATE TABLE...",
    };

    const result = await dependencyAnalyzer.analyze(files);
    expect(result.hasMigrations).toBe(true);
    expect(result.migrationPaths).toContain("prisma/migrations");
  });

  it("should detect database dependencies", async () => {
    const files = {
      "package.json": JSON.stringify({
        name: "test-app",
        dependencies: {
          pg: "^8.11.0",
          "@neondatabase/serverless": "^0.6.0",
        },
      }),
    };

    const result = await dependencyAnalyzer.analyze(files);
    expect(result.databaseDependencies).toContain("pg");
    expect(result.databaseDependencies).toContain("@neondatabase/serverless");
  });
});

describe("FeatureAnalyzer", () => {
  it("should detect realtime features", async () => {
    const files = {
      "src/lib/realtime.ts": `
        import { supabase } from './supabase';
        const subscription = supabase.channel('room').subscribe();
      `,
    };

    const result = await featureAnalyzer.analyze(files);
    expect(result.needsRealtime).toBe(true);
  });

  it("should detect auth features", async () => {
    const files = {
      "src/auth.ts": `
        import bcrypt from 'bcrypt';
        async function signUp(email, password) {
          const hash = await bcrypt.hash(password, 10);
          return createUser({ email, password: hash });
        }
      `,
    };

    const result = await featureAnalyzer.analyze(files);
    expect(result.needsAuth).toBe(true);
  });

  it("should detect vector search features", async () => {
    const files = {
      "prisma/schema.prisma": `
        model Document {
          id String @id
          embedding Unsupported("vector(1536)")
        }
      `,
    };

    const result = await featureAnalyzer.analyze(files);
    expect(result.needsVectorSearch).toBe(true);
  });

  it("should detect caching features", async () => {
    const files = {
      "src/lib/cache.ts": `
        import Redis from 'ioredis';
        const redis = new Redis();
        await redis.set('key', 'value', 'EX', 3600);
      `,
    };

    const result = await featureAnalyzer.analyze(files);
    expect(result.needsCaching).toBe(true);
  });

  it("should detect edge compatibility", async () => {
    const files = {
      "src/app/api/route.ts": `
        import { neon } from '@neondatabase/serverless';
        export const runtime = 'edge';
      `,
    };

    const result = await featureAnalyzer.analyze(files);
    expect(result.needsEdgeCompatible).toBe(true);
  });
});

describe("Provider Selection", () => {
  it("should recommend Neon for basic PostgreSQL", async () => {
    const deps = await dependencyAnalyzer.analyze({
      "package.json": JSON.stringify({
        dependencies: { "@prisma/client": "^5.0.0", pg: "^8.0.0" },
      }),
    });
    const features = await featureAnalyzer.analyze({});

    const { provider, reasons } = selectProvider(deps, features);
    expect(provider).toBe("neon");
  });

  it("should recommend Supabase for realtime needs", async () => {
    const deps = await dependencyAnalyzer.analyze({
      "package.json": JSON.stringify({
        dependencies: { "@prisma/client": "^5.0.0" },
      }),
    });
    const features = await featureAnalyzer.analyze({
      "src/realtime.ts": "subscription realtime websocket",
    });

    const { provider, reasons } = selectProvider(deps, features);
    expect(provider).toBe("supabase");
  });

  it("should recommend MongoDB for mongoose", async () => {
    const deps = await dependencyAnalyzer.analyze({
      "package.json": JSON.stringify({
        dependencies: { mongoose: "^8.0.0", mongodb: "^6.0.0" },
      }),
    });
    const features = await featureAnalyzer.analyze({});

    const { provider } = selectProvider(deps, features);
    expect(provider).toBe("mongodb");
  });
});

describe("Storage Estimation", () => {
  it("should estimate small storage for simple schema", () => {
    const files = {
      "prisma/schema.prisma": `
        model User {
          id String @id
          email String
        }
      `,
    };

    const deps = {
      packageManager: "npm" as const,
      language: "typescript" as const,
      framework: "next",
      orm: "prisma" as const,
      ormVersion: "5.0.0",
      hasMigrations: false,
      migrationPaths: [],
      databaseDependencies: [],
    };

    const estimate = estimateStorage(files, deps);
    expect(estimate.estimatedSize).toBe("small");
    expect(estimate.tier).toBe("free");
    expect(estimate.estimatedMonthlyCost).toBe(0);
  });

  it("should estimate medium storage for complex schema", () => {
    const files = {
      "prisma/schema.prisma": `
        model User { id String @id }
        model Post { id String @id @relation }
        model Comment { id String @id @relation }
        model Like { id String @id @relation }
        model Tag { id String @id @relation }
        model Category { id String @id @relation }
        model Media { id String @id @relation }
        model Settings { id String @id @relation }
        model Notification { id String @id @relation }
        model Subscription { id String @id @relation }
      `,
    };

    const deps = {
      packageManager: "npm" as const,
      language: "typescript" as const,
      framework: "next",
      orm: "prisma" as const,
      ormVersion: "5.0.0",
      hasMigrations: false,
      migrationPaths: [],
      databaseDependencies: [],
    };

    const estimate = estimateStorage(files, deps);
    expect(estimate.estimatedSize).toBe("medium");
    expect(estimate.tier).toBe("starter");
  });
});

describe("Full Project Analysis", () => {
  it("should analyze a complete Next.js + Prisma project", async () => {
    const files = {
      "package.json": JSON.stringify({
        name: "my-app",
        dependencies: {
          next: "^14.0.0",
          react: "^18.0.0",
          "@prisma/client": "^5.0.0",
        },
        devDependencies: {
          prisma: "^5.0.0",
          typescript: "^5.0.0",
        },
      }),
      "tsconfig.json": JSON.stringify({ compilerOptions: {} }),
      "prisma/schema.prisma": `
        datasource db {
          provider = "postgresql"
          url = env("DATABASE_URL")
        }

        model User {
          id String @id @default(cuid())
          email String @unique
          posts Post[]
        }

        model Post {
          id String @id @default(cuid())
          title String
          authorId String
          author User @relation(fields: [authorId], references: [id])
        }
      `,
    };

    const requirements = await analyzeProject(files);

    expect(requirements.preferredType).toBe("postgresql");
    expect(requirements.recommendedProvider).toBe("neon");
    expect(requirements.orm).toBe("prisma");
    expect(requirements.confidence).toBeGreaterThan(0.5);
    expect(requirements.storage.tier).toBe("free");
  });

  it("should analyze a Supabase project with auth", async () => {
    const files = {
      "package.json": JSON.stringify({
        name: "my-app",
        dependencies: {
          next: "^14.0.0",
          "@supabase/supabase-js": "^2.0.0",
        },
      }),
      "src/lib/auth.ts": `
        import { supabase } from './supabase';

        export async function signUp(email: string, password: string) {
          return supabase.auth.signUp({ email, password });
        }

        export async function signIn(email: string, password: string) {
          return supabase.auth.signInWithPassword({ email, password });
        }
      `,
    };

    const requirements = await analyzeProject(files);

    expect(requirements.recommendedProvider).toBe("supabase");
    expect(requirements.features.needsAuth).toBe(true);
  });
});
