// src/lib/agents/execution/database/providers/index.ts
/**
 * Database Providers Index
 * Central registry for all database providers
 */

import { logger } from "@/lib/logger";
import { BaseDatabaseProvider } from "./base-provider";
import { neonProvider } from "./neon-provider";
import { supabaseProvider } from "./supabase-provider";
import type {
  DatabaseProvider,
  ProviderConfig,
  ProvisioningOptions,
  ProvisioningResult,
  DatabaseCredentials,
} from "../types";

// Provider registry - only includes implemented providers
// MongoDB, PlanetScale, and Upstash are NOT implemented yet
const providers: Partial<Record<DatabaseProvider, BaseDatabaseProvider>> = {
  neon: neonProvider,
  supabase: supabaseProvider,
  // mongodb: NOT IMPLEMENTED - would need MongoDB Atlas provider
  // planetscale: NOT IMPLEMENTED - would need PlanetScale provider
  // upstash: NOT IMPLEMENTED - would need Upstash provider
};

// Providers that are not yet implemented
const UNIMPLEMENTED_PROVIDERS: DatabaseProvider[] = ["mongodb", "planetscale", "upstash"];

// Environment variable names for provider API keys
const PROVIDER_ENV_KEYS: Record<DatabaseProvider, string> = {
  neon: "NEON_API_KEY",
  supabase: "SUPABASE_API_KEY", // Matches env.ts definition
  mongodb: "MONGODB_ATLAS_PUBLIC_KEY", // Matches env.ts definition
  planetscale: "PLANETSCALE_API_KEY",
  upstash: "UPSTASH_REDIS_REST_TOKEN",
};

// Environment variable names for provider-specific organization/project IDs
const PROVIDER_ORG_ENV_KEYS: Partial<Record<DatabaseProvider, string>> = {
  neon: "NEON_ORG_ID",  // Required for Neon when account belongs to an organization
  supabase: "SUPABASE_ORG_ID",
  planetscale: "PLANETSCALE_ORG_ID",
  mongodb: "MONGODB_ATLAS_PROJECT_ID",
};

/**
 * Initialize a provider with API credentials
 */
export function initializeProvider(
  provider: DatabaseProvider,
  config?: Partial<ProviderConfig>
): boolean {
  const providerInstance = providers[provider];
  if (!providerInstance) {
    logger.warn(`[ProviderRegistry] Unknown provider: ${provider}`);
    return false;
  }

  // Get API key from environment or config
  const envKey = PROVIDER_ENV_KEYS[provider];
  const apiKey = config?.apiKey || (process.env as Record<string, string>)[envKey];

  if (!apiKey) {
    logger.warn(`[ProviderRegistry] No API key found for ${provider}. Set ${envKey} environment variable.`);
    return false;
  }

  // Get organization/project ID from environment or config (required for some providers)
  const orgEnvKey = PROVIDER_ORG_ENV_KEYS[provider];
  const orgId = config?.baseUrl || (orgEnvKey ? (process.env as Record<string, string>)[orgEnvKey] : undefined);

  // Warn if org ID is required but missing (for providers that need it)
  if (orgEnvKey && !orgId) {
    logger.warn(`[ProviderRegistry] No organization ID found for ${provider}. Set ${orgEnvKey} environment variable for project scoping.`);
  }

  providerInstance.initialize({
    apiKey,
    orgId,  // Organization ID for providers that require it (Neon, Supabase)
    baseUrl: config?.baseUrl,
    timeout: config?.timeout || 30000,
    region: config?.region,
  });

  return providerInstance.isConfigured();
}

/**
 * Get a provider instance
 */
export function getProvider(provider: DatabaseProvider): BaseDatabaseProvider | null {
  // Check if provider is not yet implemented
  if (UNIMPLEMENTED_PROVIDERS.includes(provider)) {
    logger.error(`[ProviderRegistry] Provider ${provider} is not yet implemented. Use 'neon' or 'supabase' instead.`);
    return null;
  }

  const providerInstance = providers[provider];
  if (!providerInstance) {
    logger.warn(`[ProviderRegistry] Unknown provider: ${provider}`);
    return null;
  }

  // Auto-initialize if not configured
  if (!providerInstance.isConfigured()) {
    initializeProvider(provider);
  }

  return providerInstance;
}

/**
 * Check if a provider is available (has API key configured AND is implemented)
 * For providers requiring org ID (like Supabase), also checks for that
 */
export function isProviderAvailable(provider: DatabaseProvider): boolean {
  // Unimplemented providers are never available
  if (UNIMPLEMENTED_PROVIDERS.includes(provider)) {
    return false;
  }
  const envKey = PROVIDER_ENV_KEYS[provider];
  const hasKey = !!(process.env as Record<string, string>)[envKey];

  // Some providers require additional configuration (org ID)
  const orgEnvKey = PROVIDER_ORG_ENV_KEYS[provider];
  if (orgEnvKey) {
    const hasOrgId = !!(process.env as Record<string, string>)[orgEnvKey];
    return hasKey && hasOrgId;
  }

  return hasKey;
}

/**
 * Get all available providers
 */
export function getAvailableProviders(): DatabaseProvider[] {
  return (Object.keys(PROVIDER_ENV_KEYS) as DatabaseProvider[]).filter(isProviderAvailable);
}

/**
 * Provision a database using the specified provider
 */
export async function provisionDatabase(
  options: ProvisioningOptions
): Promise<ProvisioningResult> {
  // Check for unimplemented providers first with specific error
  if (UNIMPLEMENTED_PROVIDERS.includes(options.provider)) {
    return {
      success: false,
      estimatedMonthlyCost: 0,
      provisioningTimeMs: 0,
      warnings: [],
      error: `Provider '${options.provider}' is not yet implemented. Currently supported providers: neon, supabase. Please select an alternative provider.`,
    };
  }

  const provider = getProvider(options.provider);

  if (!provider) {
    return {
      success: false,
      estimatedMonthlyCost: 0,
      provisioningTimeMs: 0,
      warnings: [],
      error: `Provider ${options.provider} not available. Check API key configuration.`,
    };
  }

  if (!provider.isConfigured()) {
    return {
      success: false,
      estimatedMonthlyCost: 0,
      provisioningTimeMs: 0,
      warnings: [],
      error: `Provider ${options.provider} not configured. Set ${PROVIDER_ENV_KEYS[options.provider]} environment variable.`,
    };
  }

  return provider.provision(options);
}

/**
 * Delete a database
 */
export async function deleteDatabase(
  provider: DatabaseProvider,
  resourceId: string
): Promise<{ success: boolean; error?: string }> {
  const providerInstance = getProvider(provider);

  if (!providerInstance) {
    return { success: false, error: `Provider ${provider} not available` };
  }

  return providerInstance.delete(resourceId);
}

/**
 * Test database connection
 */
export async function testConnection(
  provider: DatabaseProvider,
  credentials: DatabaseCredentials
): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  const providerInstance = getProvider(provider);

  if (!providerInstance) {
    return { success: false, error: `Provider ${provider} not available` };
  }

  return providerInstance.testConnection(credentials);
}

/**
 * Get provider recommendations based on requirements
 */
export function getProviderRecommendation(requirements: {
  needsRealtime?: boolean;
  needsAuth?: boolean;
  needsMongoDB?: boolean;
  needsMySQL?: boolean;
  needsCaching?: boolean;
}): {
  recommended: DatabaseProvider;
  available: DatabaseProvider[];
  reasoning: string;
} {
  const available = getAvailableProviders();

  if (available.length === 0) {
    return {
      recommended: "neon",
      available: [],
      reasoning: "No providers configured. Set API keys for database providers.",
    };
  }

  // MongoDB requirement
  if (requirements.needsMongoDB && available.includes("mongodb")) {
    return {
      recommended: "mongodb",
      available,
      reasoning: "MongoDB detected - using MongoDB Atlas",
    };
  }

  // MySQL requirement
  if (requirements.needsMySQL && available.includes("planetscale")) {
    return {
      recommended: "planetscale",
      available,
      reasoning: "MySQL detected - using PlanetScale",
    };
  }

  // Realtime/Auth requirement -> Supabase
  if ((requirements.needsRealtime || requirements.needsAuth) && available.includes("supabase")) {
    return {
      recommended: "supabase",
      available,
      reasoning: "Realtime or Auth features needed - using Supabase",
    };
  }

  // Default to Neon if available
  if (available.includes("neon")) {
    return {
      recommended: "neon",
      available,
      reasoning: "Default PostgreSQL provider - Neon (serverless, generous free tier)",
    };
  }

  // Fallback to first available
  return {
    recommended: available[0],
    available,
    reasoning: `Using ${available[0]} (first available provider)`,
  };
}

export {
  BaseDatabaseProvider,
  neonProvider,
  supabaseProvider,
};
