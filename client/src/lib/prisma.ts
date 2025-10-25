// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

declare global {
  // allow global `var` declarations
   
  var prisma: PrismaClient | undefined;
}

const isProd = process.env.NODE_ENV === "production";

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
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

export default prisma;
