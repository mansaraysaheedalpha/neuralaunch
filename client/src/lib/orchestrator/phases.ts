// src/lib/orchestrator/phases.ts
/**
 * Orchestrator Phase System
 *
 * Defines all orchestration phases and their metadata.
 * Import this instead of hardcoding phase names as strings.
 */

// ==========================================
// PHASE CONSTANTS
// ==========================================

export const ORCHESTRATOR_PHASES = {
  // Pre-execution phases
  INITIALIZING: "initializing",

  // Planning phases (run by orchestrator automatically)
  ANALYSIS: "analysis",
  RESEARCH: "research",
  VALIDATION: "validation",
  PLANNING: "planning",

  // Human review phase (execution pauses here)
  PLAN_REVIEW: "plan_review",

  // Execution phases (after plan approval)
  WAVE_EXECUTION: "wave_execution",
  QUALITY_CHECK: "quality_check",
  DEPLOYMENT: "deployment",

  // Terminal phases
  COMPLETE: "complete",
  FAILED: "failed",
} as const;

export type OrchestratorPhase =
  (typeof ORCHESTRATOR_PHASES)[keyof typeof ORCHESTRATOR_PHASES];

// ==========================================
// PHASE GROUPS
// ==========================================

/**
 * Planning phases (run automatically by orchestrator)
 */
export const PLANNING_PHASES: OrchestratorPhase[] = [
  ORCHESTRATOR_PHASES.ANALYSIS,
  ORCHESTRATOR_PHASES.RESEARCH,
  ORCHESTRATOR_PHASES.VALIDATION,
  ORCHESTRATOR_PHASES.PLANNING,
];

/**
 * Execution phases (run after plan approval)
 */
export const EXECUTION_PHASES: OrchestratorPhase[] = [
  ORCHESTRATOR_PHASES.WAVE_EXECUTION,
  ORCHESTRATOR_PHASES.QUALITY_CHECK,
  ORCHESTRATOR_PHASES.DEPLOYMENT,
];

/**
 * All active phases (not terminal states)
 */
export const ACTIVE_PHASES: OrchestratorPhase[] = [
  ORCHESTRATOR_PHASES.INITIALIZING,
  ...PLANNING_PHASES,
  ORCHESTRATOR_PHASES.PLAN_REVIEW,
  ...EXECUTION_PHASES,
];

/**
 * Terminal phases (orchestration stops here)
 */
export const TERMINAL_PHASES: OrchestratorPhase[] = [
  ORCHESTRATOR_PHASES.COMPLETE,
  ORCHESTRATOR_PHASES.FAILED,
];

// ==========================================
// PHASE METADATA
// ==========================================

export interface PhaseMetadata {
  name: string;
  description: string;
  icon: string;
  color: string; // Tailwind color class
  category: "planning" | "review" | "execution" | "terminal";
  order: number; // For progress calculation
}

export const PHASE_METADATA: Record<OrchestratorPhase, PhaseMetadata> = {
  [ORCHESTRATOR_PHASES.INITIALIZING]: {
    name: "Initializing",
    description: "Setting up your project...",
    icon: "⚙️",
    color: "text-gray-500",
    category: "planning",
    order: 0,
  },
  [ORCHESTRATOR_PHASES.ANALYSIS]: {
    name: "Analysis",
    description: "Analyzing project requirements and technical specifications",
    icon: "🔍",
    color: "text-blue-500",
    category: "planning",
    order: 1,
  },
  [ORCHESTRATOR_PHASES.RESEARCH]: {
    name: "Research",
    description: "Researching best practices and technology recommendations",
    icon: "📚",
    color: "text-indigo-500",
    category: "planning",
    order: 2,
  },
  [ORCHESTRATOR_PHASES.VALIDATION]: {
    name: "Validation",
    description: "Validating technical feasibility and requirements",
    icon: "✅",
    color: "text-green-500",
    category: "planning",
    order: 3,
  },
  [ORCHESTRATOR_PHASES.PLANNING]: {
    name: "Planning",
    description: "Creating detailed execution plan and architecture",
    icon: "📋",
    color: "text-purple-500",
    category: "planning",
    order: 4,
  },
  [ORCHESTRATOR_PHASES.PLAN_REVIEW]: {
    name: "Plan Review",
    description: "Plan completed! Ready for your review and approval",
    icon: "👁️",
    color: "text-amber-500",
    category: "review",
    order: 5,
  },
  [ORCHESTRATOR_PHASES.WAVE_EXECUTION]: {
    name: "Execution",
    description: "Building your application with AI agents",
    icon: "🚀",
    color: "text-blue-500",
    category: "execution",
    order: 6,
  },
  [ORCHESTRATOR_PHASES.QUALITY_CHECK]: {
    name: "Quality Check",
    description: "Testing and reviewing code quality",
    icon: "🔎",
    color: "text-green-500",
    category: "execution",
    order: 7,
  },
  [ORCHESTRATOR_PHASES.DEPLOYMENT]: {
    name: "Deployment",
    description: "Deploying to production environment",
    icon: "🌐",
    color: "text-rose-500",
    category: "execution",
    order: 8,
  },
  [ORCHESTRATOR_PHASES.COMPLETE]: {
    name: "Complete",
    description: "All phases completed successfully",
    icon: "🎉",
    color: "text-green-600",
    category: "terminal",
    order: 9,
  },
  [ORCHESTRATOR_PHASES.FAILED]: {
    name: "Failed",
    description: "Orchestration encountered errors",
    icon: "❌",
    color: "text-red-600",
    category: "terminal",
    order: -1,
  },
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Check if phase is in planning stage
 */
export function isPlanningPhase(phase: string): boolean {
  return PLANNING_PHASES.includes(phase as OrchestratorPhase);
}

/**
 * Check if phase is in execution stage
 */
export function isExecutionPhase(phase: string): boolean {
  return EXECUTION_PHASES.includes(phase as OrchestratorPhase);
}

/**
 * Check if phase is terminal (complete/failed)
 */
export function isTerminalPhase(phase: string): boolean {
  return TERMINAL_PHASES.includes(phase as OrchestratorPhase);
}

/**
 * Check if phase is awaiting human action
 */
export function isAwaitingHumanAction(phase: string): boolean {
  return phase === ORCHESTRATOR_PHASES.PLAN_REVIEW;
}

/**
 * Get phase metadata
 */
export function getPhaseMetadata(phase: string): PhaseMetadata | null {
  return PHASE_METADATA[phase as OrchestratorPhase] || null;
}

/**
 * Calculate progress percentage based on current phase
 * Returns 0-100
 */
export function calculatePhaseProgress(phase: string): number {
  const metadata = getPhaseMetadata(phase);
  if (!metadata) return 0;

  if (metadata.category === "terminal") {
    return phase === ORCHESTRATOR_PHASES.COMPLETE ? 100 : 0;
  }

  const totalPhases = ACTIVE_PHASES.length;
  const currentOrder = metadata.order;

  // Calculate progress (0-100)
  return Math.round((currentOrder / totalPhases) * 100);
}

/**
 * Get next phase in sequence
 */
export function getNextPhase(currentPhase: string): OrchestratorPhase | null {
  const metadata = getPhaseMetadata(currentPhase);
  if (!metadata) return null;

  const nextOrder = metadata.order + 1;
  const nextPhase = Object.entries(PHASE_METADATA).find(
    ([_, meta]) => meta.order === nextOrder
  );

  return nextPhase ? (nextPhase[0] as OrchestratorPhase) : null;
}

/**
 * Get previous phase in sequence
 */
export function getPreviousPhase(
  currentPhase: string
): OrchestratorPhase | null {
  const metadata = getPhaseMetadata(currentPhase);
  if (!metadata) return null;

  const prevOrder = metadata.order - 1;
  const prevPhase = Object.entries(PHASE_METADATA).find(
    ([_, meta]) => meta.order === prevOrder
  );

  return prevPhase ? (prevPhase[0] as OrchestratorPhase) : null;
}

/**
 * Get all phases in order
 */
export function getPhasesInOrder(): OrchestratorPhase[] {
  return Object.entries(PHASE_METADATA)
    .filter(([_, meta]) => meta.order >= 0) // Exclude FAILED
    .sort((a, b) => a[1].order - b[1].order)
    .map(([phase, _]) => phase as OrchestratorPhase);
}

/**
 * Format phase for display
 */
export function formatPhaseDisplay(phase: string): string {
  const metadata = getPhaseMetadata(phase);
  return metadata ? `${metadata.icon} ${metadata.name}` : phase;
}

/**
 * Get completion percentage for planning phases only
 * Returns 0-40 (planning is 40% of total)
 */
export function getPlanningProgress(phase: string): number {
  if (!isPlanningPhase(phase)) {
    // If past planning, return 40 (full planning progress)
    const metadata = getPhaseMetadata(phase);
    if (metadata && metadata.order > 4) return 40;
    return 0;
  }

  const phaseIndex = PLANNING_PHASES.indexOf(phase as OrchestratorPhase);
  return Math.round(((phaseIndex + 1) / PLANNING_PHASES.length) * 40);
}

/**
 * Get completion percentage for execution phases only
 * Returns 40-100 (execution is 60% of total, starting from 40)
 */
export function getExecutionProgress(phase: string): number {
  if (isPlanningPhase(phase)) return 40; // Not started yet
  if (phase === ORCHESTRATOR_PHASES.PLAN_REVIEW) return 40;

  if (!isExecutionPhase(phase)) {
    if (phase === ORCHESTRATOR_PHASES.COMPLETE) return 100;
    return 40;
  }

  const phaseIndex = EXECUTION_PHASES.indexOf(phase as OrchestratorPhase);
  const executionProgress = ((phaseIndex + 1) / EXECUTION_PHASES.length) * 60;
  return Math.round(40 + executionProgress);
}

// ==========================================
// EXPORTS
// ==========================================

const phaseUtils = {
  ORCHESTRATOR_PHASES,
  PLANNING_PHASES,
  EXECUTION_PHASES,
  ACTIVE_PHASES,
  TERMINAL_PHASES,
  PHASE_METADATA,
  isPlanningPhase,
  isExecutionPhase,
  isTerminalPhase,
  isAwaitingHumanAction,
  getPhaseMetadata,
  calculatePhaseProgress,
  getNextPhase,
  getPreviousPhase,
  getPhasesInOrder,
  formatPhaseDisplay,
  getPlanningProgress,
  getExecutionProgress,
};

export default phaseUtils;
