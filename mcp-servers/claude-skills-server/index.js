/**
 * Claude Skills MCP Server for NeuraLaunch
 * Provides advanced AI capabilities via Model Context Protocol
 *
 * Capabilities:
 * - Extended thinking and reasoning
 * - Code generation and review
 * - Architecture design
 * - Problem solving
 * - Test generation
 * - Documentation generation
 * - Debugging assistance
 * - Security review
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3101;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 120000, // 2 minutes
  maxRetries: 2
});

// Skill configurations
const SKILL_CONFIGS = {
  extended_thinking: {
    description: 'Deep reasoning with extended thinking time',
    defaultBudget: 10000,
    temperature: 0.3
  },
  code_generation: {
    description: 'Generate high-quality code',
    defaultBudget: 8000,
    temperature: 0.4
  },
  code_review: {
    description: 'Review code for quality, security, and best practices',
    defaultBudget: 6000,
    temperature: 0.2
  },
  architecture_design: {
    description: 'Design system architecture and technical solutions',
    defaultBudget: 12000,
    temperature: 0.3
  },
  problem_solving: {
    description: 'Solve complex technical problems',
    defaultBudget: 10000,
    temperature: 0.4
  },
  refactoring: {
    description: 'Improve code structure and maintainability',
    defaultBudget: 6000,
    temperature: 0.3
  },
  test_generation: {
    description: 'Generate comprehensive test suites',
    defaultBudget: 5000,
    temperature: 0.4
  },
  documentation: {
    description: 'Generate clear and comprehensive documentation',
    defaultBudget: 5000,
    temperature: 0.3
  },
  debugging: {
    description: 'Identify and fix bugs',
    defaultBudget: 8000,
    temperature: 0.2
  },
  security_review: {
    description: 'Review code for security vulnerabilities',
    defaultBudget: 8000,
    temperature: 0.2
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    anthropic: {
      configured: !!process.env.ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-5-20250929'
    },
    skills: Object.keys(SKILL_CONFIGS)
  };
  res.json(health);
});

// List available skills
app.get('/skills', (req, res) => {
  res.json({
    skills: Object.entries(SKILL_CONFIGS).map(([name, config]) => ({
      name,
      ...config
    }))
  });
});

// MCP endpoint - handles all AI skill requests
app.post('/mcp', async (req, res) => {
  try {
    const { tool, arguments: args } = req.body;

    if (!tool) {
      return res.status(400).json({ error: 'Tool name is required' });
    }

    console.log(`🧠 Executing skill: ${tool}`);

    // All tools route to the same handler with different prompts
    const result = await handleClaudeSkill(tool, args);

    res.json({
      success: true,
      tool,
      result
    });
  } catch (error) {
    console.error('❌ Error executing skill:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Main Claude skill handler
async function handleClaudeSkill(skill, args) {
  const {
    prompt,
    thinkingBudget,
    includeReasoning = false,
    context = {}
  } = args;

  if (!prompt) {
    throw new Error('Prompt is required');
  }

  const config = SKILL_CONFIGS[skill];
  if (!config) {
    throw new Error(`Unknown skill: ${skill}`);
  }

  // Build system message based on skill
  const systemMessage = buildSystemMessage(skill, config, context);

  // Build user message
  const userMessage = buildUserMessage(prompt, context);

  console.log(`📝 Prompt length: ${userMessage.length} chars`);

  try {
    const startTime = Date.now();

    // Call Claude with extended thinking
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
      temperature: config.temperature,
      system: systemMessage,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ],
      thinking: {
        type: 'enabled',
        budget_tokens: thinkingBudget || config.defaultBudget
      }
    });

    const duration = Date.now() - startTime;

    // Extract thinking and answer
    let thinking = '';
    let answer = '';

    for (const block of response.content) {
      if (block.type === 'thinking') {
        thinking += block.thinking;
      } else if (block.type === 'text') {
        answer += block.text;
      }
    }

    console.log(`✅ Completed in ${duration}ms`);
    console.log(`📊 Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);

    return {
      answer,
      skill,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens
      },
      duration,
      reasoning: includeReasoning ? thinking : undefined,
      model: 'claude-sonnet-4-5-20250929'
    };
  } catch (error) {
    console.error('❌ Claude API error:', error);
    throw new Error(`Claude API error: ${error.message}`);
  }
}

// Build system message based on skill
function buildSystemMessage(skill, config, context) {
  const basePrompt = `You are an expert AI assistant specializing in ${config.description}.`;

  const skillPrompts = {
    extended_thinking: `${basePrompt}

Take your time to think deeply about the problem. Use your extended thinking capabilities to:
- Break down complex problems into smaller parts
- Consider multiple approaches and their trade-offs
- Reason through edge cases and potential issues
- Provide well-thought-out solutions`,

    code_generation: `${basePrompt}

When generating code:
- Write clean, maintainable, and well-documented code
- Follow best practices and design patterns
- Consider edge cases and error handling
- Include comments explaining complex logic
- Use modern, idiomatic syntax`,

    code_review: `${basePrompt}

When reviewing code:
- Check for bugs and logical errors
- Identify security vulnerabilities
- Suggest performance improvements
- Verify adherence to best practices
- Check code readability and maintainability
- Provide specific, actionable feedback`,

    architecture_design: `${basePrompt}

When designing architecture:
- Consider scalability and performance
- Think about maintainability and extensibility
- Identify potential bottlenecks
- Suggest appropriate design patterns
- Consider security and data privacy
- Provide clear diagrams and explanations`,

    problem_solving: `${basePrompt}

When solving problems:
- Understand the root cause
- Consider multiple solution approaches
- Evaluate trade-offs
- Provide step-by-step solutions
- Explain your reasoning clearly`,

    refactoring: `${basePrompt}

When refactoring code:
- Improve code structure and organization
- Eliminate duplication
- Enhance readability
- Optimize performance where appropriate
- Maintain backward compatibility
- Explain the improvements made`,

    test_generation: `${basePrompt}

When generating tests:
- Cover normal cases, edge cases, and error cases
- Write clear test descriptions
- Use appropriate assertions
- Ensure tests are maintainable
- Follow testing best practices`,

    documentation: `${basePrompt}

When writing documentation:
- Be clear and concise
- Include examples
- Cover all use cases
- Explain complex concepts simply
- Use proper formatting`,

    debugging: `${basePrompt}

When debugging:
- Analyze the error messages and stack traces
- Identify the root cause
- Suggest specific fixes
- Explain why the bug occurred
- Recommend preventive measures`,

    security_review: `${basePrompt}

When reviewing for security:
- Check for common vulnerabilities (OWASP Top 10)
- Identify authentication and authorization issues
- Look for injection vulnerabilities
- Check for sensitive data exposure
- Verify input validation
- Suggest specific security improvements`
  };

  let systemMessage = skillPrompts[skill] || basePrompt;

  // Add context if provided
  if (context.techStack) {
    systemMessage += `\n\nTech Stack: ${JSON.stringify(context.techStack)}`;
  }
  if (context.architecture) {
    systemMessage += `\n\nArchitecture: ${JSON.stringify(context.architecture)}`;
  }

  return systemMessage;
}

// Build user message
function buildUserMessage(prompt, context) {
  let message = prompt;

  if (context.codebase) {
    message += `\n\nCodebase Context:\n${JSON.stringify(context.codebase, null, 2)}`;
  }

  return message;
}

// Start server
function start() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`
🧠 Claude Skills MCP Server Running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Port: ${PORT}
🌐 Health: http://localhost:${PORT}/health
🔧 MCP Endpoint: http://localhost:${PORT}/mcp
🎯 Skills: ${Object.keys(SKILL_CONFIGS).length} available
💡 Model: claude-sonnet-4-5-20250929
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Available Skills:
${Object.entries(SKILL_CONFIGS).map(([name, config]) => `  • ${name}: ${config.description}`).join('\n')}
    `);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📊 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📊 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
start();
