// lib/landing-page-generator.ts
// FIXED VERSION - Proper slug generation and better AI prompts

import { AI_MODELS } from "@/lib/models";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export interface LandingPageContent {
  headline: string;
  subheadline: string;
  problemStatement: string;
  solutionStatement: string;
  features: Array<{
    title: string;
    description: string;
    icon: string;
  }>;
  ctaText: string;
  metaTitle: string;
  metaDescription: string;
}

export interface DesignVariant {
  id: string;
  name: string;
  description: string;
  colorScheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  personality: string;
}

export const DESIGN_VARIANTS: DesignVariant[] = [
  {
    id: "professional",
    name: "Professional B2B",
    description: "Clean, corporate, trustworthy - perfect for B2B SaaS",
    colorScheme: {
      primary: "#2563eb",
      secondary: "#1e40af",
      accent: "#3b82f6",
      background: "#ffffff",
      text: "#1f2937",
    },
    personality: "serif fonts, structured layout, subtle animations",
  },
  {
    id: "playful",
    name: "Playful B2C",
    description: "Fun, colorful, energetic - perfect for consumer apps",
    colorScheme: {
      primary: "#ec4899",
      secondary: "#f59e0b",
      accent: "#8b5cf6",
      background: "#fef3c7",
      text: "#1f2937",
    },
    personality: "rounded corners, bold fonts, playful animations",
  },
  {
    id: "minimalist",
    name: "Minimalist Tech",
    description: "Simple, elegant, modern - perfect for productivity tools",
    colorScheme: {
      primary: "#000000",
      secondary: "#374151",
      accent: "#6b7280",
      background: "#ffffff",
      text: "#111827",
    },
    personality: "sans-serif, whitespace, subtle transitions",
  },
  {
    id: "bold",
    name: "Bold & Vibrant",
    description: "Eye-catching, confident, modern - perfect for disruptors",
    colorScheme: {
      primary: "#dc2626",
      secondary: "#ea580c",
      accent: "#f59e0b",
      background: "#1f2937",
      text: "#f9fafb",
    },
    personality: "large typography, high contrast, dramatic",
  },
  {
    id: "calm",
    name: "Calm & Trustworthy",
    description: "Soothing, professional, healthcare-friendly",
    colorScheme: {
      primary: "#059669",
      secondary: "#0d9488",
      accent: "#06b6d4",
      background: "#f0fdf4",
      text: "#064e3b",
    },
    personality: "soft colors, gentle animations, approachable",
  },
];

// IMPROVED AI Prompt with better instructions
function getLandingPagePrompt(
  blueprint: string,
  targetMarket: string,
  startupTitle: string
): string {
  return `You are a world-class copywriter who has written landing pages for Stripe, Notion, and Linear.

STARTUP NAME: ${startupTitle}

STARTUP BLUEPRINT:
${blueprint}

TARGET MARKET: ${targetMarket}

YOUR TASK: Create a high-converting landing page that follows these proven principles:

1. HEADLINE (8-12 words):
   - Start with a verb or power word
   - Promise a clear benefit
   - Create curiosity or urgency
   - Examples: "Build your startup in 72 hours, not 6 months"
   - Avoid: Generic phrases like "Welcome to..." or "The best..."

2. SUBHEADLINE (15-20 words):
   - Expand on the headline
   - Address the pain point directly
   - Show transformation (before → after)
   - Be specific with numbers/timeframes

3. PROBLEM STATEMENT (2-3 sentences):
   - Describe the painful status quo
   - Use emotional language
   - Show you understand their struggle

4. SOLUTION STATEMENT (2-3 sentences):
   - Explain your unique approach
   - Focus on HOW it's different
   - Use concrete examples

5. FEATURES (3 features):
   - Each feature = benefit (not capability)
   - 15-20 words per description
   - Include specific outcomes
   - Use power words (fast, easy, proven, guaranteed)
   - Choose relevant emojis for icons

6. CTA (2-4 words):
   - Action-oriented
   - Create urgency
   - Examples: "Start Free Trial", "Join Waitlist", "Get Early Access"

7. SEO (Meta tags):
   - Title: 50-60 characters with main keyword
   - Description: 140-160 characters with benefit + action

TONE: ${
    targetMarket === "b2b"
      ? "Professional but approachable. Confident and data-driven."
      : "Friendly and energetic. Conversational and exciting."
  }

CRITICAL: Return ONLY valid JSON. No markdown, no explanations, just the JSON object.

JSON FORMAT:
{
  "headline": "...",
  "subheadline": "...",
  "problemStatement": "...",
  "solutionStatement": "...",
  "features": [
    {"title": "...", "description": "...", "icon": "⚡"},
    {"title": "...", "description": "...", "icon": "🚀"},
    {"title": "...", "description": "...", "icon": "💎"}
  ],
  "ctaText": "...",
  "metaTitle": "...",
  "metaDescription": "..."
}`;
}

// FIXED: Main Generation Function with better error handling
export async function generateLandingPageContent(
  blueprint: string,
  startupTitle: string,
  targetMarket: "b2b" | "b2c" = "b2b"
): Promise<LandingPageContent> {
  try {
    const model = genAI.getGenerativeModel({ model: AI_MODELS.FAST });
    const prompt = getLandingPagePrompt(blueprint, targetMarket, startupTitle);
    const result = await model.generateContent(prompt);
    const text = await result.response.text();

    let jsonString = "";
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      jsonString = codeBlockMatch[1];
    } else {
      const fallbackMatch = text.match(/\{[\s\S]*\}/);
      if (fallbackMatch) {
        jsonString = fallbackMatch[0];
      }
    }

    if (!jsonString)
      throw new Error("No valid JSON object found in AI response.");

    const content: LandingPageContent = JSON.parse(jsonString);

    if (
      !content.headline ||
      !content.features ||
      content.features.length !== 3
    ) {
      throw new Error("Invalid content structure from AI");
    }

    // THIS IS THE FIX: We are now returning ALL fields from the parsed content.
    return content;
  } catch (error) {
    console.error("❌ Generation error:", error);
    console.log("⚠️ Using fallback content generation...");
    return generateFallbackContent(startupTitle, blueprint);
  }
}

// IMPROVED: Fallback with better content
function generateFallbackContent(
  startupTitle: string,
  blueprint: string
): LandingPageContent {
  // Extract some info from blueprint
  const lines = blueprint.split("\n").filter((l) => l.trim().length > 20);
  const firstMeaningfulLine = lines[0] || startupTitle;

  return {
    headline: `${startupTitle}: Turn Your Vision Into Reality`,
    subheadline:
      "The fastest way to validate your startup idea and launch in days, not months",
    problemStatement:
      "Starting a business is overwhelming. You need validation, customers, and a clear path forward—but you don't know where to start.",
    solutionStatement:
      "Our platform provides a proven framework to validate your idea in 72 hours, build your MVP, and launch with confidence.",
    features: [
      {
        title: "72-Hour Validation",
        description:
          "Get real customer feedback fast with our proven validation framework. Know if your idea is worth building before you waste time and money.",
        icon: "⚡",
      },
      {
        title: "AI-Powered Guidance",
        description:
          "Get expert insights and recommendations at every step. It's like having a startup accelerator in your pocket, available 24/7.",
        icon: "🎯",
      },
      {
        title: "Launch-Ready Tools",
        description:
          "Everything you need to go from idea to launched product in days. No technical skills required—just your vision and determination.",
        icon: "🚀",
      },
    ],
    ctaText: "Start Free Trial",
    metaTitle: `${startupTitle} - Validate & Launch Your Startup Fast`,
    metaDescription:
      "Turn your startup idea into reality in 72 hours. Validate, build, and launch with our proven framework. Join successful founders today.",
  };
}

export function generateSlug(title: string): string {
  if (!title) return "";

  const lower = title.toLowerCase();

  // Replace spaces, underscores, colons, and commas with a hyphen
  const withHyphens = lower.replace(/[\s_:,]+/g, "-");

  // Remove any character that is not a letter, number, or hyphen
  const sanitized = withHyphens.replace(/[^a-z0-9-]/g, "");

  // Replace multiple hyphens in a row with a single one
  const singleHyphens = sanitized.replace(/-+/g, "-");

  // Remove any leading or trailing hyphens
  const trimmed = singleHyphens.replace(/^-|-$/g, "");

  // Limit the length for cleanliness
  return trimmed.substring(0, 75);
}

// Check if slug is available
export async function isSlugAvailable(
  slug: string,
  prisma: any
): Promise<boolean> {
  const existing = await prisma.landingPage.findUnique({
    where: { slug },
  });
  return !existing;
}

// Generate unique slug with counter if needed
export async function generateUniqueSlug(
  baseSlug: string,
  prisma: any
): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (!(await isSlugAvailable(slug, prisma))) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}
