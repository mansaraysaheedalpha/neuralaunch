// src/lib/agents/execution/database/analyzers/dependency-analyzer.ts
/**
 * Dependency Analyzer
 * Scans project files to detect database-related dependencies and ORM
 */

import { logger } from "@/lib/logger";
import type { DependencyAnalysis, ORMType } from "../types";

// ORM detection patterns
const ORM_PATTERNS: Record<ORMType, string[]> = {
  prisma: ['prisma', '@prisma/client'],
  drizzle: ['drizzle-orm', 'drizzle-kit'],
  typeorm: ['typeorm'],
  mongoose: ['mongoose'],
  sequelize: ['sequelize'],
  knex: ['knex'],
  raw: [], // Fallback
};

// Database driver patterns
const DATABASE_PATTERNS: Record<string, string[]> = {
  postgresql: ['pg', 'postgres', 'postgresql', 'neon', '@neondatabase/serverless'],
  mysql: ['mysql', 'mysql2', '@planetscale/database'],
  mongodb: ['mongodb', 'mongoose'],
  redis: ['redis', 'ioredis', '@upstash/redis'],
  sqlite: ['better-sqlite3', 'sqlite3'],
};

// Framework detection patterns
const FRAMEWORK_PATTERNS: Record<string, string[]> = {
  next: ['next'],
  express: ['express'],
  fastify: ['fastify'],
  nestjs: ['@nestjs/core'],
  hono: ['hono'],
  remix: ['@remix-run/node'],
  nuxt: ['nuxt'],
  django: ['django'],
  rails: ['rails'],
};

export class DependencyAnalyzer {
  private readonly name = "DependencyAnalyzer";

  /**
   * Analyze project dependencies to detect database requirements
   */
  analyze(projectFiles: Record<string, string>): DependencyAnalysis {
    logger.info(`[${this.name}] Starting dependency analysis`);

    const result: DependencyAnalysis = {
      packageManager: 'npm',
      language: 'typescript',
      framework: null,
      orm: null,
      ormVersion: null,
      hasMigrations: false,
      migrationPaths: [],
      databaseDependencies: [],
    };

    // Detect package manager
    result.packageManager = this.detectPackageManager(projectFiles);

    // Detect language
    result.language = this.detectLanguage(projectFiles);

    // Parse package.json for JS/TS projects
    const packageJson = this.parsePackageJson(projectFiles);
    if (packageJson) {
      const deps = this.extractAllDependencies(packageJson);

      // Detect ORM
      const ormInfo = this.detectORM(deps, packageJson);
      result.orm = ormInfo.orm;
      result.ormVersion = ormInfo.version;

      // Detect framework
      result.framework = this.detectFramework(deps);

      // Detect database dependencies
      result.databaseDependencies = this.detectDatabaseDeps(deps);
    }

    // Detect Python dependencies
    if (projectFiles['requirements.txt']) {
      this.parsePythonDeps(projectFiles['requirements.txt'], result);
    }

    // Detect Ruby dependencies
    if (projectFiles['Gemfile']) {
      this.parseRubyDeps(projectFiles['Gemfile'], result);
    }

    // Detect Go dependencies
    if (projectFiles['go.mod']) {
      this.parseGoDeps(projectFiles['go.mod'], result);
    }

    // Detect migrations
    result.migrationPaths = this.detectMigrationPaths(Object.keys(projectFiles));
    result.hasMigrations = result.migrationPaths.length > 0;

    logger.info(`[${this.name}] Analysis complete`, {
      orm: result.orm,
      framework: result.framework,
      hasMigrations: result.hasMigrations,
    });

    return result;
  }

  /**
   * Detect package manager based on lock files
   */
  private detectPackageManager(files: Record<string, string>): DependencyAnalysis['packageManager'] {
    if (files['bun.lockb'] || files['bun.lock']) return 'bun';
    if (files['pnpm-lock.yaml']) return 'pnpm';
    if (files['yarn.lock']) return 'yarn';
    return 'npm';
  }

  /**
   * Detect primary language
   */
  private detectLanguage(files: Record<string, string>): DependencyAnalysis['language'] {
    if (files['tsconfig.json']) return 'typescript';
    if (files['requirements.txt'] || files['pyproject.toml']) return 'python';
    if (files['Gemfile']) return 'ruby';
    if (files['go.mod']) return 'go';
    return 'javascript';
  }

  /**
   * Parse package.json
   */
  private parsePackageJson(files: Record<string, string>): Record<string, unknown> | null {
    const content = files['package.json'];
    if (!content) return null;

    try {
      return JSON.parse(content);
    } catch (e) {
      logger.warn(`[${this.name}] Failed to parse package.json`);
      return null;
    }
  }

  /**
   * Extract all dependencies from package.json
   */
  private extractAllDependencies(packageJson: Record<string, unknown>): Record<string, string> {
    const deps: Record<string, string> = {};

    const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies'];
    for (const field of dependencyFields) {
      const fieldDeps = packageJson[field] as Record<string, string> | undefined;
      if (fieldDeps) {
        Object.assign(deps, fieldDeps);
      }
    }

    return deps;
  }

  /**
   * Detect ORM from dependencies
   */
  private detectORM(deps: Record<string, string>, packageJson: Record<string, unknown>): { orm: ORMType | null; version: string | null } {
    // Check each ORM pattern
    for (const [orm, patterns] of Object.entries(ORM_PATTERNS)) {
      for (const pattern of patterns) {
        if (deps[pattern]) {
          return {
            orm: orm as ORMType,
            version: this.cleanVersion(deps[pattern]),
          };
        }
      }
    }

    // Check for Prisma schema file indicator in scripts
    const scripts = packageJson.scripts as Record<string, string> | undefined;
    if (scripts) {
      const hassPrismaScript = Object.values(scripts).some(
        script => script.includes('prisma')
      );
      if (hassPrismaScript) {
        return { orm: 'prisma', version: null };
      }
    }

    return { orm: null, version: null };
  }

  /**
   * Detect framework from dependencies
   */
  private detectFramework(deps: Record<string, string>): string | null {
    for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
      for (const pattern of patterns) {
        if (deps[pattern]) {
          return framework;
        }
      }
    }
    return null;
  }

  /**
   * Detect database-related dependencies
   */
  private detectDatabaseDeps(deps: Record<string, string>): string[] {
    const dbDeps: string[] = [];

    for (const patterns of Object.values(DATABASE_PATTERNS)) {
      for (const pattern of patterns) {
        if (deps[pattern]) {
          dbDeps.push(pattern);
        }
      }
    }

    return dbDeps;
  }

  /**
   * Parse Python requirements.txt
   */
  private parsePythonDeps(content: string, result: DependencyAnalysis): void {
    result.language = 'python';

    const pythonOrmPatterns: Record<string, ORMType> = {
      'django': 'raw', // Django ORM is built-in
      'sqlalchemy': 'raw',
      'tortoise-orm': 'raw',
      'peewee': 'raw',
      'pymongo': 'mongoose', // Closest equivalent
    };

    const pythonDbPatterns = ['psycopg2', 'mysql-connector', 'pymysql', 'motor', 'redis'];

    const lines = content.toLowerCase().split('\n');
    for (const line of lines) {
      const pkg = line.split('==')[0].split('>=')[0].split('<=')[0].trim();

      for (const [pattern, orm] of Object.entries(pythonOrmPatterns)) {
        if (pkg.includes(pattern)) {
          result.orm = orm;
          result.ormVersion = this.extractPythonVersion(line);
        }
      }

      for (const pattern of pythonDbPatterns) {
        if (pkg.includes(pattern)) {
          result.databaseDependencies.push(pkg);
        }
      }
    }
  }

  /**
   * Parse Ruby Gemfile
   */
  private parseRubyDeps(content: string, result: DependencyAnalysis): void {
    result.language = 'ruby';
    result.orm = 'raw'; // Rails uses ActiveRecord

    const rubyDbGems = ['pg', 'mysql2', 'sqlite3', 'mongoid', 'redis'];

    const lines = content.toLowerCase().split('\n');
    for (const line of lines) {
      for (const gem of rubyDbGems) {
        if (line.includes(`gem '${gem}'`) || line.includes(`gem "${gem}"`)) {
          result.databaseDependencies.push(gem);
        }
      }
    }
  }

  /**
   * Parse Go go.mod
   */
  private parseGoDeps(content: string, result: DependencyAnalysis): void {
    result.language = 'go';

    const goOrmPatterns: Record<string, ORMType> = {
      'gorm.io/gorm': 'raw',
      'github.com/jmoiron/sqlx': 'raw',
      'entgo.io/ent': 'raw',
    };

    const goDbPatterns = ['lib/pq', 'go-sql-driver/mysql', 'mongo-driver', 'go-redis'];

    const lines = content.toLowerCase().split('\n');
    for (const line of lines) {
      for (const [pattern, orm] of Object.entries(goOrmPatterns)) {
        if (line.includes(pattern)) {
          result.orm = orm;
        }
      }

      for (const pattern of goDbPatterns) {
        if (line.includes(pattern)) {
          result.databaseDependencies.push(pattern);
        }
      }
    }
  }

  /**
   * Detect migration file paths
   */
  private detectMigrationPaths(filePaths: string[]): string[] {
    const migrationPatterns = [
      /prisma\/migrations\//,
      /migrations\//,
      /db\/migrate\//,
      /drizzle\//,
      /alembic\//,
      /sequelize\/migrations\//,
    ];

    const migrationPaths = new Set<string>();

    for (const path of filePaths) {
      for (const pattern of migrationPatterns) {
        if (pattern.test(path)) {
          // Extract the migration directory
          const match = path.match(pattern);
          if (match) {
            const dir = path.substring(0, path.indexOf(match[0]) + match[0].length - 1);
            migrationPaths.add(dir);
          }
        }
      }
    }

    return Array.from(migrationPaths);
  }

  /**
   * Clean version string
   */
  private cleanVersion(version: string): string {
    return version.replace(/[\^~>=<]/g, '').trim();
  }

  /**
   * Extract version from Python requirement line
   */
  private extractPythonVersion(line: string): string | null {
    const match = line.match(/[=<>]+(.+)$/);
    return match ? match[1].trim() : null;
  }
}

export const dependencyAnalyzer = new DependencyAnalyzer();
