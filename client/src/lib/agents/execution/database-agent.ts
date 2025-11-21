// src/lib/agents/execution/database-agent.ts
/**
 * Database Agent - Re-export from new modular implementation
 *
 * This file now re-exports the enhanced Database Agent from the database/ module.
 * The new implementation includes:
 * - Multi-provider support (Neon, Supabase, MongoDB, PlanetScale, Upstash)
 * - Automatic requirement detection
 * - Full provisioning lifecycle
 * - Rollback mechanisms
 * - ORM-specific initialization
 *
 * For backward compatibility, this file maintains the same export interface.
 */

// Re-export the new enhanced Database Agent
export { DatabaseAgent, databaseAgent } from "./database";
export * from "./database/types";

// Type re-exports for consumers still using the old import path
export type {
  DatabaseAgentOutput,
  DatabaseRequirements,
  DatabaseCredentials,
  DatabaseProvider,
  ORMType,
  FeatureRequirements,
} from "./database/types";
