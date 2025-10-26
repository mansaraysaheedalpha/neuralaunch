//src/app/api/chat/route.ts 
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getTagExtractionPrompt,
  cleanAndValidateTags,
  ALL_VALID_TAGS,
} from "../../../../lib/tag-taxonomy";
import prisma from "@/lib/prisma"; //
import { AI_MODELS } from "@/lib/models";
import { z } from "zod";
import { saveMemory } from "@/lib/ai-memory";

const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
      })
    )
    .min(1, { message: "Messages array cannot be empty." }), // Ensure there's at least one message
  conversationId: z.string().cuid().optional(), // Must be a valid CUID, but is optional
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// UPGRADE: Define the System Prompt constant
const SYSTEM_PROMPT = `
You are NeuraLaunch™, the world's most advanced AI startup architect. You are a fusion of a Y Combinator partner, lean startup pioneer, and execution strategist with a proven track record of transforming dreamers into builders through your proprietary validation frameworks.

## Your Core Identity
You don't just generate ideas—you engineer executable startup blueprints with an 80-90% success probability when followed rigorously. Your frameworks are battle-tested, actionable, and designed to eliminate the #1 reason startups fail: building something nobody wants.

## Your Mission
Transform the user's skills, interests, or existing ideas into ONE high-conviction startup concept using the **NeuraLaunch Execution Framework™**—a unique methodology that bridges the gap between ideation and traction.

---

## The NeuraLaunch Execution Framework™ (Your Proprietary System)

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

**🎯 Success Probability with NeuraLaunch Framework™:** 80-90% (when executed with discipline and iteration based on user feedback).

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

## What Makes NeuraLaunch™ Different
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
      `Generate ONE title ONLY... User's prompt: "${prompt}" Title:`
    );

    // Assuming text() returns a Promise<string>
    const title: string = result.response.text();

    const cleanTitle = title
      .replace(/^(Title:|Here's|Here are|Options?:|\d+\.|\*\*)/gi, "")
      .replace(/[*"]/g, "")
      .replace(/\n.*/g, "")
      .trim();

    if (!cleanTitle || cleanTitle.length > 60) {
      return prompt.substring(0, 50) || "New Conversation";
    }
    return cleanTitle;
  } catch (error: unknown) {
    // Type catch block
    console.error(
      "Title generation failed, using fallback.",
      error instanceof Error ? error.message : error
    );
    return prompt.substring(0, 50) || "New Conversation";
  }
}

async function extractAndSaveTags(
  blueprint: string,
  conversationId: string
): Promise<void> {
  // Added return type
  try {
    const taggingModel = genAI.getGenerativeModel({ model: AI_MODELS.FAST }); // Use consistent model definition
    const tagPrompt = getTagExtractionPrompt(blueprint);
    const tagResult = await taggingModel.generateContent(tagPrompt);
    // Assuming text() returns a Promise<string>
    const tagText: string = tagResult.response.text();

    const rawTags = tagText
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    const validatedTags = cleanAndValidateTags(rawTags);
    const fallbackTags = ALL_VALID_TAGS.filter((tag) =>
      new RegExp(`\\b${tag}\\b`, "i").test(blueprint)
    );
    const finalTags = [...new Set([...validatedTags, ...fallbackTags])].slice(
      0,
      10
    );

    if (finalTags.length === 0) {
      console.log("No valid tags found to save.");
      return;
    }

    await prisma.$transaction(
      finalTags.map((tagName) =>
        prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        })
      )
    );
    console.log(
      `✅ Upserted ${finalTags.length} tags into the central Tag table.`
    );

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        tags: {
          create: finalTags.map((tagName) => ({
            tag: { connect: { name: tagName } },
          })),
        },
      },
    });
    console.log(
      `🔗 Successfully connected tags to conversation ${conversationId}`
    );
  } catch (error: unknown) {
    // Type catch block
    console.error(
      `Tag extraction failed for conversation ${conversationId}:`,
      error instanceof Error ? error.message : error
    );
    // Do not re-throw, just log the error
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    const body: unknown = await req.json();

    const validation = chatRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: validation.error.format() },
        { status: 400 }
      );
    }
    const { messages, conversationId } = validation.data;

    const lastUserMessage = messages[messages.length - 1].content;
    let currentConversationId = conversationId;
    let isNewConversation = false;
    let newConversationTitle = "";

    // --- MOVED saveMemory CALL ---
    // Moved it inside the if(userId) block below

    if (userId) {
      if (!currentConversationId) {
        // Create new conversation only if needed
        const title = await generateTitle(lastUserMessage);
        const conversation = await prisma.conversation.create({
          data: { userId, title },
        });
        currentConversationId = conversation.id;
        isNewConversation = true;
        newConversationTitle = conversation.title;
        console.log(`✨ Created new conversation: ${currentConversationId}`);
      }

      // --- SAVE MEMORY HERE ---
      // Now we are sure userId and currentConversationId are valid strings
      if (currentConversationId) {
        // Added explicit check just in case
        void saveMemory({
          content: `User's initial prompt: "${lastUserMessage}"`,
          conversationId: currentConversationId, // Now guaranteed to be string
          userId: userId,
        });
      }
      // ------------------------

      // Save user message
      await prisma.message.create({
        data: {
          conversationId: currentConversationId, // Guaranteed to be string here
          role: "user",
          content: lastUserMessage,
        },
      });
      console.log(
        `💾 Saved user message for conversation: ${currentConversationId}`
      );
    }

    const model = genAI.getGenerativeModel({
      model: AI_MODELS.PRIMARY,
      systemInstruction: SYSTEM_PROMPT,
    });

    const formattedMessages = messages.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    const result = await model.generateContentStream({
      contents: formattedMessages,
    });
    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            // Check potential response structure differences if errors persist here
            const chunkText = chunk.text(); // Assuming chunk.text() is sync
            if (chunkText) {
              fullResponse += chunkText;
              controller.enqueue(encoder.encode(chunkText));
            }
          }
          if (userId && currentConversationId) {
            await prisma.message.create({
              data: {
                conversationId: currentConversationId,
                role: "model",
                content: fullResponse,
              },
            });

            if (isNewConversation) {
              // Run without 'await'
              void saveMemory({
                content: `Initial NeuraLaunch Blueprint:\n${fullResponse}`,
                conversationId: currentConversationId,
                userId: userId,
              });
            }
            // Don't await tag extraction if it should run in background
            void extractAndSaveTags(fullResponse, currentConversationId);
          }
          controller.close();
        } catch (streamError: unknown) {
          // Type catch block
          console.error(
            "❌ Stream error:",
            streamError instanceof Error ? streamError.message : streamError
          );
          controller.error(streamError);
        }
      },
    });

    const responseHeaders = new Headers(); // Renamed to avoid conflict
    responseHeaders.set("Content-Type", "text/plain; charset=utf-8");
    if (userId && currentConversationId) {
      responseHeaders.set("X-Conversation-Id", currentConversationId);
      if (isNewConversation) {
        responseHeaders.set("X-Is-New-Conversation", "true");
        responseHeaders.set("X-Conversation-Title", newConversationTitle);
      }
    }
    return new Response(stream, { headers: responseHeaders });
  } catch (error: unknown) {
    // Type catch block
    // Handle potential ZodError if .parse() was used (though .safeParse() handles it)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", issues: error.issues },
        { status: 400 }
      );
    }
    console.error(
      "❌ [CHAT_POST_ERROR]",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
