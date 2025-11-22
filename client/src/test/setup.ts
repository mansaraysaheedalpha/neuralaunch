/**
 * Vitest Setup File
 *
 * This file runs before all tests and sets up the test environment.
 */

import { vi } from 'vitest';

// Mock environment variables for tests
// Note: NODE_ENV is read-only in some TypeScript configs, so we skip it
// process.env.NODE_ENV is already set by vitest to 'test'
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.GOOGLE_API_KEY = 'test-google-key';
process.env.NEON_API_KEY = 'test-neon-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Mock Prisma client globally
vi.mock('@/lib/prisma', () => ({
  default: {
    agentTask: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    agentExecution: {
      create: vi.fn(),
    },
    projectContext: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock logger to prevent console spam during tests
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createApiLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock the vector memory to avoid external calls
vi.mock('@/lib/agents/memory/vector-memory', () => ({
  vectorMemory: {
    getRelevantContext: vi.fn().mockResolvedValue('No similar past tasks found.'),
    store: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock the error recovery system
vi.mock('@/lib/agents/error-recovery/error-recovery-system', () => ({
  errorRecoverySystem: {
    recover: vi.fn().mockResolvedValue({
      analysis: { rootCause: 'Test error' },
      nextAction: 'Retry',
    }),
  },
  FailureAttempt: class {},
}));

// Mock the tool registry initialization
vi.mock('@/lib/agents/tools/index', () => ({
  initializeTools: vi.fn(),
}));
