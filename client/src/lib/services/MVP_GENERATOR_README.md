# MVP Generator - Technical Documentation

## Overview

The MVP Generator is a core feature of NeuraLaunch that transforms a validated startup idea into a complete, production-ready codebase. It leverages AI (specifically GPT-4o) to intelligently parse business requirements and generate type-safe, modern web applications.

## Architecture

### Flow Diagram

```
User Blueprint → AI Parsing → Code Generation → ZIP Download
     ↓              ↓              ↓               ↓
Landing Page   GPT-4o API    Template Engine   User's Machine
```

### Components

#### 1. Frontend Layer
- **MvpGenerationModal.tsx**: Interactive 3-step wizard for collecting user preferences
- **SprintDashboard.tsx**: Integration point with "Build & Download MVP" button

#### 2. API Layer
- **`/api/scaffold/mvp/route.ts`**: RESTful endpoint that orchestrates the generation
  - Validates user authentication
  - Fetches blueprint and pricing data
  - Invokes the generator
  - Returns ZIP file

#### 3. Generator Layer
- **`mvp-generator.ts`**: Core generation logic with multiple specialized functions

## Type Definitions

```typescript
interface MvpGenerationOptions {
  primaryModel?: string;              // e.g., "Project", "User", "Task"
  includeAuth?: boolean;              // Default: true
  includePayments?: boolean;          // Default: true
  databaseProvider?: "postgresql" | "mysql" | "sqlite";  // Default: "postgresql"
  additionalFeatures?: string[];      // Optional enhancements
}

interface ParsedBlueprint {
  pitch: string;                      // Startup name
  solution: {
    features: Array<{
      name: string;
      description: string;
    }>;
  };
  databaseModels: DatabaseModel[];    // AI-inferred database schema
}
```

## AI-Powered Blueprint Parsing

### How It Works

1. **Input**: Raw markdown blueprint from the user's ideation session
2. **Processing**: GPT-4o analyzes the blueprint with structured prompts
3. **Output**: JSON object with extracted models, features, and metadata

### Example Prompt Strategy

```typescript
const prompt = `
You are an expert system that parses startup blueprints.

TASK: Extract database models from this blueprint.

RULES:
- Include standard fields: id, createdAt, updatedAt
- Link models to User with userId field
- Be minimalist - only essential models
- Return valid JSON only

${blueprintString}
`;
```

### Intelligence Features

- **Context-Aware**: Understands that "Cash Runway" implies financial models
- **Relationship Inference**: Automatically creates proper Prisma relations
- **Type Safety**: Ensures all generated code is TypeScript-compliant

## Generated File Structure

```
mvp-codebase/
├── app/
│   ├── api/
│   │   └── auth/[...nextauth]/route.ts    # NextAuth configuration
│   ├── dashboard/page.tsx                 # Main dashboard
│   ├── pricing/page.tsx                   # Stripe pricing page
│   ├── layout.tsx                         # Root layout
│   └── globals.css                        # Tailwind styles
├── components/
│   └── SubscribeButton.tsx                # Stripe checkout button
├── lib/
│   └── stripe.ts                          # Stripe server actions
├── prisma/
│   └── schema.prisma                      # Database schema
├── package.json                           # Dependencies
├── tsconfig.json                          # TypeScript config
├── tailwind.config.ts                     # Tailwind config
├── postcss.config.js                      # PostCSS config
├── .env.example                           # Environment variables
└── README.md                              # Setup instructions
```

## Code Generation Functions

### 1. `generatePrismaSchema(blueprint, options)`

Generates a complete Prisma schema including:
- NextAuth.js models (User, Account, Session, VerificationToken)
- User-specified primary models
- Proper relations and cascade deletes
- Database-specific configurations

**Key Features**:
- Supports multiple database providers
- Automatic index creation
- Type-safe field definitions

### 2. `generateNextAuthRoute()`

Creates a fully configured NextAuth.js setup with:
- Google OAuth provider
- Prisma adapter
- Session callbacks
- Type-safe configuration

### 3. `generateDashboardPage(blueprint)`

Generates a custom dashboard based on blueprint features:
- Feature cards for each validated feature
- Responsive grid layout
- Next steps section
- Dark mode support

### 4. `generatePricingPage(tiers)`

Creates a Stripe-integrated pricing page:
- Dynamic tier rendering
- Stripe checkout integration
- Responsive pricing cards
- CTA optimization

### 5. `generateStripeLib()`

Server-side Stripe integration:
- Customer creation
- Subscription management
- Error handling
- Type-safe API calls

## Configuration Options

### Database Providers

| Provider   | Use Case                          | Generated Config                    |
|-----------|-----------------------------------|-------------------------------------|
| PostgreSQL| Production apps, complex queries  | `provider = "postgresql"`          |
| MySQL     | Compatibility, shared hosting     | `provider = "mysql"`               |
| SQLite    | Development, prototyping          | `provider = "sqlite"`              |

### Optional Features

| Feature              | Impact                                    |
|---------------------|-------------------------------------------|
| Authentication      | Adds NextAuth.js + Google OAuth           |
| Payments            | Adds Stripe integration + pricing page    |
| Email Notifications | Adds Resend setup + email templates       |
| File Upload         | Adds upload utilities + storage config    |
| Real-time Updates   | Adds WebSocket setup + Pusher config      |
| Full-text Search    | Adds search utilities + database indexes  |
| Analytics           | Adds analytics dashboard + tracking       |

## Error Handling

### User-Facing Errors

```typescript
// API validates all inputs
if (!session?.user?.id) {
  return NextResponse.json(
    { error: "Authentication required" },
    { status: 401 }
  );
}

if (!landingPage) {
  return NextResponse.json(
    { error: "Landing page not found" },
    { status: 404 }
  );
}
```

### AI Parsing Fallback

```typescript
try {
  const blueprint = await parseBlueprint(blueprintString, options);
} catch (error) {
  console.error("Blueprint parsing failed:", error);
  // Fallback to sensible defaults
  return {
    pitch: "My MVP App",
    solution: { features: [] },
    databaseModels: []
  };
}
```

## Performance Considerations

### Optimization Strategies

1. **Streaming Response**: Consider implementing streaming for large codebases
2. **Caching**: Cache AI parsing results for identical blueprints
3. **Parallel Generation**: Files are independent and could be generated in parallel
4. **Lazy Loading**: Generate only selected features to reduce bundle size

### Current Metrics

- Average generation time: ~10-15 seconds
- Typical ZIP size: ~50-100KB
- Files generated: 10-15 files (depending on options)
- AI API calls: 1 (blueprint parsing)

## Security Considerations

### Authentication & Authorization

- All API endpoints require valid session
- Landing page ownership verified
- No sensitive data in generated code
- Environment variables properly templated

### Input Validation

```typescript
const scaffoldRequestSchema = z.object({
  projectId: z.string().cuid(),
  options: z.object({
    primaryModel: z.string().optional(),
    includeAuth: z.boolean().optional(),
    includePayments: z.boolean().optional(),
    databaseProvider: z.enum(["postgresql", "mysql", "sqlite"]).optional(),
    additionalFeatures: z.array(z.string()).optional(),
  }).optional(),
});
```

### Code Injection Prevention

- All user inputs are sanitized
- Template strings use safe interpolation
- No `eval()` or dynamic code execution
- TypeScript ensures type safety

## Testing Strategy

### Unit Tests (TODO)

```typescript
describe("MVP Generator", () => {
  it("should parse blueprint correctly", async () => {
    const blueprint = await parseBlueprint(mockBlueprintString);
    expect(blueprint.pitch).toBeDefined();
    expect(blueprint.databaseModels.length).toBeGreaterThan(0);
  });

  it("should generate valid Prisma schema", () => {
    const schema = generatePrismaSchema(mockBlueprint);
    expect(schema).toContain("model User");
    expect(schema).toContain("datasource db");
  });

  it("should conditionally include features", async () => {
    const files = await generateMvpCodebase(
      mockBlueprint,
      [],
      { includeAuth: false, includePayments: false }
    );
    expect(files["app/api/auth/[...nextauth]/route.ts"]).toBeUndefined();
    expect(files["lib/stripe.ts"]).toBeUndefined();
  });
});
```

### Integration Tests (TODO)

- End-to-end generation flow
- ZIP file integrity validation
- Generated code compilation verification
- Database schema migration testing

## Future Enhancements

### Short-term (Next Sprint)

- [ ] Add real-time progress indicator
- [ ] Preview generated structure before download
- [ ] Custom template selection
- [ ] Additional database providers (MongoDB, Supabase)

### Long-term (Roadmap)

- [ ] GitHub repository creation + push
- [ ] Automated deployment to Vercel
- [ ] CI/CD pipeline generation
- [ ] Test file generation
- [ ] API documentation generation
- [ ] Docker configuration
- [ ] Kubernetes manifests

## API Reference

### POST `/api/scaffold/mvp`

**Request Body**:
```typescript
{
  projectId: string;           // Landing page ID
  options?: {
    primaryModel?: string;
    includeAuth?: boolean;
    includePayments?: boolean;
    databaseProvider?: "postgresql" | "mysql" | "sqlite";
    additionalFeatures?: string[];
  }
}
```

**Response**:
- Success (200): `application/zip` - The generated codebase
- Error (400): `{ error: string, issues?: object }` - Validation errors
- Error (401): `{ error: "Unauthorized" }` - Not authenticated
- Error (404): `{ error: string }` - Landing page not found
- Error (500): `{ error: string, message: string }` - Generation failed

**Headers**:
```
Content-Type: application/zip
Content-Disposition: attachment; filename="mvp-codebase.zip"
```

## Debugging

### Common Issues

1. **AI Parsing Fails**
   - Check OpenAI API key
   - Verify blueprint format
   - Check token limits

2. **Generated Code Won't Compile**
   - Verify TypeScript version
   - Check dependency versions
   - Review generated Prisma schema

3. **ZIP Download Fails**
   - Check browser download settings
   - Verify file size limits
   - Check network connectivity

### Logging

Enable detailed logging by checking console output:

```typescript
[SCAFFOLD_MVP] Starting MVP generation
[MVP_GENERATOR] Starting code generation with options
[MVP_GENERATOR] Blueprint parsed: AppName, 3 models
[MVP_GENERATOR] Generated 12 files
[SCAFFOLD_MVP] Returning ZIP file to client
```

## Contributing

When modifying the MVP generator:

1. Maintain type safety throughout
2. Add comprehensive error handling
3. Update this documentation
4. Add tests for new features
5. Follow existing code patterns
6. Consider backward compatibility

## License

Proprietary - Part of NeuraLaunch platform

---

**Last Updated**: 2025-10-26  
**Maintained By**: NeuraLaunch Engineering Team  
**Version**: 2.0.0
