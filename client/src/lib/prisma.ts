// lib/prisma.ts

import { PrismaClient, Prisma } from "@prisma/client";
import { env } from "@/lib/env";

/**
 * Coerce an already-validated typed value into Prisma.InputJsonValue.
 *
 * Use this everywhere a typed object (Zod-validated, schema-built, or
 * a TypeScript-typed array) needs to be written to a Prisma JSON
 * column. The single `as unknown as` cast lives here, so call sites
 * stay clean and the type safety pass (Stage 4) does not have to
 * audit dozens of duplicate casts.
 *
 * Only call this on values you have already validated. It does NOT
 * perform any runtime check — Prisma's InputJsonValue is a structural
 * type the compiler cannot always infer for nested generics.
 */
export function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

declare global {
  // allow global `var` declarations
   
  var prisma: PrismaClient | undefined;
}

const isProd = env.NODE_ENV === "production";

const prisma =
  global.prisma ||
  new PrismaClient({
    log: isProd 
      ? ["error", "warn"] 
      : ["query", "error", "warn"],
    errorFormat: isProd ? "minimal" : "pretty",
  });

if (!isProd) {
  global.prisma = prisma;
}

// Handle connection errors gracefully
prisma.$connect()
  .then(() => {
    if (!isProd) {
      console.log("✅ Database connected successfully");
    }
  })
  .catch((error) => {
    console.error("❌ Database connection failed:", error);
    // Don't crash the app, let it handle errors per-request
  });

// Graceful shutdown
process.on("beforeExit", () => {
  void prisma.$disconnect();
});

export default prisma;
