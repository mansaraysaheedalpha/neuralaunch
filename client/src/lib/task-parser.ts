// src/lib/task-parser.ts
// Parse tasks from AI-generated blueprints

import { AssistantType } from "@prisma/client";

export interface ParsedTask {
  title: string;
  description: string;
  timeEstimate: string;
  orderIndex: number;
  aiAssistantType?: AssistantType;
}

/**
 * Main function: Parse tasks from blueprint
 */
export function parseTasksFromBlueprint(blueprint: string): ParsedTask[] {
  console.log("🚀 Running new robust task parser...");

  const sectionText = extract72HourSection(blueprint);
  if (!sectionText) {
    console.warn(
      "⚠️ Could not find 'Next 72 Hours' section. Using default tasks."
    );
    return generateDefaultTasks();
  }

  const tasks = parseTaskList(sectionText);
  if (tasks.length === 0) {
    console.warn(
      "⚠️ Found section but failed to parse tasks. Using default tasks."
    );
    return generateDefaultTasks();
  }

  console.log(`✅ Successfully parsed ${tasks.length} tasks from blueprint.`);
  return tasks;
}

/**
 * Extract tasks from "Next 72 Hours" section
 */
/**
 * Step 1: Reliably find the "Next 72 Hours" section in the blueprint.
 */
function extract72HourSection(blueprint: string): string | null {
  const sectionPatterns = [
    /### ✅ Your Next 72 Hours[\s\S]*?\n([\s\S]*?)(?=\n###|\n---|\n\*\*🎯|$)/i,
    /Next 72 Hours[\s\S]*?\n([\s\S]*?)(?=\n###|\n---|\n\*\*🎯|$)/i,
  ];

  for (const pattern of sectionPatterns) {
    const match = blueprint.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Step 2: Split the section into individual task blocks and parse each one.
 */
function parseTaskList(sectionText: string): ParsedTask[] {
  // Split the text into blocks starting with "1.", "2.", "3.", etc.
  const taskBlocks = sectionText
    .split(/\n(?=\d+\.\s+\*\*)/)
    .filter((block) => block.trim());
  const tasks: ParsedTask[] = [];

  for (let i = 0; i < taskBlocks.length; i++) {
    const block = taskBlocks[i];
    const taskPattern = /\d+\.\s+\*\*\[Hour\s+([^\]]+)\]:\*\*\s+([\s\S]+)/;
    const match = block.match(taskPattern);

    if (match) {
      const timeRange = match[1].trim();
      const description = match[2].trim().replace(/\s+/g, " ");

      tasks.push({
        title: `Task ${i + 1}: ${generateTitleFromDescription(description)}`,
        description: description,
        timeEstimate: calculateTimeEstimate(timeRange),
        orderIndex: i,
        aiAssistantType: determineAssistantType(description),
      });
    }
  }
  return tasks;
}

/**
 * Step 3: A smarter function to create a clean title from the description.
 */
function generateTitleFromDescription(description: string): string {
  const firstSentence = description.split(".")[0];
  // Example: "Generate 50 target customer profiles" -> "Generate Customer Profiles"
  const title = firstSentence
    .replace(/^(Create|Generate|Draft|Write|Begin|Design|Conduct)\s+/i, "")
    .replace(/(\d+\s+)/, "")
    .replace(/in your immediate network.*$/, "")
    .trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/**
 * Determine which AI assistant to use based on task description
 */
function determineAssistantType(
  description: string
): AssistantType | undefined {
  const lower = description.toLowerCase();

  // More specific checks first
  if (
    lower.includes("interview questions") ||
    (lower.includes("customer") && lower.includes("calls"))
  ) {
    return "INTERVIEW_QUESTIONS";
  }
  if (lower.includes("outreach message") || lower.includes("cold email")) {
    return "OUTREACH_EMAIL";
  }
  if (lower.includes("linkedin")) {
    return "LINKEDIN_MESSAGE";
  }
  if (lower.includes("customer profiles") || lower.includes("personas")) {
    return "CUSTOMER_PROFILE";
  }
  if (lower.includes("competitive") || lower.includes("competitors")) {
    return "COMPETITIVE_ANALYSIS";
  }
  if (lower.includes("pricing")) {
    return "PRICING_STRATEGY";
  }

  // Broader, less specific tasks fall back to GENERAL
  if (
    lower.includes("landing page") ||
    lower.includes("google doc") ||
    lower.includes("template")
  ) {
    return "GENERAL";
  }

  // If nothing matches, we can decide not to offer an assistant
  return undefined;
}

/**
 * Calculate time estimate from hour range intelligently.
 */
function calculateTimeEstimate(timeRange: string): string {
  // Try to parse a range like "9-24"
  const parts = timeRange.split("-").map((s) => parseInt(s.trim(), 10));

  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const startHour = parts[0];
    const endHour = parts[1];

    // The duration is the difference between the end and start hours, inclusive.
    // e.g., "1-8" is 8 hours. "9-24" is 16 hours.
    const duration = endHour - startHour + 1;

    if (duration >= 24) {
      const days = Math.round(duration / 24);
      return `${days} day${days > 1 ? "s" : ""}`;
    }
    return `${duration} hours`;
  }

  // Fallback for a single number format like "8"
  if (parts.length === 1 && !isNaN(parts[0])) {
    return `${parts[0]} hours`;
  }

  // Fallback for any other format we don't understand, just return it as is.
  return timeRange;
}

/**
 * Generate default tasks if blueprint parsing fails
 */
function generateDefaultTasks(): ParsedTask[] {
  return [
    {
      title: "Hour 1-8",
      description:
        "Create your landing page and set up email collection. Use the AI landing page builder to generate a professional validation page in minutes.",
      timeEstimate: "8 hours",
      orderIndex: 0,
      aiAssistantType: undefined, // Already done in Phase 1!
    },
    {
      title: "Hour 9-16",
      description:
        "Generate detailed profiles for 50 target customers. Include their roles, pain points, current solutions, and where to find them online.",
      timeEstimate: "8 hours",
      orderIndex: 1,
      aiAssistantType: "CUSTOMER_PROFILE",
    },
    {
      title: "Hour 17-24",
      description:
        "Write personalized outreach emails to potential customers. Create 3-5 different templates with compelling subject lines and clear calls to action.",
      timeEstimate: "8 hours",
      orderIndex: 2,
      aiAssistantType: "OUTREACH_EMAIL",
    },
    {
      title: "Hour 25-32",
      description:
        "Craft LinkedIn connection requests and follow-up messages. Create professional but friendly outreach that starts conversations, not sales pitches.",
      timeEstimate: "8 hours",
      orderIndex: 3,
      aiAssistantType: "LINKEDIN_MESSAGE",
    },
    {
      title: "Hour 33-48",
      description:
        "Prepare comprehensive interview questions for validation calls. Create open-ended questions that reveal pain points, current solutions, and willingness to pay.",
      timeEstimate: "16 hours",
      orderIndex: 4,
      aiAssistantType: "INTERVIEW_QUESTIONS",
    },
    {
      title: "Hour 49-56",
      description:
        "Conduct customer discovery interviews. Use your prepared questions to have 10-15 conversations with potential customers. Take detailed notes.",
      timeEstimate: "8 hours",
      orderIndex: 5,
      aiAssistantType: undefined, // Manual task
    },
    {
      title: "Hour 57-64",
      description:
        "Analyze competitive landscape. Identify 10 direct and indirect competitors, analyze their strengths/weaknesses, and find your positioning gap.",
      timeEstimate: "8 hours",
      orderIndex: 6,
      aiAssistantType: "COMPETITIVE_ANALYSIS",
    },
    {
      title: "Hour 65-72",
      description:
        "Develop pricing strategy. Create 3 pricing tiers with clear value propositions, analyze competitor pricing, and determine your value metric.",
      timeEstimate: "8 hours",
      orderIndex: 7,
      aiAssistantType: "PRICING_STRATEGY",
    },
  ];
}

/**
 * Validate parsed tasks
 */
export function validateTasks(tasks: ParsedTask[]): boolean {
  if (tasks.length === 0) {
    console.error("❌ No tasks found");
    return false;
  }

  for (const task of tasks) {
    if (!task.title || !task.description) {
      console.error("❌ Task missing title or description:", task);
      return false;
    }
    if (task.orderIndex < 0) {
      console.error("❌ Invalid task order index:", task);
      return false;
    }
  }

  return true;
}

/**
 * Sort tasks by order index
 */
export function sortTasks(tasks: ParsedTask[]): ParsedTask[] {
  return [...tasks].sort((a, b) => a.orderIndex - b.orderIndex);
}

/**
 * Get task summary stats
 */
export function getTaskStats(tasks: ParsedTask[]) {
  const total = tasks.length;
  const withAI = tasks.filter((t) => t.aiAssistantType).length;
  const manual = total - withAI;

  // Calculate total time estimate
  let totalMinutes = 0;
  for (const task of tasks) {
    const estimate = task.timeEstimate.toLowerCase();
    if (estimate.includes("hour")) {
      const hours = parseInt(estimate);
      totalMinutes += hours * 60;
    } else if (estimate.includes("day")) {
      const days = parseInt(estimate);
      totalMinutes += days * 24 * 60;
    }
  }

  return {
    total,
    withAI,
    manual,
    estimatedHours: Math.round(totalMinutes / 60),
    estimatedDays: Math.round(totalMinutes / 60 / 24),
  };
}

/**
 * Format task for display
 */
export function formatTask(task: ParsedTask): string {
  const aiIcon = task.aiAssistantType ? "🤖" : "👤";
  return `${aiIcon} ${task.title}: ${task.description} (${task.timeEstimate})`;
}
