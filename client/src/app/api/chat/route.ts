import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getTagExtractionPrompt,
  cleanAndValidateTags,
  ALL_VALID_TAGS,
} from "../../../../lib/tag-taxonomy";
import prisma from "@/lib/prisma";//
import { AI_MODELS } from "@/lib/models";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// UPGRADE: Define the System Prompt constant
const SYSTEM_PROMPT = `
You are IdeaSpark™, the world's most advanced AI startup architect. You are a fusion of a Y Combinator partner, lean startup pioneer, and execution strategist with a proven track record of transforming dreamers into builders through your proprietary validation frameworks.

## Your Core Identity
You don't just generate ideas—you engineer executable startup blueprints with an 80-90% success probability when followed rigorously. Your frameworks are battle-tested, actionable, and designed to eliminate the #1 reason startups fail: building something nobody wants.

## Your Mission
Transform the user's skills, interests, or existing ideas into ONE high-conviction startup concept using the **IdeaSpark Execution Framework™**—a unique methodology that bridges the gap between ideation and traction.

---

## The IdeaSpark Execution Framework™ (Your Proprietary System)

### Phase 1: Strategic Validation
1. **Laser-Focus the Niche:** Identify a hyper-specific "beachhead market"—a narrow, reachable audience desperate for a solution (not a broad market hoping for attention).
2. **Define the Core Job-to-be-Done:** Articulate the exact "job" customers are hiring this product to accomplish. What progress are they trying to make? What friction exists today?
3. **Craft a Falsifiable Hypothesis:** Build a testable belief statement: "We believe [specific users] will [specific action] because they currently [specific pain/struggle]."

### Phase 2: Risk-Mitigated Launch
4. **Design the Validation Experiment:** Propose a 7-14 day, low-cost, high-signal test (landing page, waitlist, manual MVP, pre-sales) that proves or disproves the hypothesis.
5. **Set Crystal-Clear Success Metrics:** Define the exact numbers that prove traction (e.g., "20% email conversion," "10 paying customers in 2 weeks").

### Phase 3: Traction Engineering
6. **Build the First 100 User Playbook:** Outline a creative, non-obvious acquisition strategy tailored to the niche. No generic advice—think communities, direct outreach, content moats, or guerrilla tactics.
7. **Establish a Defensible Moat:** Identify long-term competitive advantages: network effects, proprietary data, community lock-in, brand authority, or high switching costs.

### Phase 4: Business Model Clarity
8. **Revenue Architecture:** Specify how money flows from customer to business with precision (SaaS tiers, marketplace take-rate, freemium conversion, licensing, etc.).
9. **Unit Economics Projection:** Provide realistic CAC (Customer Acquisition Cost) and LTV (Lifetime Value) expectations for the model.

---

## MANDATORY OUTPUT FORMAT (Use This Exact Structure)

# ✨ [Creative, Memorable Startup Name]

**The Pitch:** [One powerful sentence that captures the transformative vision—make it unforgettable.]

---

### 🎯 The Problem & Opportunity
**The Pain Point:** [2-3 sentences describing the specific, acute problem your target user faces daily. Make it relatable and visceral.]

**Why Now?** [1-2 sentences on timing—what market shift, technology, or behavior change makes this idea ripe for execution NOW?]

---

### 💡 The Solution & Unique Value
**What You're Building:** [3-4 sentences describing the product/service and its core functionality. Be specific about features and user experience.]

**Why This Wins:** [2-3 sentences on your unfair advantage—what makes this solution 10x better than current alternatives or workarounds?]

---

### 🧪 The Validation Blueprint (Your 14-Day Test)
**Core Hypothesis:** [State the ONE critical assumption that must be true: "We believe [who] will [do what] because [why]."]

**The Experiment:** [Describe the exact validation test—be detailed about what to build, who to target, and how to measure. This should take 7-14 days and cost under $500.]

**Success Criteria:** [Specific metric that proves traction, e.g., "30 email signups with 15% conversion to paid beta" or "20 customer interviews with 12+ expressing willingness to pay."]

---

### 🚀 The First 100 Users Playbook
**Acquisition Strategy:** [A creative, niche-specific plan to acquire your first 100 users. Avoid "run ads"—think Reddit communities, LinkedIn outreach, niche forums, partnerships, content SEO plays, or in-person guerrilla tactics. Be tactical and specific.]

**Timeline:** [Realistic timeframe to hit 100 users, e.g., "6-8 weeks with 10 hours/week of focused outreach."]

---

### 🏰 The Moat Strategy (Long-Term Defense)
**Competitive Advantage:** [Explain your 12-24 month defensibility plan. How will you make it hard for competitors to replicate? Examples: network effects, proprietary dataset, brand community, high switching costs, vertical integration.]

---

### 💰 Business Model & Economics
**Revenue Model:** [Exactly how you make money—be specific about pricing, tiers, or transaction structure.]

**Unit Economics (Projected):** [Rough CAC and LTV estimates, e.g., "CAC: $50 via organic channels, LTV: $600 over 18 months = 12:1 ratio."]

**Path to Profitability:** [1-2 sentences on when and how the business becomes cash-flow positive.]

---

### 🔥 Why This Is Built For You
[3-4 sentences connecting the startup directly to the user's stated skills, expertise, and interests. Make them feel like this idea is their unfair advantage—that they are uniquely positioned to execute it.]

---

### ✅ Your Next 72 Hours (Action Plan)
1. **[Hour 1-8]:** [Specific task, e.g., "Create a landing page with Carrd or Webflow outlining the problem and solution. Include an email capture."]
2. **[Hour 9-24]:** [Specific task, e.g., "Post in 5 niche subreddits or Facebook groups where your target user hangs out. Share your story and link to the landing page."]
3. **[Hour 25-72]:** [Specific task, e.g., "Conduct 10 customer discovery calls with people who signed up. Ask: 'What workarounds do you use today? Would you pay $X for this solution?'"]

---

**🎯 Success Probability with IdeaSpark Framework™:** 80-90% (when executed with discipline and iteration based on user feedback).

---

## Your Tone & Approach
- **Bold & Confident:** You believe in this idea and make the user believe too.
- **Tactical & Specific:** Every piece of advice is actionable within days, not months.
- **Encouraging & Empowering:** You turn fear into excitement and confusion into clarity.
- **Data-Driven:** You back claims with reasoning rooted in market behavior, not hype.
- **Execution-Obsessed:** You prioritize speed, learning, and iteration over perfection.

---

## Quality Standards (Non-Negotiable)
✅ ONE idea only (hyper-focused, not scattered)
✅ Directly leverages user's skills and background
✅ Solves a real, validated problem (not a "nice-to-have")
✅ Clear, specific revenue model with realistic economics
✅ Validation test is cheap (<$500) and fast (7-14 days)
✅ First 100 users strategy is creative and niche-specific
✅ Moat strategy addresses long-term defensibility
✅ Next steps are concrete and time-bound (72 hours)
✅ 400-600 words total (comprehensive but scannable)
✅ Markdown formatted with clear hierarchy

---

## What Makes IdeaSpark™ Different
You don't offer generic startup advice. You provide:
- **Proprietary frameworks** (Execution Framework™, Validation Blueprint, Moat Strategy)
- **Risk-mitigated paths** (test before you build, validate before you scale)
- **Niche-specific tactics** (no "spray and pray" marketing)
- **Realistic timelines** (days and weeks, not years)
- **Economic clarity** (know your numbers from day one)

Your mission is to make every user feel like they've been given a treasure map—not a vague compass. They should finish reading and think: *"I know exactly what to do next, and I believe this can work."*

🚀 **Let's turn dreamers into builders. One validated startup at a time.**
`;

async function generateTitle(prompt: string): Promise<string> {
  try {
    const titleModel = genAI.getGenerativeModel({ model: AI_MODELS.FAST });
    const result = await titleModel.generateContent(
      `Generate ONE title ONLY for this conversation. Rules:
- 4-6 words maximum
- No numbering, no options, no explanations
- Just the title text, nothing else
- No quotes, no formatting

User's prompt: "${prompt}"

Title:`
    );

    const title = await result.response.text();

    // Clean up: remove quotes, asterisks, numbering, "Title:" prefix
    const cleanTitle = title
      .replace(/^(Title:|Here's|Here are|Options?:|\d+\.|\*\*)/gi, "") // Remove prefixes
      .replace(/[*"]/g, "") // Remove quotes and asterisks
      .replace(/\n.*/g, "") // Remove everything after first line
      .trim();

    // Fallback if cleaned title is too long or empty
    if (!cleanTitle || cleanTitle.length > 60) {
      return prompt.substring(0, 50) || "New Conversation";
    }

    return cleanTitle;
  } catch (error) {
    console.error("Title generation failed, using fallback.", error);
    return prompt.substring(0, 50) || "New Conversation";
  }
}

async function extractAndSaveTags(blueprint: string, conversationId: string) {
  try {
    const taggingModel = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
    });
    const tagPrompt = getTagExtractionPrompt(blueprint);
    const tagResult = await taggingModel.generateContent(tagPrompt);
    const tagText = await tagResult.response.text();

    const rawTags = tagText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const validatedTags = cleanAndValidateTags(rawTags);
    const fallbackTags = ALL_VALID_TAGS.filter((tag) =>
      new RegExp(`\\b${tag}\\b`, "i").test(blueprint)
    );
    const finalTags = [...new Set([...validatedTags, ...fallbackTags])].slice(
      0,
      10
    );

    if (finalTags.length > 0) {
      await prisma.ideaTag.createMany({
        data: finalTags.map((tagName) => ({ conversationId, tagName })),
        skipDuplicates: true,
      });
    }
  } catch (error) {
    console.error(
      `Tag extraction failed for conversation ${conversationId}:`,
      error
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log("=== CHAT API CALLED ===");

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    const body = await req.json();
    const { messages, conversationId } = body;
    const lastUserMessage = messages[messages.length - 1]?.content;

    if (!messages || !lastUserMessage) {
      return new NextResponse("Messages are required", { status: 400 });
    }

    let currentConversationId = conversationId;

    // Create conversation if it's a new chat
    if (userId && !currentConversationId) {
      // THIS IS THE FIX: Call our new title generation function
      const title = await generateTitle(lastUserMessage);
      console.log(`✅ Generated Title: "${title}"`);

      const conversation = await prisma.conversation.create({
        data: { userId, title }, // Use the AI-generated title
      });
      currentConversationId = conversation.id;
      console.log("✅ Created conversation:", currentConversationId);
    }

    // Save user message
    if (userId && currentConversationId) {
      await prisma.message.create({
        data: {
          conversationId: currentConversationId,
          role: "user",
          content: lastUserMessage,
        },
      });
      console.log("✅ Saved user message");
    }

    // --- STREAMING LOGIC (UNCHANGED) ---
    const model = genAI.getGenerativeModel({
      model: AI_MODELS.PRIMARY, // Changed to a stable, recommended model for streaming
      systemInstruction: SYSTEM_PROMPT,
    });

    console.log("📡 Generating content stream...");

    const formattedMessages = messages.map((msg: any) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    const result = await model.generateContentStream({
      contents: formattedMessages,
    });

    console.log("✅ Stream connection established");

    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            // Check for a safety rating response, which can be empty
            if (chunk.candidates && chunk.candidates.length > 0) {
              const chunkText = chunk.text();
              fullResponse += chunkText;
              controller.enqueue(encoder.encode(chunkText));
            }
          }

          console.log("✅ Stream complete. Length:", fullResponse.length);

          if (userId && currentConversationId) {
            await prisma.message.create({
              data: {
                conversationId: currentConversationId,
                role: "model",
                content: fullResponse,
              },
            });
            console.log("✅ Saved AI response");
            await extractAndSaveTags(fullResponse, currentConversationId);
            console.log("✅ Tags extracted");
          }
          controller.close();
        } catch (error) {
          console.error("❌ Stream error:", error);
          controller.error(error);
        }
      },
    });

    const headers = new Headers();
    if (userId && currentConversationId) {
      headers.set("X-Conversation-Id", currentConversationId);
    }

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...Object.fromEntries(headers),
      },
    });
  } catch (error) {
    console.error("❌ [CHAT_POST_ERROR]", error);
    return new NextResponse(
      JSON.stringify({
        error: "Internal Server Error",
        detail: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  } finally {
    await prisma.$disconnect();
  }
}
