/**
 * Database Agent Integration Tests
 *
 * Tests the full database provisioning lifecycle including:
 * - Project analysis
 * - Provider selection
 * - Database provisioning (mocked)
 * - Application configuration
 * - Schema initialization
 * - Connection verification
 * - Rollback handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentExecutionInput } from '../../../base/base-agent';
import type {
  DatabaseCredentials,
  DatabaseRequirements,
  ProvisioningResult,
  MigrationResult,
} from '../types';

// ==========================================
// MOCK SETUP - Must be before imports
// ==========================================

// Mock the Anthropic SDK
const mockAnthropicCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mockAnthropicCreate,
    };
  },
}));

// Mock Google GenAI
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = {
      generateContent: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          files: [{ path: 'prisma/schema.prisma', content: 'model User { id Int @id }' }],
          explanation: 'Generated schema',
        }),
      }),
    };
  },
}));

// Mock the tool registry
const mockToolExecute = vi.fn();
vi.mock('../../../tools/base-tool', () => ({
  toolRegistry: {
    get: vi.fn().mockImplementation((name: string) => ({
      execute: mockToolExecute,
      getMetadata: () => ({
        name,
        description: `Mock ${name} tool`,
        parameters: [],
      }),
    })),
  },
}));

// Mock the providers module
const mockProvisionDatabase = vi.fn();
const mockDeleteDatabase = vi.fn();
const mockTestConnection = vi.fn();
const mockIsProviderAvailable = vi.fn();
const mockGetAvailableProviders = vi.fn();
const mockInitializeProvider = vi.fn();

vi.mock('../providers', () => ({
  provisionDatabase: mockProvisionDatabase,
  deleteDatabase: mockDeleteDatabase,
  testConnection: mockTestConnection,
  isProviderAvailable: mockIsProviderAvailable,
  getAvailableProviders: mockGetAvailableProviders,
  initializeProvider: mockInitializeProvider,
}));

// Mock the analyzers module
const mockAnalyzeProject = vi.fn();
const mockAnalyzeDependencies = vi.fn();

vi.mock('../analyzers', () => ({
  analyzeProject: mockAnalyzeProject,
  analyzeDependencies: mockAnalyzeDependencies,
}));

// Mock the initializers module
const mockInitializeDatabase = vi.fn();

vi.mock('../initializers', () => ({
  initializeDatabase: mockInitializeDatabase,
  type: {} as { InitializerContext: unknown },
}));

// Mock the env module
vi.mock('@/lib/env', () => ({
  env: {
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    GOOGLE_API_KEY: 'test-google-key',
    NEON_API_KEY: 'test-neon-key',
  },
}));

// Mock AI models
vi.mock('@/lib/models', () => ({
  AI_MODELS: {
    CLAUDE: 'claude-sonnet-4-5-20250929',
    FAST: 'gemini-2.0-flash',
  },
}));

// Mock retry utilities
vi.mock('@/lib/ai-retry', () => ({
  retryWithBackoff: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  RetryPresets: {
    STANDARD: {},
  },
}));

// Mock retry strategy
vi.mock('../../../retry/retry-strategy', () => ({
  retryStrategy: {
    getRetryConfig: vi.fn().mockReturnValue({
      maxIterations: 3,
      maxCostDollars: 1,
    }),
    shouldRetry: vi.fn().mockReturnValue({ shouldRetry: false, reason: 'Test' }),
  },
  RetryConfig: class {},
  RetryDecision: class {},
}));

// ==========================================
// TEST FIXTURES
// ==========================================

const createMockInput = (overrides?: Partial<AgentExecutionInput>): AgentExecutionInput => ({
  taskId: 'test-task-123',
  projectId: 'test-project-456',
  userId: 'test-user-789',
  conversationId: 'test-conv-000',
  taskDetails: {
    title: 'Setup PostgreSQL database',
    description: 'Provision a PostgreSQL database for the project',
    complexity: 'medium' as const,
    estimatedLines: 100,
    mode: 'provision',
    ...overrides?.taskDetails,
  },
  context: {
    techStack: {
      language: 'typescript',
      frontend: { framework: 'next' },
      backend: { framework: 'next' },
      database: { type: 'postgresql', name: 'neon' },
    },
    ...overrides?.context,
  },
});

const createMockCredentials = (): DatabaseCredentials => ({
  provider: 'neon',
  databaseType: 'postgresql',
  host: 'ep-test-123.us-east-2.aws.neon.tech',
  port: 5432,
  username: 'test_user',
  password: 'test_password_123',
  database: 'neuralaunch_test',
  sslMode: 'require',
  connectionString: 'postgresql://test_user:test_password_123@ep-test-123.us-east-2.aws.neon.tech:5432/neuralaunch_test?sslmode=require',
  directUrl: 'postgresql://test_user:test_password_123@ep-test-123.us-east-2.aws.neon.tech:5432/neuralaunch_test',
  additionalEnvVars: {
    NEON_PROJECT_ID: 'test-project-id',
  },
});

const createMockRequirements = (): DatabaseRequirements => ({
  preferredType: 'postgresql',
  recommendedProvider: 'neon',
  alternativeProviders: ['supabase'],
  orm: 'prisma',
  features: {
    needsRealtime: false,
    needsAuth: false,
    needsVectorSearch: false,
    needsFullTextSearch: false,
    needsCaching: false,
    needsEdgeCompatible: true,
    detectedFeatures: ['serverless'],
  },
  storage: {
    estimatedRows: 10000,
    estimatedSize: 'small',
    estimatedMonthlyCost: 0,
    tier: 'free',
  },
  confidence: 0.9,
  reasoning: ['Next.js project detected', 'Prisma schema found'],
});

const createMockProvisionResult = (success = true): ProvisioningResult => ({
  success,
  credentials: success ? createMockCredentials() : undefined,
  resourceId: success ? 'neon-project-test-123' : undefined,
  resourceUrl: success ? 'https://console.neon.tech/app/projects/test-123' : undefined,
  estimatedMonthlyCost: 0,
  provisioningTimeMs: 5000,
  warnings: [],
  error: success ? undefined : 'Provisioning failed',
});

const createMockMigrationResult = (success = true): MigrationResult => ({
  success,
  migrationsRun: success ? ['20240101000000_init'] : [],
  tablesCreated: success ? ['User', 'Project', 'Task'] : [],
  duration: 2000,
  error: success ? undefined : 'Migration failed',
});

// ==========================================
// TESTS
// ==========================================

describe('DatabaseAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        files: [{ path: 'prisma/schema.prisma', content: 'model User { id Int @id }' }],
        explanation: 'Generated schema',
      }) }],
      stop_reason: 'end_turn',
    });

    mockAnalyzeProject.mockResolvedValue(createMockRequirements());
    mockAnalyzeDependencies.mockResolvedValue({
      packageManager: 'npm',
      language: 'typescript',
      framework: 'next',
      orm: 'prisma',
      ormVersion: '5.0.0',
      hasMigrations: true,
      migrationPaths: ['prisma/migrations'],
      databaseDependencies: ['@prisma/client'],
    });

    mockIsProviderAvailable.mockReturnValue(true);
    mockGetAvailableProviders.mockReturnValue(['neon', 'supabase']);
    mockProvisionDatabase.mockResolvedValue(createMockProvisionResult());
    mockTestConnection.mockResolvedValue({ success: true });
    mockInitializeDatabase.mockResolvedValue(createMockMigrationResult());

    // Mock tool execution
    mockToolExecute.mockImplementation((params: { operation?: string; path?: string }) => {
      if (params.operation === 'read') {
        if (params.path === 'package.json') {
          return {
            success: true,
            data: { content: JSON.stringify({ name: 'test-project', dependencies: { '@prisma/client': '^5.0.0' } }) },
          };
        }
        if (params.path === '.env') {
          return {
            success: true,
            data: { content: 'EXISTING_VAR=value\n' },
          };
        }
        return { success: false, error: 'File not found' };
      }
      if (params.operation === 'write') {
        return { success: true };
      }
      if (params.operation === 'smart_load') {
        return { success: true, data: { existingFiles: {}, structure: {} } };
      }
      if (params.operation === 'scan_structure') {
        return { success: true, data: { files: ['package.json', 'prisma/schema.prisma'] } };
      }
      return { success: true };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Provision Mode', () => {
    it('should successfully provision a database with Neon provider', async () => {
      // Import after mocks are set up
      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput();
      const result = await agent.executeTask(input);

      expect(result.success).toBe(true);
      expect(result.message).toContain('provisioned successfully');
      expect(result.data?.provider).toBe('neon');
      expect(result.data?.connectionVerified).toBe(true);

      // Verify provider was initialized
      expect(mockInitializeProvider).toHaveBeenCalledWith('neon');

      // Verify database was provisioned
      expect(mockProvisionDatabase).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'neon',
          projectName: expect.any(String),
          region: expect.any(String),
        })
      );

      // Verify connection was tested
      expect(mockTestConnection).toHaveBeenCalled();
    });

    it('should fallback to available provider when preferred is unavailable', async () => {
      mockIsProviderAvailable.mockReturnValue(false);
      mockGetAvailableProviders.mockReturnValue(['supabase']);

      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput();
      const result = await agent.executeTask(input);

      expect(result.success).toBe(true);
      // Warning about fallback should be in the explanation
      expect(result.data?.explanation).toContain('supabase');
    });

    it('should fail gracefully when no providers are available', async () => {
      mockIsProviderAvailable.mockReturnValue(false);
      mockGetAvailableProviders.mockReturnValue([]);

      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput();
      const result = await agent.executeTask(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No providers available');
    });

    it('should handle provisioning failure and include rollback plan', async () => {
      mockProvisionDatabase.mockResolvedValue(createMockProvisionResult(false));

      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput();
      const result = await agent.executeTask(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Provisioning failed');
    });

    it('should use override provider when specified', async () => {
      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput({
        taskDetails: {
          title: 'Setup database',
          description: 'Setup with Supabase',
          complexity: 'medium',
          estimatedLines: 100,
          mode: 'provision',
          overrideProvider: 'supabase',
        },
      });

      await agent.executeTask(input);

      expect(mockInitializeProvider).toHaveBeenCalledWith('supabase');
    });

    it('should merge env vars with existing .env file', async () => {
      const writtenContent: string[] = [];

      mockToolExecute.mockImplementation((params: { operation?: string; path?: string; content?: string }) => {
        if (params.operation === 'read' && params.path === '.env') {
          return {
            success: true,
            data: { content: 'EXISTING_VAR=existing_value\nOTHER_VAR=other\n' },
          };
        }
        if (params.operation === 'write' && params.path === '.env') {
          writtenContent.push(params.content || '');
          return { success: true };
        }
        if (params.operation === 'read' && params.path === 'package.json') {
          return {
            success: true,
            data: { content: JSON.stringify({ name: 'test' }) },
          };
        }
        return { success: true, data: { existingFiles: {}, structure: {}, files: [] } };
      });

      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput();
      await agent.executeTask(input);

      // Check that we wrote to .env
      expect(writtenContent.length).toBeGreaterThan(0);

      // Verify existing vars are preserved and DATABASE_URL is added
      const envContent = writtenContent.find(c => c.includes('DATABASE_URL'));
      expect(envContent).toBeDefined();
      expect(envContent).toContain('EXISTING_VAR');
    });
  });

  describe('Schema Mode', () => {
    it('should generate schema without provisioning', async () => {
      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput({
        taskDetails: {
          title: 'Generate database schema',
          description: 'Create Prisma schema for users and projects',
          complexity: 'medium',
          estimatedLines: 50,
          mode: 'schema',
        },
      });

      const result = await agent.executeTask(input);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Schema generated');

      // Should NOT provision database in schema mode
      expect(mockProvisionDatabase).not.toHaveBeenCalled();
    });

    it('should respect ORM override in schema mode', async () => {
      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput({
        taskDetails: {
          title: 'Generate Drizzle schema',
          description: 'Create Drizzle schema',
          complexity: 'medium',
          estimatedLines: 50,
          mode: 'schema',
          overrideOrm: 'drizzle',
        },
      });

      const result = await agent.executeTask(input);

      expect(result.success).toBe(true);
      expect(result.message).toContain('drizzle');
    });
  });

  describe('Migrate Mode', () => {
    it('should run migrations on existing database', async () => {
      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput({
        taskDetails: {
          title: 'Run database migrations',
          description: 'Apply pending migrations',
          complexity: 'simple',
          estimatedLines: 0,
          mode: 'migrate',
        },
      });

      const result = await agent.executeTask(input);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Migrations completed');
      expect(mockInitializeDatabase).toHaveBeenCalled();

      // Should NOT provision in migrate mode
      expect(mockProvisionDatabase).not.toHaveBeenCalled();
    });

    it('should handle migration failures', async () => {
      mockInitializeDatabase.mockResolvedValue(createMockMigrationResult(false));

      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput({
        taskDetails: {
          title: 'Run migrations',
          description: 'Apply migrations',
          complexity: 'simple',
          estimatedLines: 0,
          mode: 'migrate',
        },
      });

      const result = await agent.executeTask(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Migration failed');
    });
  });

  describe('Fix Mode', () => {
    it('should fix database-related issues', async () => {
      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput({
        taskDetails: {
          title: 'Fix database connection issues',
          description: 'Fix the database connection string',
          complexity: 'simple',
          estimatedLines: 10,
          mode: 'fix',
          issuesToFix: [
            { file: 'prisma/schema.prisma', issue: 'Missing provider configuration' },
          ],
        },
      });

      const result = await agent.executeTask(input);

      expect(result.success).toBe(true);
      expect(result.message).toContain('fix');

      // Should NOT provision in fix mode
      expect(mockProvisionDatabase).not.toHaveBeenCalled();
    });

    it('should return success when no issues to fix', async () => {
      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput({
        taskDetails: {
          title: 'Fix issues',
          description: 'Fix database issues',
          complexity: 'simple',
          estimatedLines: 0,
          mode: 'fix',
          issuesToFix: [], // Empty array
        },
      });

      const result = await agent.executeTask(input);

      expect(result.success).toBe(true);
      expect(result.message).toContain('No issues to fix');
    });
  });

  describe('Rollback Handling', () => {
    it('should execute rollback on provision failure after database created', async () => {
      // First provision succeeds, but then something fails
      mockProvisionDatabase.mockResolvedValueOnce(createMockProvisionResult(true));
      mockTestConnection.mockRejectedValueOnce(new Error('Connection test failed'));

      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput();
      const result = await agent.executeTask(input);

      expect(result.success).toBe(false);

      // Rollback should have been attempted
      expect(mockDeleteDatabase).toHaveBeenCalled();
    });
  });

  describe('Provider-Specific Regions', () => {
    it('should use correct default region for Neon', async () => {
      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput({
        context: {
          techStack: {
            language: 'typescript',
            frontend: { framework: 'next' },
            database: { type: 'postgresql' },
            // No deployment region specified
          },
        },
      });

      await agent.executeTask(input);

      expect(mockProvisionDatabase).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'aws-us-east-2', // Neon's default region
        })
      );
    });
  });

  describe('Credentials Handling', () => {
    it('should redact sensitive credentials in output', async () => {
      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput();
      const result = await agent.executeTask(input);

      expect(result.success).toBe(true);

      // Cast credentials to the expected type for testing
      const credentials = result.data?.credentials as Partial<DatabaseCredentials> | undefined;

      // Password should be redacted
      expect(credentials?.password).toBe('***REDACTED***');

      // Connection string password should be redacted
      expect(credentials?.connectionString).toContain('***');
      expect(credentials?.connectionString).not.toContain('test_password_123');
    });
  });

  describe('Validation', () => {
    it('should validate provider override', async () => {
      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput({
        taskDetails: {
          title: 'Setup database',
          description: 'Setup database',
          complexity: 'medium',
          estimatedLines: 100,
          mode: 'provision',
          overrideProvider: 'invalid_provider', // Invalid provider
        },
      });

      await agent.executeTask(input);

      // Should fall back to recommended provider, not use invalid one
      expect(mockInitializeProvider).toHaveBeenCalledWith('neon');
    });

    it('should validate ORM override', async () => {
      const { DatabaseAgent } = await import('../index');
      const agent = new DatabaseAgent();

      const input = createMockInput({
        taskDetails: {
          title: 'Generate schema',
          description: 'Generate schema',
          complexity: 'medium',
          estimatedLines: 50,
          mode: 'schema',
          overrideOrm: 'invalid_orm', // Invalid ORM
        },
      });

      const result = await agent.executeTask(input);

      // Should fall back to detected ORM (prisma)
      expect(result.success).toBe(true);
    });
  });
});

describe('DatabaseAgent - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        files: [],
        explanation: 'No changes needed',
      }) }],
      stop_reason: 'end_turn',
    });

    mockAnalyzeProject.mockResolvedValue(createMockRequirements());
    mockAnalyzeDependencies.mockResolvedValue({
      packageManager: 'npm',
      language: 'typescript',
      framework: null,
      orm: null,
      ormVersion: null,
      hasMigrations: false,
      migrationPaths: [],
      databaseDependencies: [],
    });

    mockIsProviderAvailable.mockReturnValue(true);
    mockGetAvailableProviders.mockReturnValue(['neon']);
    mockProvisionDatabase.mockResolvedValue(createMockProvisionResult());
    mockTestConnection.mockResolvedValue({ success: true });
    mockInitializeDatabase.mockResolvedValue(createMockMigrationResult());

    mockToolExecute.mockResolvedValue({ success: true, data: {} });
  });

  it('should handle missing package.json gracefully', async () => {
    mockToolExecute.mockImplementation((params: { operation?: string; path?: string }) => {
      if (params.operation === 'read' && params.path === 'package.json') {
        return { success: false, error: 'File not found' };
      }
      return { success: true, data: {} };
    });

    const { DatabaseAgent } = await import('../index');
    const agent = new DatabaseAgent();

    const input = createMockInput();
    const result = await agent.executeTask(input);

    // Should still succeed - uses fallback project name
    expect(result.success).toBe(true);
  });

  it('should handle empty project files', async () => {
    mockToolExecute.mockResolvedValue({
      success: true,
      data: { existingFiles: {}, structure: { files: [] } },
    });

    const { DatabaseAgent } = await import('../index');
    const agent = new DatabaseAgent();

    const input = createMockInput();
    const result = await agent.executeTask(input);

    expect(result.success).toBe(true);
  });

  it('should handle connection test failure without crashing', async () => {
    mockTestConnection.mockResolvedValue({
      success: false,
      error: 'Connection refused',
    });

    const { DatabaseAgent } = await import('../index');
    const agent = new DatabaseAgent();

    const input = createMockInput();
    const result = await agent.executeTask(input);

    // Should still succeed but with warning
    expect(result.success).toBe(true);
    expect(result.data?.connectionVerified).toBe(false);
    expect(result.data?.explanation).toContain('Connection');
  });

  it('should handle schema initialization failure gracefully', async () => {
    mockInitializeDatabase.mockResolvedValue({
      success: false,
      migrationsRun: [],
      tablesCreated: [],
      duration: 0,
      error: 'Schema initialization failed',
    });

    const { DatabaseAgent } = await import('../index');
    const agent = new DatabaseAgent();

    const input = createMockInput();
    const result = await agent.executeTask(input);

    // Should still succeed (schema init failure is a warning, not fatal)
    expect(result.success).toBe(true);
    expect(result.data?.explanation).toContain('Schema initialization');
  });
});
