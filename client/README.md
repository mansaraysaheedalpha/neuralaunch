This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## AI Orchestration

This application uses a centralized AI orchestration service (`src/lib/ai-orchestrator.ts`) that intelligently routes AI tasks to the best model for the job:

### Supported Models
- **Google Gemini 2.5 Pro** - Complex generation (blueprints, primary tasks)
- **Google Gemini Flash** - Fast tasks (titles, landing page copy, surveys, pricing)
- **OpenAI GPT-4o** - Code generation and reasoning (MVP blueprints, coding tasks)
- **Anthropic Claude Sonnet 4.5** - Nuanced chat, safety, creative tasks (Cofounder)

### Task Routing Strategy
- `BLUEPRINT_GENERATION` → Gemini 2.5 Pro
- `TITLE_GENERATION` → Gemini Flash
- `LANDING_PAGE_COPY`, `SURVEY_QUESTION_GENERATION`, `PRICING_TIER_GENERATION` → Gemini Flash
- `COFOUNDER_CHAT_RESPONSE` → Claude Sonnet
- `BLUEPRINT_PARSING` → GPT-4o
- `SPRINT_TASK_ASSISTANCE` → Adaptive (Claude for general, GPT-4o for code)
- `CODE_GENERATION_MVP` → GPT-4o

### Usage Example
```typescript
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";

const response = await executeAITaskSimple(AITaskType.TITLE_GENERATION, {
  prompt: "Generate a title for my startup idea",
});
```

### Environment Variables Required
```bash
GOOGLE_API_KEY="your-gemini-key"
OPENAI_API_KEY="your-openai-key"
ANTHROPIC_API_KEY="your-anthropic-key"
```

## Extended Thinking Integration

NeuraLaunch now supports Claude's Extended Thinking feature for enhanced transparency in AI reasoning. This allows you to see the actual internal reasoning process of the AI as it makes decisions.

### Features
- **Deep Dive Mode**: Toggle to view raw AI reasoning alongside curated thoughts
- **Extended Thinking**: Leverages Claude's native extended thinking capability to expose internal reasoning
- **Chain-of-Thought**: Alternative mode that forces step-by-step reasoning output
- **Thought Streaming**: Real-time display of AI thoughts during execution

### Usage in Planning Agent

```typescript
import { planningAgent } from "@/lib/agents/planning/planning-agent";

// Execute with extended thinking enabled
const result = await planningAgent.execute(
  {
    projectId: "project-123",
    userId: "user-456",
    conversationId: "conv-789",
    sourceType: "blueprint",
    blueprint: "...",
  },
  {
    enableDeepDive: true,        // Enable raw reasoning display
    useExtendedThinking: true,   // Use Claude's extended thinking
    useChainOfThought: false,    // Alternative: step-by-step prompting
  }
);
```

### Options

- **`enableDeepDive`**: When `true`, stores and displays raw AI reasoning alongside curated thoughts
- **`useExtendedThinking`**: When `true`, uses Claude's native extended thinking feature (recommended for important decisions)
- **`useChainOfThought`**: When `true`, uses structured prompting to force step-by-step reasoning (alternative to extended thinking)

### Thought Types

The system now supports an additional thought type:
- `deep_reasoning`: Raw AI internal reasoning from extended thinking

### API Integration

The planning options can be passed through API routes:

```typescript
// POST /api/projects/[projectId]/agent/plan
{
  "projectId": "project-123",
  "options": {
    "enableDeepDive": true,
    "useExtendedThinking": true
  }
}
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
