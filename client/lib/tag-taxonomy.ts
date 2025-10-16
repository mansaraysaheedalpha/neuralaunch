// lib/tag-taxonomy.ts
// World-class predefined taxonomy for consistent tagging

export const TAG_TAXONOMY = {
  // Technical Skills & Technologies
  technologies: [
    "React",
    "Next.js",
    "Vue.js",
    "Angular",
    "Svelte",
    "Node.js",
    "Python",
    "Django",
    "Flask",
    "FastAPI",
    "TypeScript",
    "JavaScript",
    "Go",
    "Rust",
    "Java",
    "PostgreSQL",
    "MongoDB",
    "MySQL",
    "Redis",
    "GraphQL",
    "Docker",
    "Kubernetes",
    "AWS",
    "Azure",
    "GCP",
    "TensorFlow",
    "PyTorch",
    "Scikit-learn",
    "OpenAI API",
    "Stripe",
    "Twilio",
    "SendGrid",
    "Firebase",
    "Supabase",
  ],

  // Business Models
  businessModels: [
    "SaaS",
    "Marketplace",
    "E-commerce",
    "Subscription",
    "Freemium",
    "Enterprise",
    "Self-Serve",
    "Usage-Based",
    "Transaction Fee",
    "Commission",
    "Advertising",
    "Licensing",
    "White-Label",
    "Platform",
    "API",
  ],

  // Target Markets
  targetMarkets: [
    "B2B",
    "B2C",
    "B2B2C",
    "Enterprise",
    "SMB",
    "Solopreneur",
    "Developer",
    "Designer",
    "Marketer",
    "Sales Team",
    "Remote Workers",
    "Freelancers",
  ],

  // Industries & Verticals
  industries: [
    "HealthTech",
    "FinTech",
    "EdTech",
    "PropTech",
    "LegalTech",
    "HR Tech",
    "MarTech",
    "Sales Tech",
    "DevTools",
    "AI/ML",
    "Healthcare",
    "Finance",
    "Education",
    "Real Estate",
    "E-commerce",
    "Retail",
    "Manufacturing",
    "Logistics",
    "Entertainment",
    "Media",
    "Travel",
    "Hospitality",
    "Food & Beverage",
    "Agriculture",
    "Energy",
    "Construction",
  ],

  // Startup Stage & Strategy
  stages: [
    "MVP",
    "Pre-Seed",
    "Seed",
    "Series A",
    "Growth",
    "Bootstrap",
    "Validation",
    "GTM",
    "Scaling",
    "Pivot",
  ],

  // Key Concepts
  concepts: [
    "AI",
    "Machine Learning",
    "Automation",
    "Analytics",
    "CRM",
    "Productivity",
    "Collaboration",
    "Communication",
    "Project Management",
    "Time Tracking",
    "Invoicing",
    "Customer Support",
    "Marketing Automation",
    "SEO",
    "Content Creation",
    "Video",
    "Audio",
    "Design",
    "No-Code",
    "Low-Code",
    "API Integration",
    "Workflow",
  ],

  // Monetization & Metrics
  metrics: [
    "High LTV",
    "Low CAC",
    "Viral Growth",
    "Network Effects",
    "Data Moat",
    "Community",
    "Content",
    "Brand",
  ],
};

// Flatten all tags into a single searchable array
export const ALL_VALID_TAGS = [
  ...TAG_TAXONOMY.technologies,
  ...TAG_TAXONOMY.businessModels,
  ...TAG_TAXONOMY.targetMarkets,
  ...TAG_TAXONOMY.industries,
  ...TAG_TAXONOMY.stages,
  ...TAG_TAXONOMY.concepts,
  ...TAG_TAXONOMY.metrics,
];

// Function to find closest matching valid tag
export function findClosestTag(input: string): string | null {
  const normalized = input.toLowerCase().trim();

  // Exact match (case-insensitive)
  const exactMatch = ALL_VALID_TAGS.find(
    (tag) => tag.toLowerCase() === normalized
  );
  if (exactMatch) return exactMatch;

  // Partial match
  const partialMatch = ALL_VALID_TAGS.find(
    (tag) =>
      tag.toLowerCase().includes(normalized) ||
      normalized.includes(tag.toLowerCase())
  );
  if (partialMatch) return partialMatch;

  return null;
}

// Function to validate and clean tags
export function cleanAndValidateTags(rawTags: string[]): string[] {
  const validTags = new Set<string>();

  for (const rawTag of rawTags) {
    // Skip if empty or too short
    if (!rawTag || rawTag.length < 2) continue;

    // Skip if it looks like a sentence (contains multiple words)
    const wordCount = rawTag.trim().split(/\s+/).length;
    if (wordCount > 3) continue;

    // Try to find a matching valid tag
    const cleanTag = findClosestTag(rawTag);
    if (cleanTag) {
      validTags.add(cleanTag);
    }
  }

  return Array.from(validTags);
}

// Get structured prompt for AI tag extraction
export function getTagExtractionPrompt(blueprint: string): string {
  return `Analyze this startup blueprint and extract ONLY clean, single-word or short-phrase tags.

RULES:
1. Return ONLY tags, NOT sentences or paragraphs
2. Each tag must be 1-3 words maximum
3. Use standard industry terminology
4. Include: technologies, business model, target market, industry
5. Return tags separated by commas
6. Example format: "React, SaaS, B2B, HealthTech, API, Enterprise"

Valid tag categories:
- Technologies: React, Python, Node.js, PostgreSQL, AWS, etc.
- Business Models: SaaS, Marketplace, Subscription, Freemium, etc.
- Target Markets: B2B, B2C, Enterprise, SMB, Developer, etc.
- Industries: HealthTech, FinTech, EdTech, AI/ML, etc.
- Concepts: Automation, Analytics, CRM, Productivity, etc.

STARTUP BLUEPRINT:
${blueprint}

EXTRACT ONLY CLEAN TAGS (comma-separated):`;
}

// Get example tags for AI to learn from
export function getExampleTags(): string {
  return `
Examples of GOOD tags:
- "React, TypeScript, SaaS, B2B, DevTools"
- "Python, AI, Machine Learning, B2C, EdTech"
- "Next.js, Stripe, Subscription, Marketplace, E-commerce"

Examples of BAD tags (DO NOT USE):
- "the entire framework is a strategic..."
- "Based on the provided startup blueprint..."
- "actionable plan covering everything from..."
`;
}
