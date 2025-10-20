// lib/ai-assistants.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { AssistantType } from "@prisma/client";
import { AI_MODELS } from "./models";

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

const modelOrchestration: Record<AssistantType, "GOOGLE" | "OPENAI"> = {
  CUSTOMER_PROFILE: "GOOGLE",
  OUTREACH_EMAIL: "GOOGLE",
  LINKEDIN_MESSAGE: "GOOGLE",
  INTERVIEW_QUESTIONS: "GOOGLE",
  COMPETITIVE_ANALYSIS: "GOOGLE",
  PRICING_STRATEGY: "GOOGLE",
  GENERAL: "GOOGLE",
  CODE_GENERATION: "OPENAI",
};

export async function runTaskAssistant(
  assistantType: AssistantType,
  context: AssistantContext,
  taskDescription?: string
): Promise<{ content: string }> {
  const model = modelOrchestration[assistantType];
  if (model === "OPENAI") {
    return runOpenAIAssistant(assistantType, context, taskDescription);
  }
  return runGoogleAIAssistant(assistantType, context, taskDescription);
}

async function runGoogleAIAssistant(
  assistantType: AssistantType,
  context: AssistantContext,
  taskDescription?: string
): Promise<{ content: string }> {
  console.log(`🤖 Running ${assistantType} assistant with Google...`);
  const systemPrompt = getAssistantSystemPrompt(
    assistantType,
    context,
    taskDescription
  );

  try {
    const model = genAI.getGenerativeModel({
      model: AI_MODELS.PRIMARY,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      },
    });

    const result = model.generateContent("");
    const response = await result;
    const content = response.response.text();
    console.log(`✅ ${assistantType} generated ${content.length} characters`);
    return { content };
  } catch (error) {
    console.error(`❌ ${assistantType} error:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to run ${assistantType} assistant: ${errorMessage}`
    );
  }
}

async function runOpenAIAssistant(
  assistantType: AssistantType,
  context: AssistantContext,
  taskDescription?: string
): Promise<{ content: string }> {
  console.log(`🤖 Running ${assistantType} assistant with OpenAI...`);
  const systemPrompt = getAssistantSystemPrompt(
    assistantType,
    context,
    taskDescription
  );

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
      ],
    });
    const content = response.choices[0].message.content || "";
    console.log(`✅ ${assistantType} generated ${content.length} characters`);
    return { content };
  } catch (error) {
    console.error(`❌ ${assistantType} error:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to run ${assistantType} assistant: ${errorMessage}`
    );
  }
}

function getAssistantSystemPrompt(
  assistantType: AssistantType,
  context: AssistantContext,
  taskDescription?: string
): string {
  const baseContext = buildContextString(context);

  switch (assistantType) {
    case "CUSTOMER_PROFILE":
      return getCustomerProfilePrompt(baseContext);
    case "OUTREACH_EMAIL":
      return getOutreachEmailPrompt(baseContext);
    case "LINKEDIN_MESSAGE":
      return getLinkedInMessagePrompt(baseContext);
    case "INTERVIEW_QUESTIONS":
      return getInterviewQuestionsPrompt(baseContext);
    case "COMPETITIVE_ANALYSIS":
      return getCompetitiveAnalysisPrompt(baseContext);
    case "PRICING_STRATEGY":
      return getPricingStrategyPrompt(baseContext);
    case "CODE_GENERATION":
      return getCodeGenerationPrompt(baseContext, taskDescription);
    case "GENERAL":
      return getGeneralAssistantPrompt(
        taskDescription || "Perform the requested task."
      );
    default:
      return getGeneralAssistantPrompt(
        taskDescription || "Perform the requested task."
      );
  }
}

function getCodeGenerationPrompt(
  baseContext: string,
  taskDescription?: string
): string {
  return `${baseContext}

You are a world-class software engineer. Your task is to generate code based on the user's request.

**USER'S TASK DESCRIPTION:**
"${taskDescription}"

Generate the code for this task NOW. Output in clean, well-structured code with comments where necessary.
`;
}

function getGeneralAssistantPrompt(taskDescription: string): string {
  return `You are a task-completion AI. Your ONLY job is to generate a text-based deliverable that directly completes the following user request. Do NOT be creative, do NOT offer advice, and do NOT generate strategic documents unless explicitly asked. Focus solely on the user's task description.

  **USER'S TASK DESCRIPTION:**
  "${taskDescription}"

  Generate the deliverable for this task NOW. Output in clean, well-structured Markdown.`;
}

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

function getCustomerProfilePrompt(baseContext: string): string {
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

function getOutreachEmailPrompt(baseContext: string): string {
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

{{YourName}}

**Why This Works:** Leads with curiosity and data, not a pitch

**Expected Response Rate:** 35%+

---

**Template #4: The Direct Problem**

**Best For:** When you know their specific pain point

**Subject:** {{Company}}'s {{specific problem}}

**Email Body:**
{{FirstName}},

Most {{JobTitle}}s at {{CompanySize}} companies lose [X hours/dollars] to [specific problem].

We helped [Similar Company] fix this in [timeframe].

Want to compare notes on what worked?

{{YourName}}

**Why This Works:** Specific problem + proof + low-ask CTA

**Expected Response Rate:** 25%+

---

**Template #5: The Mutual Connection**

**Best For:** When you have a shared connection

**Subject:** {{MutualConnection}} suggested I reach out

**Email Body:**
Hi {{FirstName}},

{{MutualConnection}} mentioned you're tackling [specific challenge] at {{Company}}.

We recently helped [Similar Company] with the same issue. Happy to share what worked if helpful.

15 mins to compare notes?

Best,
{{YourName}}

**Why This Works:** Warm intro + specific value + helpful tone

**Expected Response Rate:** 50%+

---

**BONUS: Follow-up Sequence**

**Day 3 Follow-up:**
Subject: Re: [original subject]

{{FirstName}} - following up on my note below. Worth 15 mins?

**Day 7 Follow-up:**
Subject: {{Company}} / quick question

{{FirstName}},

Still curious about [original topic]. If timing isn't right, totally understand - should I follow up in Q2?

**Day 14 "Breakup" Email:**
Subject: last note

{{FirstName}},

Last email from me - clearly not a priority right now.

If things change, you know where to find me. Good luck with {{specific goal}}!

---

These are REAL EMAILS ready to send. Copy, customize, and use them now.`;
}

function getLinkedInMessagePrompt(baseContext: string): string {
  return `${baseContext}

You are a LinkedIn outreach expert. Generate 10 complete LinkedIn messages ready to send NOW.

CRITICAL: Generate ACTUAL MESSAGES to copy-paste, NOT instructions or templates.

---

**Message #1: Connection Request (Short & Relevant)**

Hi {{FirstName}},

Saw your post about [relevant topic]. Would love to connect and learn more about your work at {{Company}}.

Best,
{{YourName}}

**When to Use:** After they post about something relevant to your solution

**Expected Accept Rate:** 60%+

---

**Message #2: Connection Request (Mutual Interest)**

{{FirstName}},

Fellow [industry/interest] person here. Your work on [specific project] caught my eye. Let's connect!

{{YourName}}

**When to Use:** You share a clear common interest or background

**Expected Accept Rate:** 70%+

---

**Message #3: First Message After Connection**

Thanks for connecting, {{FirstName}}!

Curious about your work on [specific thing from their profile]. How's [relevant project/challenge] going at {{Company}}?

**When to Use:** 2-3 days after they accept your connection

**Expected Response Rate:** 40%+

---

**Message #4: Value-First Outreach**

Hi {{FirstName}},

Noticed {{Company}} is hiring for [role]. We helped [Similar Company] solve [related challenge] last quarter.

Would love to share what worked if helpful. Worth a quick chat?

**When to Use:** When you can lead with genuine value

**Expected Response Rate:** 35%+

---

**Message #5: Comment on Their Content**

Great point about [topic from their post], {{FirstName}}.

We've seen similar results at [Your Company]. Would love to hear more about your approach - got 15 mins for a call?

**When to Use:** They post something directly relevant to your solution

**Expected Response Rate:** 45%+

---

**Message #6: Mutual Connection Intro**

Hi {{FirstName}},

{{MutualConnection}} mentioned you're working on [specific challenge]. We just helped [Company] tackle something similar.

Happy to share what worked if useful. Quick call next week?

**When to Use:** You have a strong mutual connection

**Expected Response Rate:** 55%+

---

**Message #7: Re-engagement Message**

{{FirstName}} - following up on my message from [time period].

Still think there's value in connecting about [specific topic]. Worth 15 mins?

**When to Use:** They never responded to your first message (wait 7-10 days)

**Expected Response Rate:** 15%+

---

**Message #8: Industry Event Follow-up**

Hi {{FirstName}},

Great seeing you at [Event]! Your insights on [topic] were spot-on.

Would love to continue the conversation. Coffee next week?

**When to Use:** After meeting at an event (send within 24 hours)

**Expected Response Rate:** 70%+

---

**Message #9: Content Share + Ask**

{{FirstName}},

Thought you'd find this [article/report] relevant given your work on [topic]: [link]

Would love your take on [specific question]. Quick call to discuss?

**When to Use:** You have genuinely valuable content to share

**Expected Response Rate:** 30%+

---

**Message #10: The Direct Ask**

Hi {{FirstName}},

Straight to the point: we help [specific role] at [company size] solve [specific problem].

Worth 15 mins to see if there's fit?

{{YourName}}

**When to Use:** When subtlety hasn't worked, or they're very direct in their style

**Expected Response Rate:** 20%+

---

**PRO TIPS:**

- Messages under 100 characters get 30% more responses
- Questions get 50% more replies than statements
- Mention something specific from their profile (increases response 3x)
- Send between Tuesday-Thursday, 8-10 AM their timezone
- If no response in 7 days, try one more follow-up then move on

---

These are REAL MESSAGES ready to send. Copy and use them now.`;
}

function getInterviewQuestionsPrompt(baseContext: string): string {
  return `${baseContext}

You are a customer research expert. Generate 20 complete interview questions with follow-ups NOW.

CRITICAL: Generate ACTUAL QUESTIONS ready to use, NOT instructions or frameworks.

---

# CUSTOMER DISCOVERY INTERVIEW SCRIPT

**INTRODUCTION (1 minute):**

"Thanks for taking the time, {{Name}}. I'm working on [brief description of your startup idea] and want to make sure I'm actually solving a real problem. This isn't a sales call - I genuinely want to learn about your workflow. Cool if I ask you some questions?"

---

## PART 1: CURRENT SITUATION (5 minutes)

**Question #1:**
"Walk me through a typical {{relevant time period}} at {{Company}}. What does your day-to-day look like?"

**Follow-up:** "What takes up most of your time?"

**What to listen for:** Unprompted mentions of pain points

---

**Question #2:**
"What's the most frustrating part of [relevant process/workflow]?"

**Follow-up:** "Can you give me a specific example from this week?"

**What to listen for:** Emotion, specificity, frequency

---

**Question #3:**
"How are you currently solving [the problem your startup addresses]?"

**Follow-up:** "What do you like/dislike about that solution?"

**What to listen for:** Workarounds, manual processes, dissatisfaction

---

**Question #4:**
"What would happen if you stopped doing [current solution] entirely?"

**Follow-up:** "Have you ever tried stopping? What happened?"

**What to listen for:** How critical the problem actually is

---

**Question #5:**
"How much time do you spend on [relevant task] per {{day/week/month}}?"

**Follow-up:** "How much does that cost in terms of your time or budget?"

**What to listen for:** Quantified pain (hours, dollars)

---

## PART 2: PAST BEHAVIOR (5 minutes)

**Question #6:**
"Tell me about the last time [this problem] caused a major issue."

**Follow-up:** "What was the impact?"

**What to listen for:** Recent, specific stories (not hypotheticals)

---

**Question #7:**
"What tools or solutions have you tried before?"

**Follow-up:** "Why did you stop using them?"

**What to listen for:** What didn't work and why

---

**Question #8:**
"Who else at {{Company}} deals with this problem?"

**Follow-up:** "How do they handle it?"

**What to listen for:** Buying committee, decision makers

---

**Question #9:**
"When was the last time you evaluated a new solution for this?"

**Follow-up:** "What stopped you from buying?"

**What to listen for:** Objections, budget constraints, decision process

---

**Question #10:**
"How much are you currently spending on [related tools/solutions]?"

**Follow-up:** "Who approves that budget?"

**What to listen for:** Budget availability, approval process

---

## PART 3: FUTURE VISION (5 minutes)

**Question #11:**
"If you had a magic wand, what would the perfect solution look like?"

**Follow-up:** "What specific features would it have?"

**What to listen for:** Prioritization of features, must-haves vs nice-to-haves

---

**Question #12:**
"What's missing from your current solution?"

**Follow-up:** "Which of those gaps is most painful?"

**What to listen for:** Feature gaps, competitive advantages

---

**Question #13:**
"If I built [brief description of your solution], would you be interested?"

**Follow-up:** "Why or why not?"

**What to listen for:** Genuine interest vs politeness

---

**Question #14:**
"What would make this worth paying for?"

**Follow-up:** "How much would you expect to pay?"

**What to listen for:** Willingness to pay, price sensitivity

---

**Question #15:**
"Who would need to approve a purchase like this at {{Company}}?"

**Follow-up:** "What's the typical approval process?"

**What to listen for:** Decision makers, budget authority

---

## PART 4: VALIDATION (3 minutes)

**Question #16:**
"If I built this and it worked, how would you measure success?"

**Follow-up:** "What metrics would prove it's working?"

**What to listen for:** Success criteria, KPIs

---

**Question #17:**
"What would stop you from switching to a new solution?"

**Follow-up:** "What are your biggest concerns about change?"

**What to listen for:** Objections, switching costs

---

**Question #18:**
"If I launched in [timeframe], would you be willing to try it?"

**Follow-up:** "Would you pay for it, or would it need to be free first?"

**What to listen for:** Early adopter signals, pricing validation

---

**Question #19:**
"Who else should I talk to about this problem?"

**Follow-up:** "Could you intro me?"

**What to listen for:** Referrals, network access

---

**Question #20:**
"Is there anything I didn't ask that I should have?"

**Follow-up:** "What am I missing about this problem?"

**What to listen for:** Blind spots, unexpected insights

---

## CLOSING (1 minute)

"This was super helpful, {{Name}}. Mind if I follow up as I build this out? I'd love to show you what I come up with."

**If they're excited:** "Would you be interested in early access?"

---

**SCORING THE INTERVIEW:**

🟢 **STRONG SIGNAL (They're a real customer):**
- Problem happens weekly or more
- They've tried 2+ solutions
- They can quantify pain ($$ or hours)
- They're willing to pay
- They gave you referrals

🟡 **MAYBE (Need more validation):**
- Problem exists but infrequent
- They're "interested" but vague
- No clear budget or urgency
- Lots of feature requests

🔴 **WEAK SIGNAL (Not a real customer):**
- Can't remember last time problem happened
- No current solution (probably not a real problem)
- Wouldn't pay for a fix
- Just being polite

---

These are REAL QUESTIONS ready to use in interviews. Print this and use it now.`;
}

function getCompetitiveAnalysisPrompt(baseContext: string): string {
  return `${baseContext}

You are a competitive intelligence analyst. Generate a complete competitive analysis NOW.

CRITICAL: Generate ACTUAL COMPETITIVE ANALYSIS with real competitor names and data, NOT templates or instructions.

---

# COMPETITIVE ANALYSIS

## 1. DIRECT COMPETITORS

### Competitor #1: [Actual Company Name]

**Overview:**
- Founded: [Year]
- Funding: [Amount, stage]
- Employees: ~[Number]
- Revenue: ~[Amount] (estimated)

**Product:**
- Core features: [List]
- Pricing: [Specific tiers and prices]
- Target market: [Specific segment]

**Strengths:**
- [Specific strength with evidence]
- [Specific strength with evidence]

**Weaknesses:**
- [Specific weakness you found]
- [Specific weakness you found]

**Why You'll Win:**
[Specific positioning advantage]

---

### Competitor #2: [Actual Company Name]

**Overview:**
- Founded: [Year]
- Funding: [Amount, stage]
- Employees: ~[Number]
- Revenue: ~[Amount] (estimated)

**Product:**
- Core features: [List]
- Pricing: [Specific tiers and prices]
- Target market: [Specific segment]

**Strengths:**
- [Specific strength with evidence]
- [Specific strength with evidence]

**Weaknesses:**
- [Specific weakness you found]
- [Specific weakness you found]

**Why You'll Win:**
[Specific positioning advantage]

---

### Competitor #3: [Actual Company Name]

[Same format as above]

---

## 2. INDIRECT COMPETITORS (Alternative Solutions)

**Current Workaround #1: [Describe manual process or tool combination]**
- Who uses it: [Specific user type]
- Cost: [Time and money]
- Limitations: [What doesn't work]
- Your advantage: [Why you're better]

**Current Workaround #2:**
[Same format]

**Current Workaround #3:**
[Same format]

---

## 3. FEATURE COMPARISON

| Feature | Your Solution | Competitor #1 | Competitor #2 | Competitor #3 |
|---------|---------------|---------------|---------------|---------------|
| [Feature 1] | ✅ Yes | ✅ Yes | ❌ No | ⚠️ Partial |
| [Feature 2] | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |
| [Feature 3] | ✅ Yes | ⚠️ Partial | ❌ No | ❌ No |
| [Feature 4] | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Partial |
| [Feature 5] | ✅ Yes | ❌ No | ❌ No | ❌ No |

**Your Unique Features:**
- [Feature only you have]
- [Feature only you have]

---

## 4. PRICING COMPARISON

| Tier | Your Price | Comp #1 | Comp #2 | Comp #3 |
|------|------------|---------|---------|---------|
| Free/Trial | [Your offer] | [Their offer] | [Their offer] | [Their offer] |
| Starter | $[X]/mo | $[X]/mo | $[X]/mo | $[X]/mo |
| Professional | $[X]/mo | $[X]/mo | $[X]/mo | $[X]/mo |
| Enterprise | $[X]/mo | $[X]/mo | $[X]/mo | $[X]/mo |

**Positioning:** You're [cheaper/more expensive] but offer [unique value]

---

## 5. MARKETING ANALYSIS

**Competitor #1:**
- Traffic: ~[X] visits/month (SimilarWeb estimate)
- SEO: Ranking for [X] keywords
- Content: [Blog frequency, quality]
- Social: [Follower counts, engagement]
- Paid ads: [Are they running ads? On which platforms?]

**Competitor #2:**
[Same format]

**Competitor #3:**
[Same format]

**Your Opportunity:**
[Where they're weak and you can win]

---

## 6. CUSTOMER REVIEWS (What Real Users Say)

**Competitor #1:**
- G2 Rating: [X]/5 ([X] reviews)
- Common complaints: "[Quote actual reviews]"
- What they love: "[Quote actual reviews]"

**Competitor #2:**
[Same format]

**Competitor #3:**
[Same format]

**Your Advantage:**
You'll solve [specific complaint] that all competitors struggle with

---

## 7. POSITIONING GAPS (Where You Can Win)

**Gap #1: [Specific unmet need]**
- Evidence: [Customer reviews, forum posts, etc.]
- Market size: [How many people have this need]
- Your solution: [How you'll fill it]

**Gap #2: [Specific unmet need]**
[Same format]

**Gap #3: [Specific unmet need]**
[Same format]

---

## 8. GO-TO-MARKET STRATEGY

**Where Competitors Are Winning:**
- [Channel/tactic with evidence]
- [Channel/tactic with evidence]

**Where They're Weak:**
- [Untapped channel/segment]
- [Untapped channel/segment]

**Your Initial Focus:**
[Specific channel/segment to own first]

**Why This Will Work:**
[Evidence-based reasoning]

---

## 9. COMPETITIVE MOATS

**What Competitors Have Built:**
- Network effects: [Who has them, how strong]
- Data moats: [Who has proprietary data]
- Brand: [Who has strong brand recognition]
- Distribution: [Who has distribution advantages]

**Your Moat Strategy:**
- Year 1: [What you'll build]
- Year 2: [What you'll build]
- Year 3: [Defensible advantage]

**Competitive Moat:**
[How you'll defend this advantage long-term]

---

This is REAL analysis with ACTUAL competitors. Use it now.`;
}

function getPricingStrategyPrompt(baseContext: string): string {
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

export function validateAssistantOutput(
  content: string,
  assistantType: AssistantType
): boolean {
  if (!content || content.length < 100) {
    console.error("❌ Output too short");
    return false;
  }

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
    }
  }

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

const aiAssistants = {
  runTaskAssistant,
  validateAssistantOutput,
};

export default aiAssistants;
