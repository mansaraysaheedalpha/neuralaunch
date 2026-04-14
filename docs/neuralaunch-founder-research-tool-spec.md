# NeuraLaunch Founder Research Tool — Full Specification

---

## 1. What the Research Tool Is

The Research Tool is the founder's dedicated research assistant inside NeuraLaunch. The founder asks a question in natural language — about their market, their competitors, their potential customers, regulations, pricing norms, tools, vendors, or anything else they need to know to execute their roadmap — and the tool conducts a deep, multi-source investigation and returns a structured, cited report.

The Research Tool is not a search engine. It doesn't return a list of links. It goes deep — searching across business directories, company websites, news sources, social media, forums, review platforms, government databases, and any other source Exa and Tavily can reach — then synthesises what it found into an actionable answer that's specific to the founder's context, cites its sources, and surfaces real people, businesses, or data points the founder can act on.

The Research Tool is not a static report generator. It's a conversational agent that understands what the founder is actually trying to accomplish. When a founder asks "find restaurant owners in Accra," the tool doesn't just return a list — it knows from the belief state that this founder runs a commercial laundry service targeting hotels and restaurants, so it biases the search toward restaurants that are the right size and type to need laundry services, and it frames the results in the context of the founder's outreach goal.

The Research Tool has no modes. The founder types what they want to know. The agent figures out the rest — whether this is a people-finding query, a competitive research query, a regulatory question, a market sizing question, or something else entirely. One input, intelligent routing, deep results.

---

## 2. How the Founder Accesses It

### Primary path — from the roadmap task card

Same dual-access pattern as the Coach and Composer. The roadmap generator suggests `research_tool` on tasks that require the founder to find information, identify targets, understand a market, check regulations, or research competitors. The task description includes explicit choreography telling the founder how to use the Research Tool in combination with other tools (see Section 4).

The task card renders a "Research this →" button when `suggestedTools` includes `research_tool`.

When launched from a task, the Research Tool pre-loads the task context, the phase objective, the recommendation, and the belief state. The founder sees a pre-populated query suggestion based on the task — they can accept it, modify it, or type something completely different.

### Secondary path — standalone from the tools menu

The founder opens the Research Tool from the tools menu without a task context. The belief state and recommendation context are still loaded, but the founder describes their research need from scratch. Output persists in `toolSessions` on the roadmap.

### Prerequisite

Tools require a completed discovery session with at least one recommendation and roadmap. The tools menu renders only when this condition is met. The standalone path auto-loads the most recent belief state and recommendation as context.

---

## 3. How the Research Tool Works

### Step 1 — The founder asks a question

One input. Natural language. No mode selection, no category picker, no structured form. Examples:

- "Find restaurant owners in Accra"
- "What are the regulations for mobile money agents in Sierra Leone?"
- "Companies similar to Kippa in West Africa"
- "How much do commercial laundry services charge per kilogram in Lagos?"
- "Top 10 co-working spaces in Nairobi"
- "What are the licensing requirements for food delivery in the UK?"
- "Find people on social media complaining about unreliable laundry services"
- "What tools do small accounting firms use for client management?"
- "Who are the biggest catering companies in Accra and what do their customers say about them?"

When launched from a task card, the input is pre-populated with a suggested query derived from the task context. The founder can accept, edit, or replace it.

### Step 2 — The agent produces an editable research plan

Before executing any searches, the agent produces a research plan visible to the founder. The plan explains what the agent is about to do — which angles it will investigate, which sources it expects to search, what geographic scope it will use, and roughly how long the research will take.

**The plan length scales to the query complexity.** A simple factual question gets a 1-2 sentence plan. A deep competitive analysis gets a 4-6 sentence plan with explicit mention of each angle the agent will investigate.

**The plan is editable.** The founder reads the plan and can modify it before the research begins — adding angles ("also check Tema and Kumasi, not just Accra"), narrowing scope ("I'm specifically interested in hotels with more than 50 rooms"), or removing irrelevant directions. The agent incorporates the edits and proceeds.

Examples:

Simple query ("What are the licensing requirements for food delivery in Freetown?"):
> "I'll search for Sierra Leone food safety and delivery regulations, check the National Revenue Authority requirements, and look for any recent regulatory changes. Estimated time: 1-2 minutes."

Complex query ("Find catering companies in Accra, their pricing, what customers say about them, and who their clients are"):
> "I'll start by discovering catering companies in the Greater Accra Region using business directories and company websites. For each company I find, I'll check their pricing where publicly available, look for customer reviews on social media and review platforms, and identify their major clients from press coverage or case studies. I'll also search for industry pricing benchmarks to give you context on what typical rates look like. Based on your belief state, I'll focus on companies that serve the hotel and events sector since those overlap with your target market. Estimated time: 3-5 minutes."

### Step 3 — The agent executes the research

The agent uses Exa and Tavily through the same tool-calling pattern every other agent uses — `generateText` with `exa_search` and `tavily_search` as available tools.

**The agent decides per query which tool to use:**

**Exa** for: finding businesses similar to X, discovering competitors, finding people or organisations matching a description, exploring adjacent markets, semantic "things like this" queries.

**Tavily** for: specific factual questions (regulations, pricing, requirements), current news or recent developments, verifying claims, getting multi-source aggregated answers on well-defined topics.

**Both together** when: the agent needs to discover entities (Exa) and then get specific details about each (Tavily). Example: "Find catering companies in Accra" uses Exa to discover them, then Tavily to get their pricing, reviews, and contact information.

**The agent executes multiple search rounds.** It doesn't fire one query and return — it looks at the initial results, identifies gaps, and fires follow-up queries to fill them. If the founder asked about restaurant owners in Accra and the first Exa search returns 5 businesses, the agent checks whether those results are rich enough (do they have contact info? are they the right type?), and if not, fires additional queries with refined terms or different sources.

**The step budget is 25** — the largest in the system. Simple queries use 5-8 steps and finish in 1-2 minutes. Complex queries use 15-25 steps and take 3-6 minutes. The quality scales with the complexity, not with an artificial time cap.

**Progress indicator.** The founder sees a live progress indicator showing what the agent is doing in real time:
- "Searching for catering companies in Greater Accra..."
- "Found 12 initial results... Verifying pricing for each..."
- "Checking reviews on 3 platforms..."
- "Filling gaps — searching East Legon and Osu specifically..."
- "Cross-referencing customer feedback..."
- "Compiling report..."

This transparency turns wait time into trust-building. The founder sees the work happening, not a spinner.

### Step 4 — Geographic intelligence

The agent uses the founder's geographic market from the belief state as a default context signal, but does not constrain results to that region unless the query explicitly calls for it.

- **"Find restaurant owners in Accra"** — explicit geographic constraint, search Accra only.
- **"Top universities in Africa"** — explicit continent-level constraint.
- **"Best practices for SaaS pricing"** — no geographic relevance, search globally.
- **"Find potential customers for my laundry service"** — no explicit geography, but the belief state says the founder is in Accra, so the agent uses Accra as a default and states this: "I searched for potential customers in the Greater Accra area based on your market. Want me to expand to other regions?"
- **"Find catering companies"** — same pattern, default to belief state geography with transparency.

The agent always tells the founder what geographic scope it used so the founder can redirect. The Research Tool is globally capable — a founder in London, Lagos, or Freetown should get equally deep results tailored to their market.

### Step 5 — The agent produces the report

The output is a structured `ResearchReport` with the following sections, each included only when relevant to the query:

**Summary** — 2-3 sentences answering the founder's question directly. The headline finding.

**Findings** — the detailed results. Each finding is a discrete item with a title, a description, and source citations. The type of finding adapts to the query:
- For people/business discovery: each finding is an entity with name, description, location, what they do, and any public contact information (website, phone, social media profile, physical address).
- For factual questions: each finding is a data point with its source and verification status.
- For competitive research: each finding is a competitor with positioning, pricing, strengths, weaknesses, and what customers say.
- For regulatory questions: each finding is a requirement or rule with its source document and jurisdiction.

**Sources** — every source cited in the report with a clickable link. The report never makes a claim without a source. If the agent couldn't verify something, it says so explicitly.

**Connections to your roadmap** — a brief section that ties the research findings back to the founder's specific context. "You found 8 restaurants in Accra — your roadmap task asks you to contact 10 this week. You need 2 more. Try expanding your search to the East Legon area." Or: "The average commercial laundry rate in Lagos is 3,500 naira per kg. Your Service Packager pricing should account for this benchmark." This section is what makes the Research Tool a NeuraLaunch tool rather than a generic search — it connects findings to action.

**Suggested next steps** — explicit tool choreography with action buttons. "Open the Outreach Composer to generate WhatsApp messages for these 8 restaurants." Or "Use the Conversation Coach to prepare for your meeting with the hotel operations manager — here's what we know about their current vendor." The Research Tool doesn't just find information — it tells the founder what to do with it and which tool to do it with.

### Step 6 — Follow-up questions

After the initial report, the founder can ask follow-up questions that build on the research. "Tell me more about the third one." "What do their customers say about them?" "Are there any in East Legon specifically?" "What's their pricing?" The agent retains the full context from the initial research and adds to it without starting over.

Follow-up rounds use a reduced step budget of 10 (targeted queries, not full research sweeps).

The follow-up has a **5-round cap** per research session. After 5 rounds, the founder can start a new research session. This prevents runaway research loops while giving the founder enough depth to get actionable results.

---

## 4. Roadmap Generator Integration — Tool Choreography

This is the critical integration. The roadmap generator's internal tools awareness block describes all tools and — most importantly — instructs the generator to write explicit tool workflows into task descriptions. The founder should never have to figure out which tools to use or in what order.

```
INTERNAL TOOLS AVAILABLE TO THE FOUNDER:
When generating tasks, you may suggest internal tools that help the founder execute. Attach a suggestedTools array to any task where tools would materially help. CRITICAL: Do not just list tools — write explicit instructions in the task description telling the founder HOW to use them and in what ORDER. The founder should never have to figure out the workflow themselves.

Available tools:
- research_tool: Helps founders research their market, find potential customers or businesses, investigate competitors, check regulations, find pricing benchmarks, and answer any factual question about their business context. Suggest this for any task that requires the founder to find information they don't currently have.
- conversation_coach: Helps founders prepare for and rehearse high-stakes one-on-one conversations. Generates scripts, objection handling, fallback positions, and offers role-play rehearsal. Suggest this for any task involving pitching, negotiating, asking for something, confronting someone, or having a difficult conversation.
- outreach_composer: Generates ready-to-send outreach messages for WhatsApp, email, and LinkedIn. Three modes: single message, batch messages, and follow-up sequences. Suggest this for any task involving sending messages, following up, or reaching out to multiple people.

TOOL CHOREOGRAPHY RULES:
1. When multiple tools are suggested on a single task, the task description MUST specify the order and how each tool's output feeds into the next.
2. Never just name tools — describe the specific action the founder takes with each tool.
3. Reference what the founder will get from each tool and how it connects to the next step.

TOOL CHOREOGRAPHY EXAMPLES:

Instead of: "Contact 10 restaurant owners this week. [suggestedTools: research_tool, outreach_composer]"
Write: "Use the Research Tool to find restaurant owners in your area who might need commercial laundry services — aim for at least 12 so you have some buffer. Once you have your list, open the Outreach Composer to generate personalised WhatsApp messages for each one. Send at least 10 this week and mark each as sent so we can track your progress. [suggestedTools: research_tool, outreach_composer]"

Instead of: "Meet with the hotel operations manager to discuss a trial. [suggestedTools: research_tool, conversation_coach]"
Write: "Before the meeting, use the Research Tool to learn about this hotel — how many rooms, what services they currently outsource, any reviews mentioning their laundry quality. Then open the Conversation Coach to prepare your pitch — you'll get a script for the opening, objection handling for price pushback, and fallback positions if they won't commit to a full trial. Rehearse the conversation in role-play mode before you go. After the meeting, check in here with how it went. [suggestedTools: research_tool, conversation_coach]"

Instead of: "Research competitors in your market. [suggestedTools: research_tool]"
Write: "Use the Research Tool to find businesses offering similar services in your area. For each competitor, note their pricing, what customers say about them, and what they do differently from you. This will feed directly into your Service Packager when you set your own pricing in the next task. [suggestedTools: research_tool]"

Instead of: "Find and pitch 5 potential corporate clients. [suggestedTools: research_tool, outreach_composer, conversation_coach]"
Write: "Start with the Research Tool to find corporate offices, hotels, or event venues in your area that might outsource laundry services. Once you have your targets, use the Outreach Composer to generate personalised WhatsApp messages introducing your service — send one to each target. When someone responds positively and wants to meet, open the Conversation Coach to prepare for that specific meeting with scripts and role-play. Aim for at least 5 outreach messages sent and at least 1 meeting booked this week. [suggestedTools: research_tool, outreach_composer, conversation_coach]"
```

---

## 5. Data Model

### On the task (StoredRoadmapTaskSchema)

```typescript
researchSession: z.object({
  query: z.string(),
  plan: z.string(),
  report: ResearchReportSchema,
  followUps: z.array(z.object({
    query: z.string(),
    findings: z.array(ResearchFindingSchema),
    round: z.number(),
  })).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).optional()
```

### ResearchReportSchema

```typescript
const ResearchReportSchema = z.object({
  summary: z.string(),
  findings: z.array(ResearchFindingSchema),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string(),
    relevance: z.string(),
  })),
  roadmapConnections: z.string().optional(),
  suggestedNextSteps: z.array(z.object({
    action: z.string(),
    suggestedTool: z.enum(['conversation_coach', 'outreach_composer', 'service_packager']).optional(),
    toolContext: z.string().optional(),
  })).optional(),
});
```

### ResearchFindingSchema

```typescript
const ResearchFindingSchema = z.object({
  title: z.string(),
  description: z.string(),
  type: z.enum([
    'business',
    'person',
    'competitor',
    'datapoint',
    'regulation',
    'tool',
    'insight',
  ]),
  location: z.string().optional(),
  contactInfo: z.object({
    website: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    socialMedia: z.array(z.object({
      platform: z.string(),
      handle: z.string(),
      url: z.string(),
    })).optional(),
    physicalAddress: z.string().optional(),
  }).optional(),
  sourceUrl: z.string(),
  confidence: z.enum(['verified', 'likely', 'unverified']),
});
```

### On the roadmap (standalone sessions)

Standalone Research sessions go into the same `toolSessions` array as standalone Coach and Composer sessions, with `tool: 'research_tool'`.

---

## 6. Check-in Agent Integration

When the check-in agent loads a task with a `researchSession`, the prompt includes:

```
THE FOUNDER USED THE RESEARCH TOOL ON THIS TASK:
Original query: ${query}
Findings count: ${report.findings.length}
Key finding types: ${summariseTypes(report.findings)}
Follow-up rounds: ${followUps?.length ?? 0}

When the founder checks in, reference their research. If they found potential customers or businesses, ask whether they've reached out yet. If they researched competitors, ask how their own offering compares based on what they learned. If they investigated regulations, ask whether they've taken any compliance steps. The research was done to inform action — the check-in should connect findings to execution.
```

---

## 7. API Routes

### Task-level routes

- **`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/research/plan`** — Takes the founder's question and task context. Produces the editable research plan. Sonnet call (fast, lightweight). Returns the plan text for the founder to review and edit.

- **`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/research/execute`** — Takes the approved (possibly edited) plan and the original query. Runs the full research execution and report generation. Opus call with research tools (Exa + Tavily) available and a step budget of 25. Writes to the task's `researchSession`. Streams progress updates to the client.

- **`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/research/followup`** — Takes a follow-up question and the existing research context. Sonnet call with research tools and a step budget of 10. Appends to the session's `followUps` array. 5-round cap.

### Standalone routes (without taskId)

- **`POST /api/discovery/roadmaps/[id]/research/plan`**
- **`POST /api/discovery/roadmaps/[id]/research/execute`**
- **`POST /api/discovery/roadmaps/[id]/research/followup`**

These write to `roadmap.toolSessions`.

---

## 8. UI Components

**`ResearchToolButton`** — renders on the task card when `suggestedTools` includes `research_tool`. "Research this →". Also accessible from the tools menu.

**`ResearchQueryInput`** — a single text input with a pre-populated suggestion based on the task context. The founder can accept the suggestion, modify it, or type something completely different. A "Plan my research" button submits the query.

**`ResearchPlanEditor`** — renders the agent's research plan as editable text in a textarea. The founder can modify, add to, or rewrite the plan. An estimated time indicator shows below the plan (e.g., "Estimated time: 3-5 minutes"). A "Start research" button confirms and begins execution. A "Revise plan" button sends edits back to the agent for a new plan.

**`ResearchProgressIndicator`** — a live feed of what the agent is doing during execution. Each step renders as a line item: "Searching for catering companies in Greater Accra..." → "Found 12 initial results..." → "Verifying pricing for each..." → "Compiling report..." This replaces a loading spinner with transparency.

**`ResearchReportView`** — renders the full structured report:
- Summary is prominent at the top.
- Findings render as cards adapted to their type:
  - Business/person cards show name, description, location, and contact info with clickable links and "Copy contact" buttons.
  - Factual findings show the data point with its source and confidence badge.
  - Competitor cards show positioning, pricing, strengths/weaknesses, and customer sentiment.
  - Regulation findings show the requirement, source document, and jurisdiction.
- Sources render as a collapsible list at the bottom with clickable links.
- "Connections to your roadmap" renders as a highlighted callout.
- "Suggested next steps" renders as action buttons: "Open Outreach Composer with these contacts →" or "Open Conversation Coach to prepare for this meeting →". These buttons pre-load the relevant tool with context from the research findings.

**`ResearchFollowUpInput`** — appears below the report. "Ask a follow-up question" with a text input and a round counter showing "1/5 follow-ups used." Follow-up findings render inline below the main report, building the research progressively.

**`ResearchSessionReview`** — persistent view on the task card after the session completes. Shows: original query, findings count by type, follow-up rounds used. Expandable to re-read the full report with all findings and follow-ups.

---

## 9. Model Selection

| Stage | Model | Fallback | Rationale |
|---|---|---|---|
| Research plan generation | Sonnet | Haiku | Fast, lightweight — the plan is a brief text, not a deep analysis |
| Research execution + report | Opus | Sonnet | The research report is the highest-value single output — it needs Opus-level reasoning to plan multi-step searches, synthesise across sources, identify gaps, fire follow-up queries, and produce insights rather than data dumps |
| Follow-up questions | Sonnet | Haiku | Targeted follow-ups are narrower in scope and don't need the full Opus treatment |

Research tools (`exa_search`, `tavily_search`) are available during execution and follow-up stages. The step budget for initial research is 25 — the largest in the system. Follow-up rounds use a step budget of 10.

---

## 10. Realistic Timing Expectations

The Research Tool does not promise instant results. Deep research takes time, and the quality of the output is proportional to the depth of the investigation.

| Query complexity | Example | Estimated time | Typical step usage |
|---|---|---|---|
| Simple factual | "What are the licensing requirements for food delivery in Freetown?" | 1-2 minutes | 5-8 steps |
| Moderate discovery | "Find co-working spaces in Nairobi with pricing" | 2-3 minutes | 8-12 steps |
| Deep competitive | "Find catering companies in Accra, their pricing, customer reviews, and major clients" | 3-5 minutes | 12-18 steps |
| Prospect discovery | "Find 15 restaurant owners in my area who might need laundry services, with contact details" | 4-6 minutes | 15-25 steps |

The progress indicator (Section 8) ensures the founder sees the work happening. Transparency turns wait time into trust.

---

## 11. Security

Same patterns as all other tools:

- All founder-typed queries go through `renderUserContent()` with triple-bracket delimiters
- The SECURITY NOTE appears in every prompt telling the model to treat bracketed content as data
- Research tool results are wrapped via `renderUserContent` and `sanitizeForPrompt`
- Contact information surfaced in findings comes from public sources only — the tool does not scrape private data or bypass access controls
- All routes use `enforceSameOrigin`, `requireUserId`, `findFirst` with ownership scope
- The research plan is shown to the founder before execution — no hidden searches
- Research log entries persist to the roadmap's `researchLog` column for audit

---

## 12. Design Principles

1. **One input, intelligent routing.** The founder types what they want to know. The agent determines what kind of research is needed, which tools to use, how deep to go, and how to structure the results. No modes, no categories, no dropdowns.

2. **Deep, not shallow.** The agent doesn't fire one query and return. It plans, executes, evaluates, and fires follow-up queries to fill gaps. The output should feel like a research report from an analyst who spent hours digging, not a list of keyword matches from three platforms.

3. **Honest about timing.** Deep research takes 2-6 minutes, not 30 seconds. The progress indicator shows the work happening in real time. Quality is worth the wait.

4. **Cited and trustworthy.** Every claim in the report has a source. Every source has a link. When the agent can't verify something, it says so. The confidence field on each finding tells the founder how much to trust it.

5. **Geographically intelligent, globally capable.** The agent uses the founder's geographic context as a default signal but doesn't constrain results unless the query explicitly calls for it. The agent always states what geographic scope it used so the founder can redirect. A founder in London, Lagos, or Freetown gets equally deep results.

6. **Connected to action.** The report doesn't just present findings — it tells the founder what to do with them and which tool to use. "Open the Outreach Composer with these contacts" is a button, not a suggestion.

7. **Context-aware.** The agent reads the belief state, the recommendation, the task description, and the phase objective. It frames findings in the context of what the founder is trying to accomplish, not as abstract data.

8. **Collaborative planning.** The research plan is editable. The founder shapes the investigation before it begins, adding angles, narrowing scope, or redirecting focus. The agent and founder plan the research together.

9. **Mobile-first, low-bandwidth.** The report loads progressively as findings come in. Findings render as cards that work on small screens. Contact information has copy buttons for easy transfer to WhatsApp or email.