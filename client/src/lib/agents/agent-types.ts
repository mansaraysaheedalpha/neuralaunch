// src/lib/agents/agent-types.ts
/**
 * Centralized Agent Type System
 *
 * Defines all agent types, metadata, and categories used throughout the system.
 * Import this instead of hardcoding agent names as strings.
 */

// ==========================================
// AGENT TYPE CONSTANTS
// ==========================================

export const AGENT_TYPES = {
  // Planning Phase Agents
  ANALYZER: "AnalyzerAgent",
  RESEARCH: "ResearchAgent",
  VALIDATION: "ValidationAgent",
  PLANNING: "PlanningAgent",

  // Execution Phase Agents
  FRONTEND: "FrontendAgent",
  BACKEND: "BackendAgent",
  DATABASE: "DatabaseAgent",
  INFRASTRUCTURE: "InfrastructureAgent",

  // Quality Phase Agents
  TESTING: "TestingAgent",
  CRITIC: "CriticAgent",

  // Integration & Deployment Phase Agents
  INTEGRATION: "IntegrationAgent",
  DEPLOYMENT: "DeploymentAgent",
  DOCUMENTATION: "DocumentationAgent",
  MONITORING: "MonitoringAgent",
  OPTIMIZATION: "OptimizationAgent",
} as const;

export type AgentType = (typeof AGENT_TYPES)[keyof typeof AGENT_TYPES];

// ==========================================
// AGENT CATEGORIES
// ==========================================

export const AGENT_CATEGORIES = {
  PLANNING: "planning",
  EXECUTION: "execution",
  QUALITY: "quality",
  DEPLOYMENT: "deployment",
} as const;

export type AgentCategory =
  (typeof AGENT_CATEGORIES)[keyof typeof AGENT_CATEGORIES];

// ==========================================
// AGENT METADATA
// ==========================================

export interface AgentMetadata {
  icon: string;
  emoji: string; // Emoji for UI
  color: string; // Tailwind gradient classes
  displayName: string;
  category: AgentCategory;
  description: string;
}

export const AGENT_METADATA: Record<AgentType, AgentMetadata> = {
  // Planning Agents
  [AGENT_TYPES.ANALYZER]: {
    icon: "🔍",
    emoji: "🔍",
    color: "from-blue-500 to-cyan-500",
    displayName: "Analyzer Agent",
    category: AGENT_CATEGORIES.PLANNING,
    description: "Analyzes project requirements and technical specifications",
  },
  [AGENT_TYPES.RESEARCH]: {
    icon: "📚",
    emoji: "📚",
    color: "from-indigo-500 to-purple-500",
    displayName: "Research Agent",
    category: AGENT_CATEGORIES.PLANNING,
    description: "Researches best practices and technology recommendations",
  },
  [AGENT_TYPES.VALIDATION]: {
    icon: "✅",
    emoji: "✅",
    color: "from-green-500 to-emerald-500",
    displayName: "Validation Agent",
    category: AGENT_CATEGORIES.PLANNING,
    description: "Validates technical feasibility and requirements",
  },
  [AGENT_TYPES.PLANNING]: {
    icon: "📋",
    emoji: "📋",
    color: "from-purple-500 to-pink-500",
    displayName: "Planning Agent",
    category: AGENT_CATEGORIES.PLANNING,
    description: "Creates detailed execution plan and architecture",
  },

  // Execution Agents
  [AGENT_TYPES.FRONTEND]: {
    icon: "⚛️",
    emoji: "⚛️",
    color: "from-purple-500 to-pink-500",
    displayName: "Frontend Agent",
    category: AGENT_CATEGORIES.EXECUTION,
    description: "Builds UI components, pages, and layouts",
  },
  [AGENT_TYPES.BACKEND]: {
    icon: "⚙️",
    emoji: "⚙️",
    color: "from-blue-500 to-cyan-500",
    displayName: "Backend Agent",
    category: AGENT_CATEGORIES.EXECUTION,
    description: "Implements API routes, business logic, and services",
  },
  [AGENT_TYPES.DATABASE]: {
    icon: "🗄️",
    emoji: "🗄️",
    color: "from-yellow-500 to-orange-500",
    displayName: "Database Agent",
    category: AGENT_CATEGORIES.EXECUTION,
    description: "Designs schemas, migrations, and queries",
  },
  [AGENT_TYPES.INFRASTRUCTURE]: {
    icon: "🏗️",
    emoji: "🏗️",
    color: "from-orange-500 to-red-500",
    displayName: "Infrastructure Agent",
    category: AGENT_CATEGORIES.EXECUTION,
    description: "Sets up infrastructure, CI/CD, and environments",
  },

  // Quality Agents
  [AGENT_TYPES.TESTING]: {
    icon: "🧪",
    emoji: "🧪",
    color: "from-green-500 to-teal-500",
    displayName: "Testing Agent",
    category: AGENT_CATEGORIES.QUALITY,
    description: "Writes and executes unit, integration, and E2E tests",
  },
  [AGENT_TYPES.CRITIC]: {
    icon: "🔎",
    emoji: "🔎",
    color: "from-indigo-500 to-purple-500",
    displayName: "Critic Agent",
    category: AGENT_CATEGORIES.QUALITY,
    description: "Reviews code quality, security, and best practices",
  },

  // Deployment Agents
  [AGENT_TYPES.INTEGRATION]: {
    icon: "🔗",
    emoji: "🔗",
    color: "from-teal-500 to-cyan-500",
    displayName: "Integration Agent",
    category: AGENT_CATEGORIES.DEPLOYMENT,
    description: "Integrates third-party APIs and external services",
  },
  [AGENT_TYPES.DEPLOYMENT]: {
    icon: "🚀",
    emoji: "🚀",
    color: "from-rose-500 to-pink-500",
    displayName: "Deployment Agent",
    category: AGENT_CATEGORIES.DEPLOYMENT,
    description: "Deploys applications to production environments",
  },
  [AGENT_TYPES.DOCUMENTATION]: {
    icon: "📖",
    emoji: "📖",
    color: "from-yellow-500 to-amber-500",
    displayName: "Documentation Agent",
    category: AGENT_CATEGORIES.DEPLOYMENT,
    description: "Generates comprehensive project documentation",
  },
  [AGENT_TYPES.MONITORING]: {
    icon: "📊",
    emoji: "📊",
    color: "from-blue-500 to-indigo-500",
    displayName: "Monitoring Agent",
    category: AGENT_CATEGORIES.DEPLOYMENT,
    description: "Sets up monitoring, logging, and alerting",
  },
  [AGENT_TYPES.OPTIMIZATION]: {
    icon: "⚡",
    emoji: "⚡",
    color: "from-amber-500 to-orange-500",
    displayName: "Optimization Agent",
    category: AGENT_CATEGORIES.DEPLOYMENT,
    description: "Optimizes performance, caching, and scalability",
  },
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Get agent metadata by agent name
 */
export function getAgentMetadata(agentName: string): AgentMetadata | null {
  return AGENT_METADATA[agentName as AgentType] || null;
}

/**
 * Get all agents by category
 */
export function getAgentsByCategory(category: AgentCategory): AgentType[] {
  return Object.entries(AGENT_METADATA)
    .filter(([_, meta]) => meta.category === category)
    .map(([type, _]) => type as AgentType);
}

/**
 * Check if agent name is valid
 */
export function isValidAgentType(agentName: string): agentName is AgentType {
  return agentName in AGENT_METADATA;
}

/**
 * Get agent display name (with fallback)
 */
export function getAgentDisplayName(agentName: string): string {
  const metadata = getAgentMetadata(agentName);
  return metadata?.displayName || agentName;
}

/**
 * Get agent icon/emoji (with fallback)
 */
export function getAgentIcon(agentName: string): string {
  const metadata = getAgentMetadata(agentName);
  return metadata?.emoji || "🤖";
}

/**
 * Get agent color classes (with fallback)
 */
export function getAgentColor(agentName: string): string {
  const metadata = getAgentMetadata(agentName);
  return metadata?.color || "from-gray-500 to-slate-500";
}

// ==========================================
// EXPORTS
// ==========================================

const agentUtilities = {
  AGENT_TYPES,
  AGENT_CATEGORIES,
  AGENT_METADATA,
  getAgentMetadata,
  getAgentsByCategory,
  isValidAgentType,
  getAgentDisplayName,
  getAgentIcon,
  getAgentColor,
} as const;

export default agentUtilities;
