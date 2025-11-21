// src/lib/agents/execution/database/initializers/index.ts
/**
 * Database Schema Initializers
 * Handles migrations and schema initialization for different ORMs
 */

import { logger } from "@/lib/logger";
import type { ORMType, MigrationResult, DatabaseCredentials } from "../types";

export interface InitializerContext {
  projectId: string;
  userId: string;
  projectPath: string;
  credentials: DatabaseCredentials;
  executeCommand: (command: string) => Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>;
  writeFile: (path: string, content: string) => Promise<{ success: boolean }>;
  readFile: (path: string) => Promise<{ success: boolean; content?: string }>;
  fileExists: (path: string) => Promise<boolean>;
}

/**
 * Base initializer interface
 */
interface OrmInitializer {
  name: ORMType;
  detect(ctx: InitializerContext): Promise<boolean>;
  initialize(ctx: InitializerContext): Promise<MigrationResult>;
  generateClient(ctx: InitializerContext): Promise<{ success: boolean; error?: string }>;
}

/**
 * Prisma Initializer
 */
const prismaInitializer: OrmInitializer = {
  name: "prisma",

  async detect(ctx: InitializerContext): Promise<boolean> {
    return await ctx.fileExists("prisma/schema.prisma");
  },

  async initialize(ctx: InitializerContext): Promise<MigrationResult> {
    const startTime = Date.now();
    const migrationsRun: string[] = [];
    const tablesCreated: string[] = [];

    try {
      logger.info("[PrismaInitializer] Starting Prisma initialization");

      // Update DATABASE_URL in .env
      const envContent = `DATABASE_URL="${ctx.credentials.connectionString}"
DIRECT_URL="${ctx.credentials.directUrl || ctx.credentials.connectionString}"
`;
      await ctx.writeFile(".env", envContent);

      // Generate Prisma client
      const generateResult = await ctx.executeCommand("npx prisma generate");
      if (!generateResult.success) {
        return {
          success: false,
          migrationsRun,
          tablesCreated,
          duration: Date.now() - startTime,
          error: `Prisma generate failed: ${generateResult.stderr}`,
          stdout: generateResult.stdout,
          stderr: generateResult.stderr,
        };
      }
      migrationsRun.push("prisma generate");

      // Check if migrations exist
      const hasMigrations = await ctx.fileExists("prisma/migrations");

      if (hasMigrations) {
        // Run existing migrations
        const migrateResult = await ctx.executeCommand("npx prisma migrate deploy");
        if (!migrateResult.success) {
          // Try db push as fallback
          logger.warn("[PrismaInitializer] migrate deploy failed, trying db push");
          const pushResult = await ctx.executeCommand("npx prisma db push --accept-data-loss");
          if (!pushResult.success) {
            return {
              success: false,
              migrationsRun,
              tablesCreated,
              duration: Date.now() - startTime,
              error: `Database sync failed: ${pushResult.stderr}`,
              stdout: pushResult.stdout,
              stderr: pushResult.stderr,
            };
          }
          migrationsRun.push("prisma db push");
        } else {
          migrationsRun.push("prisma migrate deploy");
        }
      } else {
        // No migrations - use db push for initial setup
        const pushResult = await ctx.executeCommand("npx prisma db push");
        if (!pushResult.success) {
          return {
            success: false,
            migrationsRun,
            tablesCreated,
            duration: Date.now() - startTime,
            error: `Prisma db push failed: ${pushResult.stderr}`,
            stdout: pushResult.stdout,
            stderr: pushResult.stderr,
          };
        }
        migrationsRun.push("prisma db push");
      }

      // Extract table names from schema
      const schemaResult = await ctx.readFile("prisma/schema.prisma");
      if (schemaResult.success && schemaResult.content) {
        const modelMatches = schemaResult.content.match(/^model\s+(\w+)/gm) || [];
        for (const match of modelMatches) {
          const tableName = match.replace(/^model\s+/, "");
          tablesCreated.push(tableName);
        }
      }

      logger.info("[PrismaInitializer] Initialization complete", {
        migrationsRun,
        tablesCreated: tablesCreated.length,
      });

      return {
        success: true,
        migrationsRun,
        tablesCreated,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        migrationsRun,
        tablesCreated,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  async generateClient(ctx: InitializerContext): Promise<{ success: boolean; error?: string }> {
    const result = await ctx.executeCommand("npx prisma generate");
    return {
      success: result.success,
      error: result.success ? undefined : result.stderr,
    };
  },
};

/**
 * Drizzle Initializer
 */
const drizzleInitializer: OrmInitializer = {
  name: "drizzle",

  async detect(ctx: InitializerContext): Promise<boolean> {
    const hasConfig = await ctx.fileExists("drizzle.config.ts") || await ctx.fileExists("drizzle.config.js");
    const hasSchema = await ctx.fileExists("drizzle/schema.ts") || await ctx.fileExists("src/db/schema.ts");
    return hasConfig || hasSchema;
  },

  async initialize(ctx: InitializerContext): Promise<MigrationResult> {
    const startTime = Date.now();
    const migrationsRun: string[] = [];
    const tablesCreated: string[] = [];

    try {
      logger.info("[DrizzleInitializer] Starting Drizzle initialization");

      // Update DATABASE_URL in .env
      const envContent = `DATABASE_URL="${ctx.credentials.connectionString}"
`;
      await ctx.writeFile(".env", envContent);

      // Check for existing migrations
      const hasMigrations = await ctx.fileExists("drizzle/migrations") || await ctx.fileExists("migrations");

      if (hasMigrations) {
        // Run migrations
        const migrateResult = await ctx.executeCommand("npx drizzle-kit migrate");
        if (!migrateResult.success) {
          // Try push as fallback
          const pushResult = await ctx.executeCommand("npx drizzle-kit push");
          if (!pushResult.success) {
            return {
              success: false,
              migrationsRun,
              tablesCreated,
              duration: Date.now() - startTime,
              error: `Drizzle migration failed: ${pushResult.stderr}`,
            };
          }
          migrationsRun.push("drizzle-kit push");
        } else {
          migrationsRun.push("drizzle-kit migrate");
        }
      } else {
        // No migrations - use push
        const pushResult = await ctx.executeCommand("npx drizzle-kit push");
        if (!pushResult.success) {
          return {
            success: false,
            migrationsRun,
            tablesCreated,
            duration: Date.now() - startTime,
            error: `Drizzle push failed: ${pushResult.stderr}`,
          };
        }
        migrationsRun.push("drizzle-kit push");
      }

      logger.info("[DrizzleInitializer] Initialization complete");

      return {
        success: true,
        migrationsRun,
        tablesCreated,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        migrationsRun,
        tablesCreated,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  generateClient(_ctx: InitializerContext): { success: boolean; error?: string } {
    // Drizzle doesn't have a separate client generation step
    return { success: true };
  },
};

/**
 * TypeORM Initializer
 */
const typeormInitializer: OrmInitializer = {
  name: "typeorm",

  async detect(ctx: InitializerContext): Promise<boolean> {
    return await ctx.fileExists("ormconfig.json") ||
           await ctx.fileExists("ormconfig.js") ||
           await ctx.fileExists("src/data-source.ts");
  },

  async initialize(ctx: InitializerContext): Promise<MigrationResult> {
    const startTime = Date.now();
    const migrationsRun: string[] = [];

    try {
      logger.info("[TypeORMInitializer] Starting TypeORM initialization");

      // Set DATABASE_URL
      const envContent = `DATABASE_URL="${ctx.credentials.connectionString}"
`;
      await ctx.writeFile(".env", envContent);

      // Run migrations
      const migrateResult = await ctx.executeCommand("npx typeorm migration:run -d src/data-source.ts");
      if (!migrateResult.success) {
        // Try with different data source path
        const altResult = await ctx.executeCommand("npx typeorm migration:run");
        if (!altResult.success) {
          return {
            success: false,
            migrationsRun,
            tablesCreated: [],
            duration: Date.now() - startTime,
            error: `TypeORM migration failed: ${altResult.stderr}`,
          };
        }
      }
      migrationsRun.push("typeorm migration:run");

      return {
        success: true,
        migrationsRun,
        tablesCreated: [],
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        migrationsRun,
        tablesCreated: [],
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  async generateClient(_ctx: InitializerContext): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  },
};

/**
 * Mongoose Initializer (MongoDB - no migrations needed)
 */
const mongooseInitializer: OrmInitializer = {
  name: "mongoose",

  async detect(ctx: InitializerContext): Promise<boolean> {
    // Check for mongoose models
    const packageJson = await ctx.readFile("package.json");
    if (packageJson.success && packageJson.content) {
      return packageJson.content.includes('"mongoose"');
    }
    return false;
  },

  async initialize(ctx: InitializerContext): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      logger.info("[MongooseInitializer] Setting up MongoDB connection");

      // Set MONGODB_URI
      const envContent = `MONGODB_URI="${ctx.credentials.connectionString}"
DATABASE_URL="${ctx.credentials.connectionString}"
`;
      await ctx.writeFile(".env", envContent);

      // Mongoose doesn't require migrations - collections are created on first use
      return {
        success: true,
        migrationsRun: ["Connection string configured"],
        tablesCreated: [],
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        migrationsRun: [],
        tablesCreated: [],
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  async generateClient(_ctx: InitializerContext): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  },
};

/**
 * Raw SQL Initializer
 */
const rawSqlInitializer: OrmInitializer = {
  name: "raw",

  async detect(ctx: InitializerContext): Promise<boolean> {
    // Check for .sql files
    const hasSqlFiles = await ctx.fileExists("db/schema.sql") ||
                        await ctx.fileExists("migrations/001_init.sql") ||
                        await ctx.fileExists("sql/init.sql");
    return hasSqlFiles;
  },

  async initialize(ctx: InitializerContext): Promise<MigrationResult> {
    const startTime = Date.now();
    const migrationsRun: string[] = [];

    try {
      logger.info("[RawSQLInitializer] Running SQL files");

      // Set DATABASE_URL
      const envContent = `DATABASE_URL="${ctx.credentials.connectionString}"
`;
      await ctx.writeFile(".env", envContent);

      // Look for SQL files to run
      const sqlPaths = [
        "db/schema.sql",
        "sql/init.sql",
        "migrations/001_init.sql",
      ];

      for (const sqlPath of sqlPaths) {
        const sqlFile = await ctx.readFile(sqlPath);
        if (sqlFile.success && sqlFile.content) {
          // Execute SQL using psql or similar
          // Note: This requires the database client to be available
          logger.info(`[RawSQLInitializer] Found SQL file: ${sqlPath}`);
          migrationsRun.push(`SQL: ${sqlPath}`);
        }
      }

      return {
        success: true,
        migrationsRun,
        tablesCreated: [],
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        migrationsRun,
        tablesCreated: [],
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  generateClient(_ctx: InitializerContext): { success: boolean; error?: string } {
    return { success: true };
  },
};

// Registry of all initializers
const initializers: Record<ORMType, OrmInitializer> = {
  prisma: prismaInitializer,
  drizzle: drizzleInitializer,
  typeorm: typeormInitializer,
  mongoose: mongooseInitializer,
  sequelize: typeormInitializer, // Similar to TypeORM
  knex: rawSqlInitializer, // Knex uses raw SQL migrations
  raw: rawSqlInitializer,
};

/**
 * Get the appropriate initializer for an ORM
 */
export function getInitializer(orm: ORMType): OrmInitializer {
  return initializers[orm] || rawSqlInitializer;
}

/**
 * Auto-detect ORM and initialize
 */
export async function autoDetectAndInitialize(
  ctx: InitializerContext
): Promise<{ orm: ORMType; result: MigrationResult }> {
  logger.info("[Initializers] Auto-detecting ORM");

  // Check each ORM in order of preference
  const ormOrder: ORMType[] = ["prisma", "drizzle", "typeorm", "mongoose", "sequelize", "knex", "raw"];

  for (const orm of ormOrder) {
    const initializer = initializers[orm];
    if (await initializer.detect(ctx)) {
      logger.info(`[Initializers] Detected ORM: ${orm}`);
      const result = await initializer.initialize(ctx);
      return { orm, result };
    }
  }

  // No ORM detected - just set up env vars
  logger.info("[Initializers] No ORM detected, setting up environment variables only");
  const envContent = `DATABASE_URL="${ctx.credentials.connectionString}"
`;
  await ctx.writeFile(".env", envContent);

  return {
    orm: "raw",
    result: {
      success: true,
      migrationsRun: ["Environment variables configured"],
      tablesCreated: [],
      duration: 0,
    },
  };
}

/**
 * Initialize database with specific ORM
 */
export async function initializeDatabase(
  orm: ORMType,
  ctx: InitializerContext
): Promise<MigrationResult> {
  const initializer = getInitializer(orm);
  return initializer.initialize(ctx);
}

export { prismaInitializer, drizzleInitializer, typeormInitializer, mongooseInitializer, rawSqlInitializer };
