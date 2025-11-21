# Database Agent

Production-ready database provisioning agent for NeuraLaunch. Automatically detects database requirements, provisions databases via provider APIs, configures applications, and initializes schemas.

## Features

- **Multi-Provider Support**: Neon, Supabase, MongoDB Atlas, PlanetScale, Upstash Redis
- **Automatic Detection**: Scans project files to determine database requirements
- **ORM Support**: Prisma, Drizzle, TypeORM, Mongoose, Sequelize, Knex
- **Full Lifecycle**: Provision → Configure → Initialize → Verify
- **Rollback**: Automatic rollback on failure
- **Zero Configuration**: Works out of the box with sensible defaults

## Architecture

```
database/
├── index.ts                    # Main DatabaseAgent class
├── types.ts                    # Type definitions
├── analyzers/                  # Requirement detection
│   ├── dependency-analyzer.ts  # package.json, requirements.txt, etc.
│   ├── feature-analyzer.ts     # Realtime, auth, vector search detection
│   └── index.ts                # Unified analysis + provider selection
├── providers/                  # Database providers
│   ├── base-provider.ts        # Abstract base class
│   ├── neon-provider.ts        # Neon PostgreSQL
│   ├── supabase-provider.ts    # Supabase PostgreSQL + features
│   └── index.ts                # Provider registry
├── initializers/               # Schema initialization
│   └── index.ts                # Prisma, Drizzle, TypeORM, etc.
└── __tests__/                  # Test suite
    └── analyzers.test.ts
```

## Usage

### Basic Provisioning

The Database Agent automatically provisions a database when triggered:

```typescript
import { databaseAgent } from "@/lib/agents/execution/database";

const result = await databaseAgent.execute({
  taskId: "task-123",
  projectId: "project-456",
  userId: "user-789",
  conversationId: "conv-000",
  taskDetails: {
    title: "Setup database",
    description: "Provision database for the project",
    complexity: "medium",
    estimatedLines: 100,
  },
  context: {
    techStack: {
      frontend: { framework: "Next.js" },
      backend: { framework: "Next.js API Routes" },
      database: { type: "postgresql" },
    },
  },
});

if (result.success) {
  console.log("Database provisioned:", result.data?.resourceUrl);
  console.log("Tables created:", result.data?.tablesCreated);
}
```

### Override Provider/ORM

```typescript
const result = await databaseAgent.execute({
  // ... other params
  taskDetails: {
    title: "Setup Supabase",
    description: "Use Supabase for auth and realtime",
    complexity: "medium",
    estimatedLines: 100,
    overrideProvider: "supabase", // Force Supabase
    overrideOrm: "prisma",        // Force Prisma
  },
});
```

### Schema-Only Mode (No Provisioning)

```typescript
const result = await databaseAgent.execute({
  // ... other params
  taskDetails: {
    title: "Design user schema",
    description: "Create User, Post, and Comment models",
    complexity: "simple",
    estimatedLines: 50,
    mode: "schema", // Only generate schema, don't provision
  },
});
```

### Migration Mode

```typescript
const result = await databaseAgent.execute({
  // ... other params
  taskDetails: {
    title: "Run migrations",
    description: "Apply pending migrations",
    complexity: "simple",
    estimatedLines: 0,
    mode: "migrate",
  },
});
```

## Provider Selection Logic

The agent automatically selects the best provider based on detected requirements:

| Requirement | Provider | Reasoning |
|-------------|----------|-----------|
| MongoDB dependencies | MongoDB Atlas | Native MongoDB support |
| MySQL dependencies | PlanetScale | Serverless MySQL |
| Realtime or Auth | Supabase | Built-in realtime & auth |
| Caching layer | Upstash Redis | Serverless Redis |
| Default (PostgreSQL) | Neon | Serverless, generous free tier |

## Environment Variables

Add these to your `.env`:

```bash
# Required: At least one provider API key
NEON_API_KEY=your-neon-api-key           # Get from console.neon.tech
SUPABASE_API_KEY=your-supabase-key       # Management API key
SUPABASE_ORG_ID=your-org-id              # For project creation

# Optional: Additional providers
MONGODB_ATLAS_PUBLIC_KEY=your-public-key
MONGODB_ATLAS_PRIVATE_KEY=your-private-key
MONGODB_ATLAS_PROJECT_ID=your-project-id
PLANETSCALE_API_KEY=your-api-key
PLANETSCALE_ORG_ID=your-org-id
```

## Output Structure

```typescript
interface DatabaseAgentOutput {
  success: boolean;
  message: string;
  iterations: number;
  durationMs: number;
  data?: {
    // Analysis
    requirements?: DatabaseRequirements;

    // Provisioning
    credentials?: Partial<DatabaseCredentials>; // Redacted
    resourceId?: string;
    resourceUrl?: string;

    // Configuration
    envVarsInjected?: string[];
    filesCreated?: Array<{ path: string; linesOfCode: number }>;
    filesModified?: string[];

    // Schema
    migrationsRun?: string[];
    tablesCreated?: string[];

    // Metadata
    provider?: DatabaseProvider;
    estimatedMonthlyCost?: number;
    connectionVerified?: boolean;
    explanation?: string;
  };
  error?: string;
  warnings?: string[];
}
```

## Supported ORMs

### Prisma
- Detects `prisma/schema.prisma`
- Runs `prisma generate` and `prisma migrate deploy` or `db push`
- Sets `DATABASE_URL` and `DIRECT_URL`

### Drizzle
- Detects `drizzle.config.ts` or `drizzle/schema.ts`
- Runs `drizzle-kit migrate` or `drizzle-kit push`
- Sets `DATABASE_URL`

### TypeORM
- Detects `ormconfig.json` or `src/data-source.ts`
- Runs `typeorm migration:run`
- Sets `DATABASE_URL`

### Mongoose
- Detects `mongoose` in dependencies
- Sets `MONGODB_URI` and `DATABASE_URL`
- No migrations needed (schema defined in code)

### Raw SQL
- Detects `.sql` files in `db/`, `sql/`, or `migrations/`
- Executes SQL files directly
- Sets `DATABASE_URL`

## Error Handling & Rollback

The agent implements automatic rollback on failure:

1. **Provisioning fails**: No cleanup needed
2. **Configuration fails**: Delete provisioned database
3. **Schema init fails**: Delete database, remove env vars
4. **Verification fails**: Warning only (database may still work)

Rollback steps are logged for debugging.

## Cost Optimization

The agent automatically:
- Uses free tiers when available (Neon, Supabase, MongoDB Atlas)
- Estimates monthly costs based on schema complexity
- Warns before provisioning paid resources

## Integration with Orchestrator

The Database Agent is triggered via Inngest:

```typescript
// Event: agent/execution.database
{
  taskId: string;
  projectId: string;
  userId: string;
  conversationId: string;
  waveNumber?: number;
}
```

Results are stored in `AgentTask` and `AgentExecution` tables.

## Testing

```bash
# Run unit tests
npm test -- --grep "Database"

# Run specific test file
npm test -- src/lib/agents/execution/database/__tests__/analyzers.test.ts
```

## Troubleshooting

### "No providers available"
Set at least one provider API key in your environment variables.

### "Provisioning timeout"
Database creation can take up to 5 minutes. Check provider dashboard for status.

### "Migration failed"
- Ensure schema file exists
- Check DATABASE_URL is correctly set
- Verify database is accessible

### "Connection test failed"
- Check network connectivity
- Verify credentials
- Ensure SSL mode is correct

## Future Improvements

- [ ] Add MongoDB Atlas provider implementation
- [ ] Add PlanetScale provider implementation
- [ ] Add Upstash Redis provider implementation
- [ ] Support database branching (Neon, PlanetScale)
- [ ] Add connection pooling configuration
- [ ] Support multi-region deployment
- [ ] Add backup/restore capabilities
