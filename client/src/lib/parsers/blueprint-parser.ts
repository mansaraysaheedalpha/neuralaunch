// src/lib/parsers/blueprint-parser.ts
/**
 * Blueprint Parser - Extracts structured data from NeuraLaunch blueprints
 * Supports both old and new blueprint formats
 */

export interface Feature {
  name: string;
  description: string;
  priority: "must-have" | "should-have" | "nice-to-have";
  complexity: "low" | "medium" | "high";
  userValue?: string;
}

export interface Technology {
  category:
    | "frontend"
    | "backend"
    | "database"
    | "infrastructure"
    | "integration";
  name: string;
  reason?: string;
}

export interface SuccessMetric {
  name: string;
  target: string | number;
  stretchGoal?: string | number;
  dealBreaker?: string | number;
  category: "validation" | "growth" | "revenue";
}

export interface TargetUserProfile {
  who: string;
  currentSolution: string;
  painFrequency: string;
}

export interface PricingTier {
  name: string;
  price: string;
  features: string[];
  targetAudience: string;
}

export interface ParsedBlueprint {
  // Metadata
  projectName: string;
  industry?: string;
  targetMarket?: string;
  businessModel?: string;
  projectType?: string;

  // Core content
  pitch?: string;
  problemStatement?: string;
  solutionStatement?: string;

  // Structured data
  features: Feature[];
  techStack: Technology[];
  successMetrics: SuccessMetric[];
  targetUserProfile?: TargetUserProfile;
  pricingTiers: PricingTier[];

  // Additional
  unfairAdvantages?: string[];
  moatStrategy?: string;

  // Metadata
  extractedAt: Date;
  blueprintVersion: string;
}

/**
 * Main parsing function - attempts multiple strategies
 */
export function parseBlueprint(markdown: string): ParsedBlueprint {
  console.log("🔍 Starting blueprint parsing...");

  // Try new format first, then old format
  let result = parseNewFormat(markdown);

  if (!result.projectName) {
    console.log("📋 New format not detected, trying old format...");
    result = parseOldFormat(markdown);
  }

  console.log(
    `✅ Parsed blueprint: ${result.projectName} with ${result.features.length} features`
  );
  return result;
}

/**
 * Parse NEW enhanced blueprint format
 */
function parseNewFormat(markdown: string): ParsedBlueprint {
  const result: ParsedBlueprint = {
    projectName: "",
    features: [],
    techStack: [],
    successMetrics: [],
    pricingTiers: [],
    extractedAt: new Date(),
    blueprintVersion: "2.0",
  };

  // Extract project name (title with emoji)
  const titleMatch = markdown.match(/^#\s*✨\s*(.+)$/m);
  if (titleMatch) {
    result.projectName = titleMatch[1].trim();
  }

  // Extract pitch
  const pitchMatch = markdown.match(/\*\*The Pitch:\*\*\s*(.+?)(?=\n\n|##)/s);
  if (pitchMatch) {
    result.pitch = pitchMatch[1].trim();
  }

  // Extract Project Metadata section
  const metadataSection = extractSection(markdown, "## 📊 Project Metadata");
  if (metadataSection) {
    result.industry = extractField(metadataSection, "Industry");
    result.targetMarket = extractField(metadataSection, "Target Market");
    result.businessModel = extractField(metadataSection, "Business Model");
    result.projectType = extractField(metadataSection, "Project Type");
  }

  // Extract Target User Profile
  const userProfileSection = extractSection(
    markdown,
    "### Target User Profile"
  );
  if (userProfileSection) {
    result.targetUserProfile = {
      who: extractField(userProfileSection, "Who") || "",
      currentSolution:
        extractField(userProfileSection, "Current Solution") || "",
      painFrequency: extractField(userProfileSection, "Pain Frequency") || "",
    };
  }

  // Extract Problem Statement
  const problemSection = extractSection(markdown, "### The Pain Point");
  if (problemSection) {
    result.problemStatement = problemSection
      .split("\n")
      .slice(1)
      .join("\n")
      .trim();
  }

  // Extract Solution Statement
  const solutionSection = extractSection(markdown, "### What You're Building");
  if (solutionSection) {
    result.solutionStatement = solutionSection
      .split("\n")
      .slice(1)
      .join("\n")
      .trim();
  }

  // Extract Features
  const featuresSection = extractSection(
    markdown,
    "### Core Features (MVP Scope)"
  );
  if (featuresSection) {
    result.features = parseFeatures(featuresSection);
  }

  // Extract Tech Stack
  const techSection = extractSection(markdown, "### Technical Overview");
  if (techSection) {
    result.techStack = parseTechStack(techSection);
  }

  // Extract Success Metrics (table format)
  const metricsSection = extractSection(markdown, "### Success Criteria");
  if (metricsSection) {
    result.successMetrics = parseSuccessMetricsTable(metricsSection);
  }

  // Extract Pricing Tiers
  const pricingSection = extractSection(markdown, "### Pricing Tiers");
  if (pricingSection) {
    result.pricingTiers = parsePricingTiers(pricingSection);
  }

  // Extract Unfair Advantages
  const advantagesSection = extractSection(
    markdown,
    "### Your Unfair Advantages"
  );
  if (advantagesSection) {
    result.unfairAdvantages = parseListItems(advantagesSection);
  }

  // Extract Moat Strategy
  const moatSection = extractSection(markdown, "### Competitive Advantage");
  if (moatSection) {
    result.moatStrategy = moatSection.split("\n").slice(1).join("\n").trim();
  }

  return result;
}

/**
 * Parse OLD blueprint format (backward compatibility)
 */
function parseOldFormat(markdown: string): ParsedBlueprint {
  const result: ParsedBlueprint = {
    projectName: "",
    features: [],
    techStack: [],
    successMetrics: [],
    pricingTiers: [],
    extractedAt: new Date(),
    blueprintVersion: "1.0",
  };

  // Extract project name
  const titleMatch = markdown.match(/^#\s*✨\s*(.+)$/m);
  if (titleMatch) {
    result.projectName = titleMatch[1].trim();
  }

  // Extract pitch
  const pitchMatch = markdown.match(/\*\*The Pitch:\*\*\s*(.+?)(?=\n\n|###)/s);
  if (pitchMatch) {
    result.pitch = pitchMatch[1].trim();
  }

  // In old format, features might not be as structured
  // Try to extract from "What You're Building" section
  const solutionMatch = markdown.match(
    /### 💡 The Solution & Unique Value([\s\S]*?)(?=###|$)/
  );
  if (solutionMatch) {
    const content = solutionMatch[1];
    result.solutionStatement = content.trim();

    // Try to find basic feature mentions (this is best-effort)
    // Old format doesn't have structured features
    result.features = extractFeaturesFromText(content);
  }

  return result;
}

/**
 * Helper: Extract a section by header
 */
function extractSection(markdown: string, header: string): string | null {
  // Escape special regex characters in header
  const escapedHeader = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `${escapedHeader}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##|\\n###|$)`,
    "i"
  );
  const match = markdown.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Helper: Extract field value from markdown
 */
function extractField(text: string, fieldName: string): string | undefined {
  const pattern = new RegExp(
    `\\*\\*${fieldName}:\\*\\*\\s*(.+?)(?=\\n|$)`,
    "i"
  );
  const match = text.match(pattern);
  return match ? match[1].trim() : undefined;
}

/**
 * Parse features from new format
 */
function parseFeatures(text: string): Feature[] {
  const features: Feature[] = [];

  // Match pattern: 1. **Feature Name** - Description (Priority: X | Complexity: Y)
  const featurePattern =
    /\d+\.\s+\*\*(.+?)\*\*\s*-\s*(.+?)\s*\(Priority:\s*(.+?)\s*\|\s*Complexity:\s*(.+?)\)/gi;

  let match;
  while ((match = featurePattern.exec(text)) !== null) {
    const name = match[1].trim();
    const description = match[2].trim();
    const priority = match[3].trim().toLowerCase() as Feature["priority"];
    const complexity = match[4].trim().toLowerCase() as Feature["complexity"];

    features.push({
      name,
      description,
      priority: validatePriority(priority),
      complexity: validateComplexity(complexity),
    });
  }

  return features;
}

/**
 * Parse tech stack from Technical Overview section
 */
function parseTechStack(text: string): Technology[] {
  const techStack: Technology[] = [];

  // Extract tech by category
  const categories = [
    { key: "Frontend", category: "frontend" as const },
    { key: "Backend", category: "backend" as const },
    { key: "Database", category: "database" as const },
    { key: "Auth", category: "infrastructure" as const },
    { key: "Deployment", category: "infrastructure" as const },
    { key: "Key Integrations", category: "integration" as const },
  ];

  for (const { key, category } of categories) {
    const pattern = new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+?)(?=\\n|$)`, "i");
    const match = text.match(pattern);
    if (match) {
      const techList = match[1]
        .split(/,|;/)
        .map((t) => t.trim())
        .filter(Boolean);
      for (const tech of techList) {
        // Remove brackets like [e.g., "..."]
        const cleanTech = tech.replace(/\[e\.g\.,\s*"|"\]/g, "").trim();
        if (cleanTech && cleanTech.length > 2) {
          techStack.push({
            category,
            name: cleanTech,
          });
        }
      }
    }
  }

  return techStack;
}

/**
 * Parse success metrics from table
 */
function parseSuccessMetricsTable(text: string): SuccessMetric[] {
  const metrics: SuccessMetric[] = [];

  // Find the table rows (skip header rows)
  const lines = text.split("\n").filter((line) => line.includes("|"));

  for (const line of lines) {
    // Skip header and separator rows
    if (line.includes("Metric") || line.includes("---")) continue;

    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);

    if (cells.length >= 4) {
      metrics.push({
        name: cells[0],
        target: cells[1],
        stretchGoal: cells[2] || undefined,
        dealBreaker: cells[3] || undefined,
        category: "validation", // Default category
      });
    }
  }

  return metrics;
}

/**
 * Parse pricing tiers
 */
function parsePricingTiers(text: string): PricingTier[] {
  const tiers: PricingTier[] = [];

  // Match pattern: - **Tier Name (Price):** Description - Target audience
  const tierPattern = /[-*]\s*\*\*(.+?)\s*\((.+?)\):\*\*\s*(.+?)(?=\n|$)/gi;

  let match;
  while ((match = tierPattern.exec(text)) !== null) {
    tiers.push({
      name: match[1].trim(),
      price: match[2].trim(),
      features: [], // Would need more parsing for features
      targetAudience: match[3].trim(),
    });
  }

  return tiers;
}

/**
 * Parse list items (for advantages, etc.)
 */
function parseListItems(text: string): string[] {
  const items: string[] = [];

  // Match numbered or bulleted lists
  const lines = text.split("\n");
  for (const line of lines) {
    const match = line.match(/^\d+\.\s*\*\*(.+?)\*\*:\s*(.+)$/);
    if (match) {
      items.push(`${match[1]}: ${match[2]}`);
    }
  }

  return items;
}

/**
 * Extract features from unstructured text (for old format)
 */
function extractFeaturesFromText(text: string): Feature[] {
  // This is a best-effort extraction for old format
  // Look for common feature indicators
  const features: Feature[] = [];

  const lines = text.split("\n");
  for (const line of lines) {
    if (
      line.includes("feature") ||
      line.includes("capability") ||
      line.includes("function")
    ) {
      // Extract the feature description
      const cleaned = line.replace(/^[-*]\s*/, "").trim();
      if (cleaned.length > 10) {
        features.push({
          name: cleaned.substring(0, 50), // First 50 chars as name
          description: cleaned,
          priority: "must-have", // Default
          complexity: "medium", // Default
        });
      }
    }
  }

  return features;
}

/**
 * Validation helpers
 */
function validatePriority(priority: string): Feature["priority"] {
  const normalized = priority.toLowerCase();
  if (normalized.includes("must")) return "must-have";
  if (normalized.includes("should")) return "should-have";
  if (normalized.includes("nice")) return "nice-to-have";
  return "must-have"; // Default
}

function validateComplexity(complexity: string): Feature["complexity"] {
  const normalized = complexity.toLowerCase();
  if (normalized.includes("low")) return "low";
  if (normalized.includes("high")) return "high";
  return "medium"; // Default
}

/**
 * Utility: Get summary stats
 */
export function getBlueprintStats(parsed: ParsedBlueprint) {
  return {
    projectName: parsed.projectName,
    featureCount: parsed.features.length,
    mustHaveFeatures: parsed.features.filter((f) => f.priority === "must-have")
      .length,
    techCount: parsed.techStack.length,
    metricsCount: parsed.successMetrics.length,
    hasPricing: parsed.pricingTiers.length > 0,
    version: parsed.blueprintVersion,
  };
}

/**
 * Utility: Validate parsed blueprint
 */
export function validateParsedBlueprint(parsed: ParsedBlueprint): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!parsed.projectName) {
    errors.push("Missing project name");
  }

  if (parsed.features.length === 0) {
    errors.push("No features extracted");
  }

  if (parsed.techStack.length === 0) {
    errors.push("No technology stack extracted");
  }

  if (!parsed.problemStatement) {
    errors.push("Missing problem statement");
  }

  if (!parsed.solutionStatement) {
    errors.push("Missing solution statement");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
