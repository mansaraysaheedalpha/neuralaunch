// src/lib/agents/execution/database/providers/base-provider.ts
/**
 * Base Database Provider
 * Abstract class for all database provider implementations
 */

import { logger } from "@/lib/logger";
import { retryWithBackoff, RetryPresets } from "@/lib/ai-retry";
import type {
  DatabaseProvider,
  DatabaseType,
  DatabaseCredentials,
  ProvisioningOptions,
  ProvisioningResult,
  ProviderConfig,
} from "../types";

export abstract class BaseDatabaseProvider {
  protected abstract readonly providerName: DatabaseProvider;
  protected abstract readonly databaseType: DatabaseType;
  protected config: ProviderConfig | null = null;

  /**
   * Initialize the provider with API credentials
   */
  abstract initialize(config: ProviderConfig): void;

  /**
   * Check if provider is properly configured
   */
  abstract isConfigured(): boolean;

  /**
   * Provision a new database instance
   */
  abstract provision(options: ProvisioningOptions): Promise<ProvisioningResult>;

  /**
   * Delete a provisioned database
   */
  abstract delete(resourceId: string): Promise<{ success: boolean; error?: string }>;

  /**
   * Test connection to the database
   */
  abstract testConnection(credentials: DatabaseCredentials): Promise<{ success: boolean; latencyMs?: number; error?: string }>;

  /**
   * Get connection status of a database
   */
  abstract getStatus(resourceId: string): Promise<{ ready: boolean; status: string; error?: string }>;

  /**
   * Build connection string from credentials
   */
  abstract buildConnectionString(credentials: Partial<DatabaseCredentials>): string;

  /**
   * Get provider name
   */
  getName(): DatabaseProvider {
    return this.providerName;
  }

  /**
   * Get database type
   */
  getDatabaseType(): DatabaseType {
    return this.databaseType;
  }

  /**
   * Wait for database to be ready
   */
  async waitForReady(
    resourceId: string,
    timeoutMs: number = 300000, // 5 minutes default
    pollIntervalMs: number = 5000
  ): Promise<{ ready: boolean; error?: string }> {
    const startTime = Date.now();

    logger.info(`[${this.providerName}] Waiting for database to be ready`, {
      resourceId,
      timeoutMs,
    });

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getStatus(resourceId);

        if (status.ready) {
          logger.info(`[${this.providerName}] Database is ready`, {
            resourceId,
            waitTimeMs: Date.now() - startTime,
          });
          return { ready: true };
        }

        if (status.error && !this.isTransientError(status.error)) {
          logger.error(`[${this.providerName}] Database provisioning failed`, undefined, {
            resourceId,
            error: status.error,
          });
          return { ready: false, error: status.error };
        }

        logger.debug(`[${this.providerName}] Database not ready yet`, {
          resourceId,
          status: status.status,
        });
      } catch (error) {
        logger.warn(`[${this.providerName}] Error checking status`, {
          resourceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await this.sleep(pollIntervalMs);
    }

    return {
      ready: false,
      error: `Timeout: Database not ready after ${timeoutMs / 1000}s`,
    };
  }

  /**
   * Make HTTP request with retry logic
   */
  protected async fetchWithRetry<T>(
    url: string,
    options: RequestInit,
    operationName: string
  ): Promise<T> {
    return retryWithBackoff(
      async () => {
        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(30000), // 30s timeout per request
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => 'No body');
          throw new Error(
            `HTTP ${response.status}: ${response.statusText}. Body: ${errorBody.substring(0, 200)}`
          );
        }

        return response.json() as Promise<T>;
      },
      {
        ...RetryPresets.STANDARD,
        operationName: `${this.providerName}:${operationName}`,
        isRetryable: (error) => {
          const message = error.message.toLowerCase();
          // Retry on network errors and 5xx
          return (
            message.includes('timeout') ||
            message.includes('econnrefused') ||
            message.includes('econnreset') ||
            message.includes('http 500') ||
            message.includes('http 502') ||
            message.includes('http 503') ||
            message.includes('http 504') ||
            message.includes('http 429') // Rate limit
          );
        },
      }
    );
  }

  /**
   * Check if error is transient (can be retried)
   */
  protected isTransientError(error: string): boolean {
    const transientPatterns = [
      /provisioning/i,
      /pending/i,
      /starting/i,
      /initializing/i,
      /creating/i,
    ];
    return transientPatterns.some(p => p.test(error));
  }

  /**
   * Sleep helper
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate a secure random password
   */
  protected generatePassword(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => chars[byte % chars.length]).join('');
  }

  /**
   * Sanitize project name for use in database/resource names
   */
  protected sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  /**
   * Redact sensitive information from credentials for logging
   */
  protected redactCredentials(credentials: DatabaseCredentials): Partial<DatabaseCredentials> {
    return {
      ...credentials,
      password: '***REDACTED***',
      connectionString: credentials.connectionString.replace(/:([^@]+)@/, ':***@'),
      directUrl: credentials.directUrl?.replace(/:([^@]+)@/, ':***@'),
      additionalEnvVars: Object.fromEntries(
        Object.entries(credentials.additionalEnvVars).map(([key, value]) => [
          key,
          key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')
            ? '***REDACTED***'
            : value,
        ])
      ),
    };
  }
}
