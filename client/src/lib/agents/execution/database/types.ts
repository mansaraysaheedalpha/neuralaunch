// src/lib/agents/execution/database/types.ts
/**
 * Database Agent Type Definitions
 * Comprehensive types for database provisioning and management
 */

// ==========================================
// PROVIDER TYPES
// ==========================================

export type DatabaseProvider =
  | 'neon'       // Default PostgreSQL (serverless)
  | 'supabase'   // PostgreSQL with realtime/auth
  | 'mongodb'    // MongoDB Atlas
  | 'planetscale'// MySQL (serverless)
  | 'upstash';   // Redis (caching)

export type DatabaseType =
  | 'postgresql'
  | 'mysql'
  | 'mongodb'
  | 'redis';

export type ORMType =
  | 'prisma'
  | 'drizzle'
  | 'typeorm'
  | 'mongoose'
  | 'sequelize'
  | 'knex'
  | 'raw';

// ==========================================
// ANALYSIS TYPES
// ==========================================

export interface DependencyAnalysis {
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
  language: 'typescript' | 'javascript' | 'python' | 'ruby' | 'go';
  framework: string | null; // next, express, fastify, etc.
  orm: ORMType | null;
  ormVersion: string | null;
  hasMigrations: boolean;
  migrationPaths: string[];
  databaseDependencies: string[];
}

export interface FeatureRequirements {
  needsRealtime: boolean;      // WebSocket, subscriptions
  needsAuth: boolean;          // Built-in auth (Supabase)
  needsVectorSearch: boolean;  // pgvector, embeddings
  needsFullTextSearch: boolean; // FTS capabilities
  needsCaching: boolean;       // Redis layer
  needsEdgeCompatible: boolean; // Serverless/edge runtime
  detectedFeatures: string[];  // List of detected feature indicators
}

export interface StorageEstimate {
  estimatedRows: number;
  estimatedSize: 'small' | 'medium' | 'large'; // <1GB, 1-10GB, >10GB
  estimatedMonthlyCost: number;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
}

export interface DatabaseRequirements {
  preferredType: DatabaseType;
  recommendedProvider: DatabaseProvider;
  alternativeProviders: DatabaseProvider[];
  orm: ORMType;
  features: FeatureRequirements;
  storage: StorageEstimate;
  confidence: number; // 0-1 confidence in detection
  reasoning: string[];
}

// ==========================================
// PROVISIONING TYPES
// ==========================================

export interface ProviderConfig {
  apiKey: string;
  orgId?: string;  // Required for Neon when account belongs to an organization
  baseUrl?: string;
  timeout?: number;
  region?: string;
}

export interface DatabaseCredentials {
  provider: DatabaseProvider;
  databaseType: DatabaseType;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  sslMode: 'require' | 'prefer' | 'disable';
  connectionString: string;
  directUrl?: string; // For Prisma pooling
  additionalEnvVars: Record<string, string>;
}

export interface ProvisioningOptions {
  provider: DatabaseProvider;
  projectName: string;
  region?: string;
  tier?: 'free' | 'starter' | 'pro';
  features?: {
    enableBranching?: boolean;   // Neon
    enableRealtime?: boolean;    // Supabase
    enableEdgeFunctions?: boolean;
  };
}

export interface ProvisioningResult {
  success: boolean;
  credentials?: DatabaseCredentials;
  resourceId?: string;
  resourceUrl?: string;
  estimatedMonthlyCost: number;
  provisioningTimeMs: number;
  warnings: string[];
  error?: string;
}

// ==========================================
// INITIALIZATION TYPES
// ==========================================

export interface SchemaInitOptions {
  orm: ORMType;
  projectPath: string;
  credentials: DatabaseCredentials;
  skipSeed?: boolean;
  generateClient?: boolean;
}

export interface MigrationResult {
  success: boolean;
  migrationsRun: string[];
  tablesCreated: string[];
  duration: number;
  error?: string;
  stdout?: string;
  stderr?: string;
}

// ==========================================
// CONFIGURATION TYPES
// ==========================================

export interface EnvVarConfig {
  name: string;
  value: string;
  description: string;
  sensitive: boolean;
}

export interface ConfigurationResult {
  success: boolean;
  envVarsInjected: EnvVarConfig[];
  filesModified: string[];
  envExampleUpdated: boolean;
  warnings: string[];
  error?: string;
}

// ==========================================
// ROLLBACK TYPES
// ==========================================

export interface RollbackStep {
  action: 'delete_database' | 'remove_env_vars' | 'revert_file' | 'remove_file';
  target: string;
  data?: unknown;
  timestamp: Date;
}

export interface RollbackPlan {
  steps: RollbackStep[];
  canRollback: boolean;
  warnings: string[];
}

// ==========================================
// AGENT OUTPUT TYPES
// ==========================================

export interface DatabaseAgentInput {
  taskId: string;
  projectId: string;
  userId: string;
  conversationId: string;
  taskDetails: {
    title: string;
    description: string;
    complexity: 'simple' | 'medium';
    estimatedLines: number;
    mode?: 'provision' | 'fix' | 'migrate' | 'schema';
    overrideProvider?: DatabaseProvider;
    overrideOrm?: ORMType;
    [key: string]: unknown;
  };
  context: {
    techStack?: {
      database?: {
        type?: string;
        provider?: string;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export interface DatabaseAgentOutput {
  success: boolean;
  message: string;
  iterations: number;
  durationMs: number;
  data?: {
    // Analysis results
    requirements?: DatabaseRequirements;

    // Provisioning results
    credentials?: Partial<DatabaseCredentials>; // Redacted for security
    resourceId?: string;
    resourceUrl?: string;

    // Configuration results
    envVarsInjected?: string[]; // Names only
    filesCreated?: Array<{ path: string; linesOfCode: number }>;
    filesModified?: string[];

    // Migration results
    migrationsRun?: string[];
    tablesCreated?: string[];

    // Metadata
    provider?: DatabaseProvider;
    estimatedMonthlyCost?: number;
    connectionVerified?: boolean;

    // Standard agent output fields
    commandsRun?: Array<{ command: string }>;
    explanation?: string;
  };
  error?: string;
  warnings?: string[];
  rollbackPlan?: RollbackPlan;
}

// ==========================================
// PROVIDER API RESPONSE TYPES
// ==========================================

export interface NeonProject {
  id: string;
  name: string;
  region_id: string;
  created_at: string;
  updated_at: string;
  databases: Array<{
    id: string;
    name: string;
    owner_name: string;
  }>;
  branches: Array<{
    id: string;
    name: string;
    current_state: string;
  }>;
  endpoints: Array<{
    id: string;
    host: string;
    type: string;
  }>;
  roles: Array<{
    name: string;
    password?: string;
  }>;
}

export interface SupabaseProject {
  id: string;
  name: string;
  region: string;
  status: string;
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  api: {
    url: string;
    anon_key: string;
    service_role_key: string;
  };
}

export interface MongoDBCluster {
  id: string;
  name: string;
  connectionString: string;
  state: string;
  regionName: string;
}

export interface PlanetScaleDatabase {
  id: string;
  name: string;
  region: string;
  state: string;
  connection_strings: {
    host: string;
    username: string;
    password: string;
  };
}

export interface UpstashDatabase {
  database_id: string;
  database_name: string;
  endpoint: string;
  port: number;
  password: string;
  rest_token: string;
}

// ==========================================
// LOGGING AND METRICS
// ==========================================

export interface DatabaseAgentMetrics {
  analysisTimeMs: number;
  provisioningTimeMs: number;
  configurationTimeMs: number;
  initializationTimeMs: number;
  totalTimeMs: number;
  retryCount: number;
  provider: DatabaseProvider;
  tier: string;
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  phase: 'analysis' | 'provisioning' | 'configuration' | 'initialization' | 'verification';
  message: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}
