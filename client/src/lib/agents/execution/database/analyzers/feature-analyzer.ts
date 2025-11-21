// src/lib/agents/execution/database/analyzers/feature-analyzer.ts
/**
 * Feature Analyzer
 * Analyzes code to detect required database features
 */

import { logger } from "@/lib/logger";
import type { FeatureRequirements } from "../types";

// Feature detection patterns
const FEATURE_PATTERNS = {
  realtime: {
    patterns: [
      /subscription/i,
      /realtime/i,
      /websocket/i,
      /socket\.io/i,
      /pusher/i,
      /ably/i,
      /onSnapshot/i, // Firebase-like
      /live\s*query/i,
    ],
    files: ['**/subscriptions/**', '**/ws/**', '**/socket/**'],
  },
  auth: {
    patterns: [
      /supabase.*auth/i,
      /createUser/i,
      /signIn/i,
      /signUp/i,
      /login.*user/i,
      /register.*user/i,
      /password.*hash/i,
      /bcrypt/i,
      /argon2/i,
      /session/i,
      /jwt/i,
    ],
    files: ['**/auth/**', '**/login/**', '**/signup/**'],
  },
  vectorSearch: {
    patterns: [
      /vector/i,
      /embedding/i,
      /pgvector/i,
      /cosine.*similarity/i,
      /semantic.*search/i,
      /openai.*embed/i,
      /vectorize/i,
    ],
    files: ['**/embeddings/**', '**/vectors/**', '**/ai/**'],
  },
  fullTextSearch: {
    patterns: [
      /full.*text.*search/i,
      /tsquery/i,
      /tsvector/i,
      /@@\s*to_tsquery/i,
      /search.*index/i,
      /elastic/i,
      /algolia/i,
      /meilisearch/i,
    ],
    files: ['**/search/**'],
  },
  caching: {
    patterns: [
      /redis/i,
      /cache/i,
      /memcache/i,
      /\.get\(['"]\w+['"]\)/i, // Redis-like get
      /\.set\(['"]\w+['"]/i, // Redis-like set
      /ttl/i,
      /expire/i,
    ],
    files: ['**/cache/**', '**/redis/**'],
  },
  edgeCompatible: {
    patterns: [
      /edge.*function/i,
      /edge.*runtime/i,
      /cloudflare.*worker/i,
      /vercel.*edge/i,
      /deno.*deploy/i,
      /@neondatabase\/serverless/i,
      /@planetscale\/database/i,
    ],
    files: [],
  },
};

export class FeatureAnalyzer {
  private readonly name = "FeatureAnalyzer";

  /**
   * Analyze project files to detect required database features
   */
  analyze(projectFiles: Record<string, string>): FeatureRequirements {
    logger.info(`[${this.name}] Starting feature analysis`);

    const requirements: FeatureRequirements = {
      needsRealtime: false,
      needsAuth: false,
      needsVectorSearch: false,
      needsFullTextSearch: false,
      needsCaching: false,
      needsEdgeCompatible: false,
      detectedFeatures: [],
    };

    // Combine all file contents for pattern matching
    const allContent = Object.values(projectFiles).join('\n');
    const allPaths = Object.keys(projectFiles);

    // Check each feature
    for (const [featureName, config] of Object.entries(FEATURE_PATTERNS)) {
      const detected = this.detectFeature(allContent, allPaths, config);

      if (detected.found) {
        switch (featureName) {
          case 'realtime':
            requirements.needsRealtime = true;
            break;
          case 'auth':
            requirements.needsAuth = true;
            break;
          case 'vectorSearch':
            requirements.needsVectorSearch = true;
            break;
          case 'fullTextSearch':
            requirements.needsFullTextSearch = true;
            break;
          case 'caching':
            requirements.needsCaching = true;
            break;
          case 'edgeCompatible':
            requirements.needsEdgeCompatible = true;
            break;
        }
        requirements.detectedFeatures.push(...detected.indicators);
      }
    }

    // Additional analysis for Prisma schema
    const prismaSchema = projectFiles['prisma/schema.prisma'];
    if (prismaSchema) {
      this.analyzePrismaSchema(prismaSchema, requirements);
    }

    // Additional analysis for Drizzle schema
    for (const [path, content] of Object.entries(projectFiles)) {
      if (path.includes('drizzle') && path.endsWith('.ts')) {
        this.analyzeDrizzleSchema(content, requirements);
      }
    }

    logger.info(`[${this.name}] Feature analysis complete`, {
      realtime: requirements.needsRealtime,
      auth: requirements.needsAuth,
      vector: requirements.needsVectorSearch,
      fts: requirements.needsFullTextSearch,
      caching: requirements.needsCaching,
      edge: requirements.needsEdgeCompatible,
    });

    return requirements;
  }

  /**
   * Detect a specific feature based on patterns and file paths
   */
  private detectFeature(
    content: string,
    paths: string[],
    config: { patterns: RegExp[]; files: string[] }
  ): { found: boolean; indicators: string[] } {
    const indicators: string[] = [];

    // Check content patterns
    for (const pattern of config.patterns) {
      const matches = content.match(new RegExp(pattern.source, 'gi'));
      if (matches && matches.length > 0) {
        indicators.push(`Pattern: ${pattern.source.substring(0, 30)}... (${matches.length} matches)`);
      }
    }

    // Check file path patterns
    for (const filePattern of config.files) {
      const regex = this.globToRegex(filePattern);
      const matchingPaths = paths.filter(p => regex.test(p));
      if (matchingPaths.length > 0) {
        indicators.push(`Files: ${matchingPaths.slice(0, 3).join(', ')}`);
      }
    }

    return {
      found: indicators.length > 0,
      indicators,
    };
  }

  /**
   * Analyze Prisma schema for additional features
   */
  private analyzePrismaSchema(schema: string, requirements: FeatureRequirements): void {
    // Check for extensions
    if (schema.includes('pgvector') || schema.includes('Unsupported("vector")')) {
      requirements.needsVectorSearch = true;
      requirements.detectedFeatures.push('Prisma: pgvector extension');
    }

    // Check for full-text search indexes
    if (schema.includes('@@fulltext') || schema.includes('@db.Tsvector')) {
      requirements.needsFullTextSearch = true;
      requirements.detectedFeatures.push('Prisma: Full-text search index');
    }

    // Check for complex relations indicating need for robust DB
    const relationCount = (schema.match(/@relation/g) || []).length;
    if (relationCount > 10) {
      requirements.detectedFeatures.push(`Prisma: ${relationCount} relations detected`);
    }

    // Check for User/Account models indicating auth
    if (schema.includes('model User') || schema.includes('model Account')) {
      requirements.needsAuth = true;
      requirements.detectedFeatures.push('Prisma: Auth models detected');
    }
  }

  /**
   * Analyze Drizzle schema for additional features
   */
  private analyzeDrizzleSchema(content: string, requirements: FeatureRequirements): void {
    // Check for vector types
    if (content.includes('vector(') || content.includes('pgvector')) {
      requirements.needsVectorSearch = true;
      requirements.detectedFeatures.push('Drizzle: pgvector column');
    }

    // Check for full-text search
    if (content.includes('tsvector') || content.includes('fullTextSearch')) {
      requirements.needsFullTextSearch = true;
      requirements.detectedFeatures.push('Drizzle: Full-text search');
    }

    // Check for user tables
    if (content.includes('users') && content.includes('password')) {
      requirements.needsAuth = true;
      requirements.detectedFeatures.push('Drizzle: Auth schema');
    }
  }

  /**
   * Convert glob pattern to regex
   */
  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    return new RegExp(escaped);
  }
}

export const featureAnalyzer = new FeatureAnalyzer();
