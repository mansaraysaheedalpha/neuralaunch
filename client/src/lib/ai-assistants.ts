// lib/ai-assistants.ts
// AI Task Assistant System - Specialized AI for each task type

import { GoogleGenerativeAI } from "@google/generative-ai";
import { AssistantType } from "@prisma/client";
import { AI_MODELS } from "./models";

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
);

export interface AssistantContext {
  startupIdea: string;
  startupName?: string;
  targetMarket?: string;
  problemStatement?: string;
  solutionStatement?: string;
  features?: Array<{
    title: string;
    description: string;
  }>;
}

export interface AssistantResponse {
  content: string;
  metadata: {
    generatedAt: Date;
    tokenCount: number;
    assistantType: string;
  };
}

/**
 * Main function: Run AI assistant for a task
 */
export async function runTaskAssistant(
  assistantType: AssistantType,
  context: AssistantContext,
  userInput?: string
): Promise<AssistantResponse> {
  console.log(`🤖 Running ${assistantType} assistant...`);

  const systemPrompt = getAssistantSystemPrompt(assistantType, context);
  const userPrompt = userInput || getDefaultUserPrompt(assistantType);

  try {
    const model = genAI.getGenerativeModel({
      model: AI_MODELS.PRIMARY,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 4096,
      },
    });

    const result = await model.generateContent(userPrompt);
    const content = await result.response.text();

    console.log(`✅ ${assistantType} generated ${content.length} characters`);

    return {
      content,
      metadata: {
        generatedAt: new Date(),
        tokenCount: content.length / 4,
        assistantType,
      },
    };
  } catch (error) {
    console.error(`❌ ${assistantType} error:`, error);
    throw new Error(`Failed to run ${assistantType} assistant: ${error}`);
  }
}

/**
 * Get system prompt for specific assistant type
 */
function getAssistantSystemPrompt(
  assistantType: AssistantType,
  context: AssistantContext
): string {
  const baseContext = buildContextString(context);

  switch (assistantType) {
    case "CUSTOMER_PROFILE":
      return getCustomerProfilePrompt(baseContext, context);
    case "OUTREACH_EMAIL":
      return getOutreachEmailPrompt(baseContext, context);
    case "LINKEDIN_MESSAGE":
      return getLinkedInMessagePrompt(baseContext, context);
    case "INTERVIEW_QUESTIONS":
      return getInterviewQuestionsPrompt(baseContext, context);
    case "COMPETITIVE_ANALYSIS":
      return getCompetitiveAnalysisPrompt(baseContext, context);
    case "PRICING_STRATEGY":
      return getPricingStrategyPrompt(baseContext, context);
    case "GENERAL":
      return getGeneralAssistantPrompt(baseContext, context);
    default:
      return getGeneralAssistantPrompt(baseContext, context);
  }
}

/**
 * Build context string from startup data
 */
function buildContextString(context: AssistantContext): string {
  return `
**STARTUP CONTEXT:**

Idea: ${context.startupIdea}
${context.startupName ? `Name: ${context.startupName}` : ""}
${context.targetMarket ? `Target Market: ${context.targetMarket}` : ""}
${context.problemStatement ? `Problem: ${context.problemStatement}` : ""}
${context.solutionStatement ? `Solution: ${context.solutionStatement}` : ""}
${context.features ? `\nKey Features:\n${context.features.map((f) => `- ${f.title}: ${f.description}`).join("\n")}` : ""}
`;
}

/**
 * CUSTOMER PROFILE GENERATOR - FIXED
 */
function getCustomerProfilePrompt(
  baseContext: string,
  context: AssistantContext
): string {
  return `${baseContext}

You are a customer research expert. Generate 50 detailed, realistic target customer profiles NOW.

CRITICAL: Do NOT provide instructions, templates, or frameworks. Generate the ACTUAL 50 PROFILES immediately.

Format each profile EXACTLY like this:

---

**Profile #1: Sarah Chen**

**Role:** VP of Marketing at Series B B2B SaaS, 80 employees, $10M ARR
**Company:** Cloud security software for mid-market companies
**Industry:** Cybersecurity SaaS
**Experience:** 8 years in B2B marketing, 3 years in current role

**Daily Pain Points:**
- Spends 10+ hours/week manually pulling data from 6 different tools to create board reports
- Can't prove marketing ROI because attribution is broken across multiple platforms
- Wastes $5K/month on tools that don't integrate with each other

**Current Workarounds:**
- Uses Zapier + Google Sheets + manual data entry to combine metrics
- Pays contractor $2K/month to create weekly dashboards
- Still misses 30% of the customer journey due to data gaps

**Where to Find Them:**
- LinkedIn: "B2B SaaS Marketing Leaders" group, "SaaStr Community"
- Reddit: r/SaaS, r/marketing, r/B2BMarketing
- Slack: "Online Geniuses", "SaaS Growth Hacks"
- Events: SaaStr Annual, B2B Marketing Exchange

**Information Diet:**
- Reads: Lenny's Newsletter, Marketing Against the Grain blog
- Listens to: Marketing Against the Grain podcast, Everyone Hates Marketers
- Follows: @lennysan, @dgerhardt on Twitter

**Buying Behavior:**
- Budget: $1,000-3,000/month
- Decision authority: Can approve <$5K/month, needs VP approval for more
- Decision timeline: 4-6 weeks for new tools
- Pain urgency: 9/10 (board is demanding better metrics)

---

**Profile #2: [Next actual profile with completely different details]**

[Continue this exact format for ALL 50 profiles. Make each one unique and specific.]

START GENERATING NOW. No explanations - JUST 50 COMPLETE PROFILES.`;
}

/**
 * OUTREACH EMAIL WRITER - FIXED
 */
function getOutreachEmailPrompt(
  baseContext: string,
  context: AssistantContext
): string {
  return `${baseContext}

You are an expert cold email copywriter. Generate 5 complete, ready-to-send email templates NOW.

CRITICAL: Do NOT give instructions or advice. Generate ACTUAL EMAILS ready to copy-paste and send.

---

**Template #1: The Margin Squeeze**

**Best For:** Operations leaders worried about costs

**Subject:** {{Company}} costs

**Email Body:**
Hi {{FirstName}},

{{Company}} is growing fast (congrats on the Series B).

Most ops teams see 15-20% cost savings when they consolidate [relevant tools]. Worth 15 mins to see if that applies to you?

Best,
{{YourName}}

**Why This Works:** Leads with their win, then immediate tangible benefit

**Expected Response Rate:** 30%+

---

**Template #2: The Neighbor's Results**

**Best For:** When you have a local case study

**Subject:** {{CompetitorName}} / {{Company}}

**Email Body:**
{{FirstName}},

Saw {{CompetitorName}} just hit their Q4 goals early.

They mentioned using [your solution] to [specific result]. Given you're in the same market, thought you'd want to compare notes?

15 mins next week?

{{YourName}}

**Why This Works:** Social proof from direct competitor creates FOMO

**Expected Response Rate:** 40%+

---

**Template #3: The Data Insight**

**Best For:** Data-driven decision makers

**Subject:** question about {{Company}}'s {{metric}}

**Email Body:**
Hi {{FirstName}},

Recent data shows [specific insight relevant to their industry].

Most {{JobTitle}}s are surprised by this. Curious if you're seeing the same trend at {{Company}}?

Worth a quick chat?

Best,
{{YourName}}

**Why This Works:** Shares value first, creates curiosity

**Expected Response Rate:** 25-30%

---

**Template #4: The Time Saver**

**Best For:** Busy executives

**Subject:** {{Company}}'s {{process}}

**Email Body:**
{{FirstName}},

Most {{JobTitle}}s spend ~8 hours/week on [tedious task].

{{CaseStudyCompany}} cut that to 15 minutes. Worth learning how?

{{YourName}}

**Why This Works:** Quantified time savings hits busy people's pain point

**Expected Response Rate:** 25%+

---

**Template #5: The Hiring Signal**

**Best For:** Fast-growing companies

**Subject:** saw your post about {{JobRole}}

**Email Body:**
Hi {{FirstName}},

Congrats on hiring for 3 {{JobRole}}s.

Fast growth usually means [pain point]. How are you handling that at {{Company}}?

Open to a quick chat?

Best,
{{YourName}}

**Why This Works:** Hiring signals growth and implied pain points

**Expected Response Rate:** 30%+

---

These are COMPLETE, READY-TO-SEND templates. Use them now.`;
}

/**
 * LINKEDIN MESSAGE WRITER - FIXED
 */
function getLinkedInMessagePrompt(
  baseContext: string,
  context: AssistantContext
): string {
  return `${baseContext}

You are a LinkedIn outreach expert. Generate 10 actual, ready-to-send messages NOW.

CRITICAL: Generate ACTUAL MESSAGES ready to copy-paste. No templates or instructions.

---

**CONNECTION REQUEST #1:**
{{FirstName}} - your post on [topic] resonated. We're both focused on [shared interest]. Would value connecting to learn from your experience.

**When to use:** When they posted something relevant recently

---

**CONNECTION REQUEST #2:**
Hi {{FirstName}}, noticed we're both in the [industry] space. Your work at {{Company}} is impressive. Would like to connect and potentially collaborate.

**When to use:** For peers in same industry

---

**CONNECTION REQUEST #3:**
{{FirstName}} - saw you're hiring for {{JobTitle}}. Congrats on the growth! Would love to connect and hear about what you're building.

**When to use:** When they're hiring (signals growth/pain)

---

**CONNECTION REQUEST #4:**
Hi {{FirstName}}, we have {{MutualConnection}} in common and both work in [industry]. Happy to connect!

**When to use:** When you have mutual connections

---

**CONNECTION REQUEST #5:**
{{FirstName}} - your article on [topic] was spot-on. Would love to connect and potentially share some related insights I've gathered.

**When to use:** When they published content

---

**FOLLOW-UP #1 (After Connection Accept):**
Thanks for connecting, {{FirstName}}! Saw you're at {{Company}}. Quick question: how are you handling [pain point] as you scale? We're seeing [trend] across the industry and curious about your approach.

**When to use:** First message after they accept

---

**FOLLOW-UP #2 (Value-First):**
{{FirstName}} - thought you'd find this interesting: [share specific insight/resource relevant to their role]. Would love to hear your take on it.

**When to use:** Build rapport before asking for anything

---

**FOLLOW-UP #3 (Direct Ask):**
{{FirstName}} - I'm helping [similar companies] solve [problem]. Given your role at {{Company}}, would you be open to a quick 15-min chat to compare notes?

**When to use:** After building some rapport

---

**RE-ENGAGEMENT #1 (No Response):**
{{FirstName}} - just saw [recent news about their company]. Curious how this impacts your [relevant area]. Worth a quick chat?

**When to use:** If first message got no response

---

**RE-ENGAGEMENT #2 (Value Share):**
{{FirstName}} - sharing this because it's directly relevant to {{Company}}: [insight/article/data]. Let me know if you want to discuss the implications for your team.

**When to use:** Provide value, don't ask for anything

---

These are REAL, COPY-PASTE-READY messages. Use them now.`;
}

/**
 * INTERVIEW QUESTIONS GENERATOR - FIXED
 */
function getInterviewQuestionsPrompt(
  baseContext: string,
  context: AssistantContext
): string {
  return `${baseContext}

You are a customer development expert. Generate 20 actual interview questions NOW.

CRITICAL: Generate ACTUAL QUESTIONS ready to use in interviews. No frameworks or explanations.

---

## CURRENT SITUATION QUESTIONS (1-5)

**Q1: Walk me through a typical day in your role. What are the 3-4 things you spend most time on?**

**What you're learning:** Priorities, time allocation, where bottlenecks exist

**Follow-ups:**
- "Which of those feels most frustrating?"
- "What would you eliminate if you could?"

**Listen for:**
🚩 RED FLAG: They describe ideal day, not reality
✅ GREEN FLAG: They immediately mention specific frustrations

---

**Q2: What tools and processes do you use to [relevant task]? Walk me through exactly how that works.**

**What you're learning:** Current solution stack, integration pain, workarounds

**Follow-ups:**
- "What works well about that setup?"
- "What drives you crazy about it?"

**Listen for:**
🚩 RED FLAG: They love their current tools
✅ GREEN FLAG: They describe duct-tape solutions

---

**Q3: Tell me about the last time you tried to [relevant task]. What actually happened?**

**What you're learning:** Specific pain points, frequency, emotional response

**Follow-ups:**
- "How did that make you feel?"
- "What did you do next?"

**Listen for:**
🚩 RED FLAG: Can't remember specific instance
✅ GREEN FLAG: Gets animated, shares frustration

---

**Q4: If you could wave a magic wand and change one thing about how you [relevant process], what would it be?**

**What you're learning:** Biggest pain point, ideal solution

**Follow-ups:**
- "Why that specifically?"
- "What have you tried to fix it?"

**Listen for:**
🚩 RED FLAG: Vague "make it easier"
✅ GREEN FLAG: Specific, detailed wish

---

**Q5: How do you currently measure success in [relevant area]? What metrics matter most to you?**

**What you're learning:** What they actually care about, not what they say

**Follow-ups:**
- "How often do you check that?"
- "What happens when it's not good?"

**Listen for:**
🚩 RED FLAG: Metrics they don't actually track
✅ GREEN FLAG: Metrics they obsess over daily

---

## PAIN POINTS QUESTIONS (6-10)

**Q6: What's the most frustrating part of [relevant process] right now?**

**Follow-ups:** "How often does that happen?" "What's the cost when it happens?"

---

**Q7: Tell me about a time when [problem] caused a major issue. What happened?**

**Follow-ups:** "How much time did you lose?" "What was the business impact?"

---

**Q8: If you had to rank your top 3 problems at work, where would [problem] fall?**

**Follow-ups:** "Why is [#1] more important?" "What makes [problem] so painful?"

---

**Q9: How much time do you spend on [manual workaround] per week?**

**Follow-ups:** "What else could you do with that time?" "Have you tried to automate it?"

---

**Q10: What happens when [problem] occurs and you can't solve it quickly?**

**Follow-ups:** "Who does that impact?" "What's at stake?"

---

## WORKAROUNDS & SOLUTIONS (11-15)

**Q11: What have you tried to solve [problem] in the past?**

**Follow-ups:** "Why didn't that work?" "What would make you try again?"

---

**Q12: Are you currently using any tools to address [problem]? How's that going?**

**Follow-ups:** "What do you like/dislike about it?" "What's missing?"

---

**Q13: If you stopped [current workaround] tomorrow, what would break?**

**Follow-ups:** "How painful would that be?" "What would you do instead?"

---

**Q14: Have you looked for other solutions to [problem]? What did you find?**

**Follow-ups:** "Why didn't you choose any of them?" "What were you hoping for?"

---

**Q15: What would a perfect solution look like for [problem]?**

**Follow-ups:** "What features are must-haves?" "What's nice-to-have?"

---

## WILLINGNESS TO PAY (16-20)

**Q16: How much does [problem] cost you currently in time and money?**

**Follow-ups:** "If you could quantify it, what would you say?" "Is that acceptable?"

---

**Q17: What would it be worth to solve [problem] completely?**

**Follow-ups:** "Would you pay [price] for that?" "Why or why not?"

---

**Q18: How do you currently budget for [category of solution]?**

**Follow-ups:** "Who approves purchases?" "What's the typical range?"

---

**Q19: If I built exactly what you described, would you be interested in trying it?**

**Follow-ups:** "Would you pay for a pilot?" "What would make you say yes?"

---

**Q20: Who else should I talk to about this problem?**

**Follow-ups:** "Can you introduce me?" "What would they add to this conversation?"

---

These are REAL QUESTIONS. Use them in your next interview.`;
}

/**
 * COMPETITIVE ANALYSIS - FIXED
 */
function getCompetitiveAnalysisPrompt(
  baseContext: string,
  context: AssistantContext
): string {
  return `${baseContext}

You are a competitive intelligence analyst. Generate a complete competitive analysis NOW.

CRITICAL: Generate the ACTUAL ANALYSIS with real competitor names and data. No instructions.

---

# COMPETITIVE ANALYSIS

## 1. COMPETITOR LIST

### DIRECT COMPETITORS (Same Solution)

**Competitor #1: [Real Company Name]**
- URL: [actual URL]
- Target Customer: [specific segment]
- Core Offering: [what they do]
- Pricing: [$ specific tiers]
- Funding: [Series X, $Y raised]
- Strengths: [2-3 specific things]
- Weaknesses: [2-3 specific gaps]

**Competitor #2: [Next Company]**
[Same format]

[Continue for 5 direct competitors]

### INDIRECT COMPETITORS (Different Solution, Same Problem)

**Competitor #6: [Real Company]**
[Same format]

[Continue for 5 indirect competitors]

---

## 2. FEATURE COMPARISON MATRIX

| Feature | Your Solution | Competitor A | Competitor B | Competitor C |
|---------|---------------|--------------|--------------|--------------|
| [Feature 1] | ✅ | ✅ | ❌ | ✅ |
| [Feature 2] | ✅ | ❌ | ✅ | ❌ |
| [Feature 3] | ✅ | ✅ | ✅ | ❌ |
[Continue for 10-15 key features]

---

## 3. POSITIONING ANALYSIS

**What Competitors Do Well:**
1. [Specific strength and why customers choose them]
2. [Another strength]
3. [Another strength]
4. [Another strength]
5. [Another strength]

**What Competitors Do Poorly:**
1. [Specific gap/weakness and customer complaints]
2. [Another weakness]
3. [Another weakness]
4. [Another weakness]
5. [Another weakness]

**Your Opportunity:**
1. [Specific positioning gap you can exploit]
2. [Underserved customer segment]
3. [Feature/capability they're missing]
4. [Better approach to existing problem]
5. [Unique angle or business model]

---

## 4. DIFFERENTIATION STRATEGY

**Primary Differentiator:**
[Your unique angle that no competitor has]

**Target Segment:**
[Specific niche where you'll compete first]

**Positioning Statement:**
[For [target customer], [your product] is the [category] that [unique benefit] unlike [competitors] which [their limitation].]

**Competitive Moat:**
[How you'll defend this advantage long-term]

---

This is REAL analysis with ACTUAL competitors. Use it now.`;
}

/**
 * PRICING STRATEGY - FIXED
 */
function getPricingStrategyPrompt(
  baseContext: string,
  context: AssistantContext
): string {
  return `${baseContext}

You are a pricing strategist. Generate a complete pricing strategy with specific numbers NOW.

CRITICAL: Generate ACTUAL PRICING TIERS with real numbers. No instructions or frameworks.

---

# PRICING STRATEGY

## 1. RECOMMENDED MODEL

**Model Type:** [Usage-based / Seat-based / Tiered / Freemium / Hybrid]

**Value Metric:** Charge per [users / API calls / storage / features / etc.]

**Billing:** Monthly + Annual (15% discount)

**Why This Model:**
[2-3 sentences justifying this choice based on startup context]

---

## 2. PRICING TIERS

### FREE TIER (Optional)
**Price:** $0/month

**Includes:**
- [Specific feature limit]
- [Specific usage limit]
- [Specific support level]

**Target:** Hobbyists, students, testing

**Goal:** Convert 5% to paid within 30 days

---

### STARTER TIER
**Price:** $29/month or $299/year (save $49)

**Includes:**
- [Specific features]
- [Usage limits: X users, Y API calls, etc.]
- Email support
- [Integration limit]

**Target:** Solo founders, small teams (1-3 people)

**Value Prop:** Get started fast at affordable price

---

### PROFESSIONAL TIER ⭐ MOST POPULAR
**Price:** $99/month or $999/year (save $189)

**Includes:**
- Everything in Starter
- [Additional features]
- [Higher limits: X users, Y API calls]
- Priority support
- [More integrations]
- [Advanced feature]

**Target:** Growing startups (5-25 people)

**Value Prop:** Everything teams need to scale

---

### BUSINESS TIER
**Price:** $299/month or $2,999/year (save $589)

**Includes:**
- Everything in Professional
- [Advanced features]
- [Much higher limits]
- Dedicated support
- [Enterprise integrations]
- [Advanced analytics]

**Target:** Established companies (25-100 people)

**Value Prop:** Enterprise features without enterprise complexity

---

### ENTERPRISE TIER
**Price:** Custom (starting at $999/month)

**Includes:**
- Everything in Business
- Unlimited [usage metric]
- Custom integrations
- Dedicated success manager
- SLA guarantees
- On-premise deployment option

**Target:** Large companies (100+ people)

**Sales:** Enterprise sales team, 3-6 month cycle

---

## 3. COMPETITOR PRICING COMPARISON

| Tier | Your Price | Competitor A | Competitor B | Competitor C |
|------|------------|--------------|--------------|--------------|
| Starter | $29/mo | $49/mo | $39/mo | $25/mo |
| Professional | $99/mo | $149/mo | $99/mo | $79/mo |
| Business | $299/mo | $499/mo | $299/mo | $249/mo |

**Positioning:** You're [cheaper/more expensive] than [competitors] but offer [unique value].

---

## 4. PRICING JUSTIFICATION

**Starter ($29/mo):**
- **Cost basis:** Infrastructure costs ~$5/user
- **Value basis:** Saves 5 hours/week = $200+ in time
- **Competitive:** Below market average
- **Psychology:** Under $30 threshold for easy credit card purchase

**Professional ($99/mo):**
- **Cost basis:** Infrastructure + support ~$20/user
- **Value basis:** Saves 15 hours/week + [key benefit] = $800+ value
- **Competitive:** At market average
- **Psychology:** $99 vs $100 psychological pricing

**Business ($299/mo):**
- **Cost basis:** Infrastructure + premium support ~$50/user
- **Value basis:** Full solution replaces $500+ in other tools
- **Competitive:** Below enterprise prices
- **Psychology:** $299 vs $300, clear step up from Pro

---

## 5. UNIT ECONOMICS

**Starter Tier:**
- CAC (organic): $50
- LTV (18 months): $450
- LTV:CAC = 9:1 ✅

**Professional Tier:**
- CAC (content + sales): $200
- LTV (24 months): $2,200
- LTV:CAC = 11:1 ✅

**Business Tier:**
- CAC (sales team): $800
- LTV (36 months): $9,000
- LTV:CAC = 11:1 ✅

---

## 6. IMPLEMENTATION PLAN

**Phase 1 (Launch):**
- Start with Free + Starter + Professional tiers
- Price: $29, $99 as shown above
- 14-day free trial on all paid tiers
- No credit card required for trial

**Phase 2 (After 100 Customers):**
- Add Business tier at $299
- Increase Starter to $39 (grandfather existing)
- Add annual discount (15%)

**Phase 3 (After 500 Customers):**
- Add Enterprise tier (custom pricing)
- Increase Professional to $129
- Introduce usage-based overages

---

This is REAL PRICING with SPECIFIC NUMBERS. Implement it now.`;
}

/**
 * GENERAL ASSISTANT - FIXED
 */
function getGeneralAssistantPrompt(
  baseContext: string,
  taskDescription: string
): string {
  return `${baseContext}
You are a helpful startup execution assistant. Your ONLY job is to complete the following task for the user.

CRITICAL: Do NOT provide instructions, advice, or explanations. Generate the ACTUAL deliverable requested in the task description.

TASK DESCRIPTION: "${taskDescription}"

Begin generating the deliverable for this task NOW.`;
}

/**
 * Get default user prompt if none provided
 */
function getDefaultUserPrompt(assistantType: AssistantType): string {
  switch (assistantType) {
    case "CUSTOMER_PROFILE":
      return "Generate 50 complete customer profiles with specific details, pain points, and where to find them.";
    case "OUTREACH_EMAIL":
      return "Generate 5 complete email templates with subject lines and body text ready to send.";
    case "LINKEDIN_MESSAGE":
      return "Generate 10 actual LinkedIn messages (connection requests, follow-ups, re-engagement) ready to copy-paste.";
    case "INTERVIEW_QUESTIONS":
      return "Generate 20 actual interview questions with follow-ups and what to listen for.";
    case "COMPETITIVE_ANALYSIS":
      return "Generate complete competitive analysis with real competitor names, pricing, and positioning gaps.";
    case "PRICING_STRATEGY":
      return "Generate complete pricing strategy with specific price points, tiers, and justification.";
    default:
      return "Generate the actual deliverable I need based on the startup context.";
  }
}

/**
 * Validate assistant output
 */
export function validateAssistantOutput(
  content: string,
  assistantType: AssistantType
): boolean {
  if (!content || content.length < 100) {
    console.error("❌ Output too short");
    return false;
  }

  // Check if output contains instructional language (BAD)
  const instructionalPhrases = [
    "your task is",
    "here's what you need",
    "follow these steps",
    "complete the following",
    "fill out",
    "template:",
  ];

  for (const phrase of instructionalPhrases) {
    if (content.toLowerCase().includes(phrase)) {
      console.warn(`⚠️ Output contains instructional language: "${phrase}"`);
      // Don't fail validation, but warn
    }
  }

  // Type-specific validation
  switch (assistantType) {
    case "CUSTOMER_PROFILE":
      return (
        content.includes("Profile #") &&
        (content.match(/Profile #/g)?.length || 0) >= 10
      );
    case "OUTREACH_EMAIL":
      return (
        content.includes("Subject:") &&
        (content.match(/Subject:/g)?.length || 0) >= 3
      );
    case "PRICING_STRATEGY":
      return (
        /\$\d+/.test(content) && (content.match(/\$\d+/g)?.length || 0) >= 3
      );
    default:
      return true;
  }
}

/**
 * EXPORT
 */
export default {
  runTaskAssistant,
  validateAssistantOutput,
};
