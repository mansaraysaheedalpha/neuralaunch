// src/lib/agent/planner-graph.ts
import { StateGraph, END, START } from "@langchain/langgraph";
import {
  AITaskType,
  executeAITaskSimple,
  executeAITask,
} from "../ai-orchestrator";
import {
  generateArchitectPrompt,
  generatePlannerSystemInstruction,
  generatePlanningPrompt,
  extractJsonFromString,
} from "./planner-prompt"; // Your prompts
import {
  analyzedStackSchema,
  strictAIPlanResponseSchema,
  flattenPlan,
  consolidateEnvKeys,
} from "@/types/agent-schemas"; // Your schemas
import type {
  AnalyzedStack,
  ActionableTask,
  Question,
  ArchitectPreferences,
  StepResult, // <-- Import StepResult
} from "@/types/agent-schemas";
import prisma from "@/lib/prisma";
import { logger } from "../logger";
import { Prisma } from "@prisma/client";
import { toError } from "../error-utils";

// --- 1. Define the State for our Graph ---
export interface PlannerGraphState {
  projectId: string;
  blueprint: string;
  preferences: ArchitectPreferences;
  reasoningLog: string[]; // <-- NEW: This is the "thought" stream
  analyzedStack?: AnalyzedStack;
  researchedStack?: Record<string, unknown>;
  atomicPlan?: ActionableTask[];
  questions?: Question[];
  envKeys?: string[];
  status: "ANALYZING" | "RESEARCHING" | "PLANNING" | "COMPLETE" | "ERROR";
  error?: string;
  // This field is just for the final DB save
  fullArchitecturePlan?: Prisma.InputJsonValue;
}

// --- 2. Define the Graph Nodes (Our 3 Agents as Generators) ---

/**
 * AGENT 1: The Analyzer
 * Reads blueprint, yields thoughts, yields final stack.
 */
async function* runAnalyzer(
  state: PlannerGraphState
): AsyncGenerator<Partial<PlannerGraphState>> {
  logger.info(`[Graph] Project ${state.projectId}: Running Analyzer...`);

  // <-- 1. YIELD a "thought"
  yield {
    reasoningLog: [
      ...state.reasoningLog,
      "Starting analysis: Reading blueprint and user preferences...",
    ],
  };

  try {
    const architectPrompt = generateArchitectPrompt(
      state.blueprint,
      {
        ...state.preferences,
        framework: state.preferences.framework ?? undefined,
        uiLibrary: state.preferences.uiLibrary ?? undefined,
        authentication: state.preferences.authentication ?? undefined,
        database: state.preferences.database ?? undefined,
        deployment: state.preferences.deployment ?? undefined,
        additionalContext: state.preferences.additionalContext ?? undefined,
      }
    );

    const aiResponseString = await executeAITaskSimple(
      AITaskType.AGENT_ARCHITECT_ANALYZE,
      { prompt: architectPrompt }
    );

    const cleanedJsonString = extractJsonFromString(aiResponseString);
    const rawJsonResponse = JSON.parse(cleanedJsonString) as unknown;
    const analyzedStack = analyzedStackSchema.parse(rawJsonResponse);

    logger.info(
      `[Graph] Project ${state.projectId}: Analyzer SUCCESS. Framework: ${analyzedStack.framework.name}`
    );

    // <-- 2. YIELD the final result of this step
    yield {
      analyzedStack,
      status: "RESEARCHING",
      reasoningLog: [
        ...state.reasoningLog,
        `Analyzer complete. Identified stack: ${analyzedStack.framework.name}.`,
      ],
    };
  } catch (error) {
    logger.error(
      `[Graph] Project ${state.projectId}: Analyzer FAILED`,
      toError(error)
    );
    yield {
      status: "ERROR",
      error: (error as Error).message,
      reasoningLog: [...state.reasoningLog, "Analysis failed."],
    };
  }
}

/**
 * AGENT 2: The Researcher
 * Takes the stack, yields thoughts, yields research.
 */
async function* runResearcher(
  state: PlannerGraphState
): AsyncGenerator<Partial<PlannerGraphState>> {
  if (!state.analyzedStack) {
    yield { status: "ERROR", error: "Cannot run Researcher, no stack." };
    return;
  }
  logger.info(`[Graph] Project ${state.projectId}: Running Researcher...`);
  const techList = [
    state.analyzedStack.framework.name,
    state.analyzedStack.authentication.name,
    state.analyzedStack.database.name,
    state.analyzedStack.payments?.name,
  ]
    .filter(Boolean)
    .join(", ");

  // <-- 1. YIELD a "thought"
  yield {
    reasoningLog: [
      ...state.reasoningLog,
      `Starting research: Finding latest docs for ${techList} using Google Search...`,
    ],
  };

  try {
    const researchPrompt = `
      You are a tech research assistant. For the following technologies, 
      find the official "Get Started" documentation URL and one high-quality 
      "API tutorial" or "best practice" guide for 2025.
      Technologies: ${techList}
      Respond ONLY with a minified JSON object.
    `;

    const aiResponseString = (await executeAITask(
      AITaskType.AGENT_TECH_RESEARCHER,
      { prompt: researchPrompt, stream: false }
    )) as string;

    const cleanedJsonString = extractJsonFromString(aiResponseString);
    const researchedStack = JSON.parse(cleanedJsonString) as Record<
      string,
      unknown
    >;

    logger.info(
      `[Graph] Project ${state.projectId}: Researcher SUCCESS. Found guides.`
    );

    // <-- 2. YIELD the final result
    yield {
      researchedStack,
      status: "PLANNING",
      reasoningLog: [
        ...state.reasoningLog,
        "Research complete. Found up-to-date documentation.",
      ],
    };
  } catch (error) {
    logger.error(
      `[Graph] Project ${state.projectId}: Researcher FAILED`,
      toError(error)
    );
    // Non-critical, just yield a warning and continue
    yield {
      status: "PLANNING",
      reasoningLog: [
        ...state.reasoningLog,
        "Research step failed (Google Search might be down). Proceeding with static knowledge...",
      ],
    };
  }
}

/**
 * AGENT 3: The Planner
 * Creates the final atomic plan.
 */
async function* runPlanner(
  state: PlannerGraphState
): AsyncGenerator<Partial<PlannerGraphState>> {
  if (!state.analyzedStack) {
    yield { status: "ERROR", error: "Cannot run Planner, no stack." };
    return;
  }
  logger.info(`[Graph] Project ${state.projectId}: Running Planner...`);

  // <-- 1. YIELD a "thought"
  yield {
    reasoningLog: [
      ...state.reasoningLog,
      "Generating final atomic plan. This is the longest step...",
    ],
  };

  try {
    const systemInstruction = generatePlannerSystemInstruction();
    const planningPrompt = generatePlanningPrompt(
      state.blueprint,
      state.analyzedStack,
      state.preferences,
      state.researchedStack
    );

    const aiResponseString = await executeAITaskSimple(
      AITaskType.AGENT_PLANNING,
      {
        systemInstruction: systemInstruction,
        prompt: planningPrompt,
        responseFormat: { type: "json_object" },
      }
    );

    const cleanedJsonString = extractJsonFromString(aiResponseString);
    const rawJsonResponse: unknown = JSON.parse(cleanedJsonString);
    const parsedResponse = strictAIPlanResponseSchema.parse(rawJsonResponse);

    const atomicPlan = flattenPlan(parsedResponse.plan);
    const envKeys = consolidateEnvKeys(parsedResponse);
    const questions = Array.isArray(parsedResponse.questions)
      ? parsedResponse.questions
      : [];

    logger.info(
      `[Graph] Project ${state.projectId}: Planner SUCCESS. Plan generated.`
    );

    // <-- 2. YIELD the final plan
    yield {
      atomicPlan,
      envKeys,
      questions,
      fullArchitecturePlan: parsedResponse as unknown as Prisma.InputJsonValue,
      status: "COMPLETE",
      reasoningLog: [...state.reasoningLog, "Plan generation successful!"],
    };
  } catch (error) {
    logger.error(
      `[Graph] Project ${state.projectId}: Planner FAILED`,
      toError(error)
    );
    yield {
      status: "ERROR",
      error: (error as Error).message,
      reasoningLog: [
        ...state.reasoningLog,
        "Critical error: Failed to generate plan.",
      ],
    };
  }
}

// --- 3. Save to Database (Final Step) ---

const savePlanToDb = async (state: PlannerGraphState) => {
  logger.info(`[Graph] Project ${state.projectId}: Saving to DB...`);

  let nextAgentStatus: string;
  if (state.status === "ERROR") {
    nextAgentStatus = "PLAN_FAILED";
  } else if (state.questions && state.questions.length > 0) {
    nextAgentStatus = "PENDING_USER_INPUT";
  } else if (state.envKeys && state.envKeys.length > 0) {
    nextAgentStatus = "PENDING_CONFIGURATION";
  } else {
    nextAgentStatus = "READY_TO_EXECUTE";
  }

  const errorHistory: StepResult[] =
    state.status === "ERROR"
      ? [
          {
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            taskIndex: 0,
            taskDescription: "Agent Planning Phase",
            status: "error",
            summary: "The agent failed to generate a plan.",
            errorMessage: state.error || "Unknown planning error.",
            errorDetails: "Error occurred during graph execution.",
            filesWritten: [],
            commandsRun: [],
          },
        ]
      : [];

  await prisma.landingPage.update({
    where: { id: state.projectId },
    data: {
      agentArchitectPreferences: state.preferences as Prisma.InputJsonValue,
      agentAnalyzedStack: state.analyzedStack as unknown as Prisma.InputJsonValue,
      agentArchitecturePlan: state.fullArchitecturePlan || Prisma.JsonNull,
      agentPlan: (state.atomicPlan as unknown as Prisma.InputJsonValue) || Prisma.JsonNull,
      agentClarificationQuestions:
        (state.questions as Prisma.InputJsonValue) || Prisma.JsonNull,
      agentRequiredEnvKeys:
        (state.envKeys as Prisma.InputJsonValue) || Prisma.JsonNull,
      agentUserResponses: Prisma.JsonNull,
      agentCurrentStep: 0,
      agentStatus: nextAgentStatus,
      agentExecutionHistory:
        state.status === "ERROR"
          ? (errorHistory as Prisma.InputJsonValue)
          : Prisma.JsonNull,
    },
  });
  logger.info(`[Graph] Project ${state.projectId}: Save COMPLETE. Status: ${nextAgentStatus}`);
  return state;
};

// --- 4. Build and Compile the Graph ---

// 👇 THIS IS THE FIX. Replace your old 'workflow' variable with this one.
// The 'channels' are the "memory" of the graph. We must tell them how to update.
const workflow = new StateGraph<PlannerGraphState>({
  channels: {
    // These are static and never change
    projectId: { value: null },
    blueprint: { value: null },
    preferences: { value: null },

    // These channels should UPDATE to the latest value from any node
    // (a, b) => b ?? a  means: "Use the new value (b) if it exists, otherwise keep the old one (a)"
    analyzedStack: { value: (a: any, b: any) => b ?? a, default: () => undefined },
    researchedStack: { value: (a: any, b: any) => b ?? a, default: () => undefined },
    atomicPlan: { value: (a: any, b: any) => b ?? a, default: () => undefined },
    questions: { value: (a: any, b: any) => b ?? a, default: () => undefined },
    envKeys: { value: (a: any, b: any) => b ?? a, default: () => undefined },
    fullArchitecturePlan: { value: (a: any, b: any) => b ?? a, default: () => undefined },
    error: { value: (a: any, b: any) => b ?? a, default: () => undefined },

    // 'status' should always be the most recent update
    status: { value: (a: any, b: any) => b, default: () => "ANALYZING" as const },
    
    // 'reasoningLog' should ACCUMULATE new messages
    reasoningLog: { value: (a: any, b: any) => b, default: () => [] },
  },
});

// Add nodes (these are now generators)
workflow.addNode("analyzer", runAnalyzer as any);
workflow.addNode("researcher", runResearcher as any);
workflow.addNode("planner", runPlanner as any);
workflow.addNode("save_to_db", savePlanToDb as any); // This one is a normal function

// Define edges (how the agents are connected)
workflow.addEdge(START, "analyzer" as any);
workflow.addConditionalEdges("analyzer" as any, ((state: any) =>
  state.status === "ERROR" ? "save_to_db" : "researcher"
) as any);
workflow.addConditionalEdges("researcher" as any, ((state: any) =>
  state.status === "ERROR" ? "save_to_db" : "planner"
) as any);
workflow.addConditionalEdges("planner" as any, ((_state: any) => "save_to_db") as any);
workflow.addEdge("save_to_db" as any, END);

// Compile the graph
export const app = workflow.compile();

/**
 * Main function to STREAM the graph's execution.
 * This is what your new API route will call.
 */
export const runPlannerGraphStream = async (
  initialState: PlannerGraphState
) => {
  return app.stream(initialState as any, {
    // We want to see the output of *every* node as it runs
    streamMode: "values",
  });
};
