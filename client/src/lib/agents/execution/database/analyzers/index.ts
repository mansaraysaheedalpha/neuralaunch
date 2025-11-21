// src/lib/agents/execution/database/analyzers/index.ts
/**
 * Database Analyzers Index
 * Exports all analyzers and provides a unified analysis function
 */

import { logger } from "@/lib/logger";
import { dependencyAnalyzer } from "./dependency-analyzer";
import { featureAnalyzer } from "./feature-analyzer";
import type {
  DatabaseRequirements,
  DatabaseProvider,
  DatabaseType,
  ORMType,
  StorageEstimate,
} from "../types";

/**
 * Analyze project dependencies
 */
export async function analyzeDependencies(
  projectFiles: Record<string, string>
) {
  return dependencyAnalyzer.analyze(projectFiles);
}

/**
 * Analyze project features
 */
export async function analyzeFeatures(projectFiles: Record<string, string>) {
  return featureAnalyzer.analyze(projectFiles);
}

/**
 * Estimate storage requirements based on schema complexity
 */
export function estimateStorage(
  projectFiles: Record<string, string>,
  deps: Awaited<ReturnType<typeof analyzeDependencies>>
): StorageEstimate {
  let modelCount = 0;
  let complexityScore = 0;

  // Count Prisma models
  const prismaSchema = projectFiles['prisma/schema.prisma'];
  if (prismaSchema) {
    modelCount = (prismaSchema.match(/^model\s+\w+/gm) || []).length;
    const relationCount = (prismaSchema.match(/@relation/g) || []).length;
    complexityScore += modelCount * 10 + relationCount * 5;
  }

  // Count Drizzle tables
  for (const [path, content] of Object.entries(projectFiles)) {
    if (path.includes('drizzle') || path.includes('schema')) {
      const tableCount = (content.match(/pgTable\(|mysqlTable\(/g) || []).length;
      modelCount += tableCount;
      complexityScore += tableCount * 10;
    }
  }

  // Count MongoDB collections (from mongoose models)
  for (const content of Object.values(projectFiles)) {
    const mongoModels = (content.match(/mongoose\.model\(/g) || []).length;
    modelCount += mongoModels;
    complexityScore += mongoModels * 8;
  }

  // Estimate based on complexity
  let estimatedSize: StorageEstimate['estimatedSize'];
  let tier: StorageEstimate['tier'];
  let estimatedMonthlyCost: number;

  if (complexityScore < 50) {
    estimatedSize = 'small';
    tier = 'free';
    estimatedMonthlyCost = 0;
  } else if (complexityScore < 200) {
    estimatedSize = 'medium';
    tier = 'starter';
    estimatedMonthlyCost = 10;
  } else {
    estimatedSize = 'large';
    tier = 'pro';
    estimatedMonthlyCost = 25;
  }

  return {
    estimatedRows: modelCount * 10000, // Rough estimate
    estimatedSize,
    estimatedMonthlyCost,
    tier,
  };
}

/**
 * Select the best provider based on requirements
 */
export function selectProvider(
  deps: Awaited<ReturnType<typeof analyzeDependencies>>,
  features: Awaited<ReturnType<typeof analyzeFeatures>>
): { provider: DatabaseProvider; alternatives: DatabaseProvider[]; reasons: string[] } {
  const reasons: string[] = [];
  let selectedProvider: DatabaseProvider = 'neon';
  const alternatives: DatabaseProvider[] = [];

  // Check MongoDB
  if (deps.databaseDependencies.some(d => d.includes('mongo'))) {
    selectedProvider = 'mongodb';
    reasons.push('MongoDB dependencies detected');
    alternatives.push('neon'); // PostgreSQL with JSONB as alternative
  }
  // Check MySQL
  else if (deps.databaseDependencies.some(d => d.includes('mysql'))) {
    selectedProvider = 'planetscale';
    reasons.push('MySQL dependencies detected');
    alternatives.push('neon');
  }
  // Check Supabase indicators
  else if (features.needsRealtime || features.needsAuth) {
    selectedProvider = 'supabase';
    if (features.needsRealtime) reasons.push('Realtime features needed');
    if (features.needsAuth) reasons.push('Built-in auth needed');
    alternatives.push('neon');
  }
  // Default to Neon
  else {
    selectedProvider = 'neon';
    reasons.push('Default PostgreSQL provider (serverless, generous free tier)');
    alternatives.push('supabase');
  }

  // Add Redis if caching needed (Upstash is a supplementary cache, not primary DB)
  if (features.needsCaching) {
    alternatives.unshift('upstash');
    reasons.push('Consider adding Upstash Redis for caching');
  }

  return { provider: selectedProvider, alternatives, reasons };
}

/**
 * Get database type from provider
 */
export function getDatabaseType(provider: DatabaseProvider): DatabaseType {
  const mapping: Record<DatabaseProvider, DatabaseType> = {
    neon: 'postgresql',
    supabase: 'postgresql',
    mongodb: 'mongodb',
    planetscale: 'mysql',
    upstash: 'redis',
  };
  return mapping[provider];
}

/**
 * Main analysis function - combines all analyzers
 */
export async function analyzeProject(
  projectFiles: Record<string, string>
): Promise<DatabaseRequirements> {
  logger.info("[DatabaseAnalyzer] Starting comprehensive project analysis");

  // Run all analyses
  const [deps, features] = await Promise.all([
    analyzeDependencies(projectFiles),
    analyzeFeatures(projectFiles),
  ]);

  // Estimate storage
  const storage = estimateStorage(projectFiles, deps);

  // Select provider
  const { provider, alternatives, reasons } = selectProvider(deps, features);

  // Determine ORM (default to prisma if none detected for JS/TS)
  let orm: ORMType = deps.orm || 'prisma';
  if (deps.language === 'python') orm = 'raw';
  if (deps.language === 'ruby') orm = 'raw';
  if (deps.language === 'go') orm = 'raw';

  // Calculate confidence
  let confidence = 0.5; // Base confidence
  if (deps.orm) confidence += 0.2;
  if (deps.databaseDependencies.length > 0) confidence += 0.15;
  if (deps.hasMigrations) confidence += 0.1;
  if (features.detectedFeatures.length > 0) confidence += 0.05;

  const requirements: DatabaseRequirements = {
    preferredType: getDatabaseType(provider),
    recommendedProvider: provider,
    alternativeProviders: alternatives,
    orm,
    features,
    storage,
    confidence: Math.min(confidence, 1),
    reasoning: reasons,
  };

  logger.info("[DatabaseAnalyzer] Analysis complete", {
    provider: requirements.recommendedProvider,
    orm: requirements.orm,
    confidence: requirements.confidence,
  });

  return requirements;
}

export { dependencyAnalyzer, featureAnalyzer };
