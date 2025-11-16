// src/lib/agents/tools/claude-skills-tool.ts
/**
 * Claude Skills Tool
 * Leverages Claude's advanced capabilities for complex reasoning, code generation, and problem solving
 * Provides access to Extended Thinking, Chain of Thought, and specialized Claude skills
 */

import { BaseTool, ToolParameter, ToolResult, ToolContext } from "./base-tool";
import { logger } from "@/lib/logger";
import Anthropic from "@anthropic-ai/sdk";
import { toError } from "@/lib/error-utils";
import { env } from "@/lib/env";

export interface ClaudeSkillsParams {
  skill:
    | "extended_thinking"
    | "code_generation"
    | "code_review"
    | "architecture_design"
    | "problem_solving"
    | "refactoring"
    | "test_generation"
    | "documentation"
    | "debugging"
    | "security_review";
  prompt: string;
  thinkingBudget?: number;
  includeReasoning?: boolean; // Return both reasoning and answer
  context?: Record<string, unknown>; // Additional context for the skill
}

interface ClaudeSkillResult {
  answer: string;
  skill: ClaudeSkillsParams["skill"];
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  reasoning?: string;
  reasoningSteps?: string[];
}

export class ClaudeSkillsTool extends BaseTool {
  name = "claude_skills";
  description =
    "Access Claude's advanced AI capabilities: extended thinking, code generation, architecture design, problem solving, and more";

  parameters: ToolParameter[] = [
    {
      name: "skill",
      type: "string",
      description:
        'Claude skill to use: "extended_thinking", "code_generation", "code_review", "architecture_design", "problem_solving", "refactoring", "test_generation", "documentation", "debugging", "security_review"',
      required: true,
    },
    {
      name: "prompt",
      type: "string",
      description: "The prompt/question for Claude to process",
      required: true,
    },
    {
      name: "thinkingBudget",
      type: "number",
      description:
        "Token budget for thinking (default: 8000, max: 16000 for complex tasks)",
      required: false,
      default: 8000,
    },
    {
      name: "includeReasoning",
      type: "boolean",
      description: "Include Claude's reasoning process in the response",
      required: false,
      default: false,
    },
    {
      name: "context",
      type: "object",
      description:
        "Additional context (techStack, architecture, codebase, etc.)",
      required: false,
    },
  ];

  private anthropic: Anthropic;

  constructor() {
    super();
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.warn("[ClaudeSkills] ANTHROPIC_API_KEY not set - tool disabled");
    }
    this.anthropic = new Anthropic({
      apiKey,
      timeout: 120 * 1000, // 2 minutes
      maxRetries: 2,
    });
  }

  async execute(
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const claudeParams = params as unknown as ClaudeSkillsParams;

    try {
      if (!env.ANTHROPIC_API_KEY) {
        return {
          success: false,
          error: "ANTHROPIC_API_KEY not configured",
        };
      }

      logger.info(`[ClaudeSkills] Executing skill: ${claudeParams.skill}`, {
        promptLength: claudeParams.prompt.length,
        thinkingBudget: claudeParams.thinkingBudget || 8000,
      });

      // Build skill-specific prompt
      const enhancedPrompt = this.buildSkillPrompt(claudeParams);

      // Call Claude with extended thinking
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 16000,
        thinking: {
          type: "enabled",
          budget_tokens: claudeParams.thinkingBudget || 8000,
        },
        messages: [
          {
            role: "user",
            content: enhancedPrompt,
          },
        ],
      });

      // Extract thinking and answer
      let thinkingContent = "";
      let answerContent = "";

      for (const block of response.content) {
        if (block.type === "thinking") {
          thinkingContent = block.thinking;
        } else if (block.type === "text") {
          answerContent = block.text;
        }
      }
      const duration = Date.now() - startTime;

      logger.info(`[ClaudeSkills] Skill execution complete`, {
        skill: claudeParams.skill,
        thinkingLength: thinkingContent.length,
        answerLength: answerContent.length,
        duration,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      });
      const result: ClaudeSkillResult = {
        answer: answerContent,
        skill: claudeParams.skill,
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          total: response.usage.input_tokens + response.usage.output_tokens,
        },
      };

      // Include reasoning if requested
      if (claudeParams.includeReasoning) {
        result.reasoningSteps = this.parseReasoningSteps(thinkingContent);
      }

      return {
        success: true,
        data: result,
        duration,
        metadata: {
          skill: claudeParams.skill,
          model: "claude-sonnet-4-5",
          thinkingTokens: response.usage.input_tokens,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(`[ClaudeSkills] Execution failed`, toError(error));

      return {
        success: false,
        error: toError(error).message,
        duration,
      };
    }
  }

  /**
   * Build skill-specific prompt with proper framing
   */
  private buildSkillPrompt(params: ClaudeSkillsParams): string {
    const { skill, prompt, context } = params;

    // Build context section
    let contextSection = "";
    if (context) {
      contextSection = `\n## Context\n${JSON.stringify(context, null, 2)}\n`;
    }

    switch (skill) {
      case "extended_thinking":
        return `You are a world-class AI assistant with deep thinking capabilities.

${contextSection}

Think deeply about this problem using your extended thinking capabilities. Show your complete reasoning process.

${prompt}

Provide a comprehensive, well-reasoned answer.`;

      case "code_generation":
        return `You are an expert software engineer specializing in clean, production-ready code.

${contextSection}

Generate high-quality code that follows best practices:
- Clean, readable, maintainable
- Proper error handling
- Type-safe
- Well-documented
- Following SOLID principles

${prompt}

Think through the design first, then provide the implementation.`;

      case "code_review":
        return `You are a senior code reviewer with expertise in software quality.

${contextSection}

Review this code with focus on:
1. **Bugs & Errors**: Logic errors, edge cases, potential crashes
2. **Security**: Vulnerabilities, injection risks, authentication issues
3. **Performance**: Inefficiencies, memory leaks, optimization opportunities
4. **Best Practices**: Code style, patterns, maintainability
5. **Testing**: Missing test cases, coverage gaps

${prompt}

Provide specific, actionable feedback with examples.`;

      case "architecture_design":
        return `You are a software architect with deep experience in system design.

${contextSection}

Design a robust, scalable architecture considering:
- Scalability and performance
- Maintainability and extensibility
- Security and reliability
- Technology stack fit
- Team expertise
- Future growth

${prompt}

Think through trade-offs, then provide a detailed architectural design.`;

      case "problem_solving":
        return `You are an expert problem solver who approaches challenges systematically.

${contextSection}

Solve this problem using a structured approach:
1. **Understand**: Break down the problem
2. **Analyze**: Identify constraints and requirements
3. **Explore**: Consider multiple solutions
4. **Evaluate**: Compare approaches
5. **Decide**: Choose the best solution
6. **Plan**: Outline implementation steps

${prompt}

Show your reasoning, then provide the solution.`;

      case "refactoring":
        return `You are a refactoring expert who improves code quality.

${contextSection}

Refactor this code to:
- Improve readability and maintainability
- Remove code smells
- Apply design patterns where appropriate
- Enhance performance
- Improve testability
- Preserve functionality

${prompt}

Explain the refactoring strategy, then provide the improved code.`;

      case "test_generation":
        return `You are a testing expert who writes comprehensive test suites.

${contextSection}

Generate tests that cover:
- Happy path scenarios
- Edge cases and boundaries
- Error conditions
- Integration points
- Performance characteristics
- Security aspects

${prompt}

Think through test scenarios, then provide complete test code.`;

      case "documentation":
        return `You are a technical writer who creates clear, comprehensive documentation.

${contextSection}

Create documentation that:
- Explains concepts clearly
- Provides usage examples
- Covers edge cases
- Includes troubleshooting
- Is well-structured
- Is beginner-friendly yet thorough

${prompt}

Think about the audience, then write excellent documentation.`;

      case "debugging":
        return `You are a debugging expert who systematically identifies and fixes issues.

${contextSection}

Debug this issue by:
1. **Reproduce**: Understand how to trigger the bug
2. **Isolate**: Narrow down the root cause
3. **Analyze**: Examine the code flow
4. **Identify**: Pinpoint the exact problem
5. **Fix**: Provide the solution
6. **Prevent**: Suggest how to avoid similar issues

${prompt}

Think through the debugging process, then provide the fix.`;

      case "security_review":
        return `You are a security expert who identifies vulnerabilities and security best practices.

${contextSection}

Conduct a security review checking for:
- **OWASP Top 10**: Injection, auth, XSS, etc.
- **Data Protection**: Encryption, sensitive data handling
- **Access Control**: Authorization, permissions
- **Input Validation**: Sanitization, validation
- **Dependencies**: Known vulnerabilities
- **Configuration**: Security misconfigurations

${prompt}

Analyze security implications, then provide specific recommendations.`;

      default:
        return prompt;
    }
  }

  /**
   * Parse reasoning into discrete steps
   */
  private parseReasoningSteps(reasoning: string): string[] {
    if (!reasoning) return [];

    // Split by paragraphs or major breaks
    const steps = reasoning
      .split(/\n\n+/)
      .filter((step) => step.trim().length > 20)
      .map((step) => step.trim());

    return steps;
  }

  protected getExamples(): string[] {
    return [
      `// Extended Thinking for complex problem
{
  "skill": "extended_thinking",
  "prompt": "How should I design a real-time collaborative editor?",
  "thinkingBudget": 12000,
  "includeReasoning": true
}`,
      `// Code Generation
{
  "skill": "code_generation",
  "prompt": "Create a React hook for infinite scroll pagination",
  "context": {
    "techStack": { "frontend": "React", "language": "TypeScript" }
  }
}`,
      `// Code Review
{
  "skill": "code_review",
  "prompt": "Review this authentication logic: [code here]",
  "includeReasoning": true
}`,
      `// Architecture Design
{
  "skill": "architecture_design",
  "prompt": "Design microservices architecture for a SaaS platform",
  "thinkingBudget": 16000
}`,
    ];
  }
}
