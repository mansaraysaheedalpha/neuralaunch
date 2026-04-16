# NeuraLaunch Service Packager — Full Specification

---

## 1. What the Service Packager Is

The Service Packager is the tool that answers the question every service-business founder has to answer before anything else matters: "What exactly am I selling, to whom, and for how much?"

41% of NeuraLaunch recommendations are `build_service`. Every one of those founders has a skill — laundry, graphic design, bookkeeping, tutoring, catering, consulting — but they haven't turned that skill into something a customer can say yes to. They don't have a defined offering. They don't have a price. They don't have tiers. They don't have a one-page document they can hand to a prospect that says "here's what I do, here's what it costs, here's what you get."

The Service Packager produces that document. Not a business plan. Not a strategy deck. A single, concrete service brief that the founder can share with a prospect — on WhatsApp, by email, printed on paper — and the prospect can read it and decide. The brief contains: the service name, who it's for, what's included, what's not included, the deliverables, the timeline, and tiered pricing with the reasoning behind each tier.

The Service Packager is the missing link in the Tier 1 tool chain. The Research Tool finds competitors and their pricing. The Service Packager turns that market intelligence into the founder's own offering and price. The Outreach Composer uses the package to write the pitch. The Conversation Coach uses the pricing in rehearsal scripts. Without the Service Packager, the founder knows their market but hasn't defined their product.

---

## 2. How the Founder Accesses It

Same dual-access pattern as all other tools.

### Primary path — from the roadmap task card

The roadmap generator suggests `service_packager` on tasks that involve defining, scoping, or pricing a service offering. The task description includes explicit choreography: "Use the Research Tool to find what competitors charge, then open the Service Packager to define your own offering and pricing based on what you found." The task card renders a "Package your service" button.

When launched from a task card, the Service Packager opens with the full context pre-loaded — belief state, recommendation, task description, phase objective, and any research findings from the Research Tool if it was used earlier on the same roadmap. The founder sees a pre-populated summary of what the tool already knows about their service and their market. No re-explanation needed.

### Secondary path — standalone from the tools menu

The founder opens the Service Packager from the Tools tab without a task context. The belief state and recommendation context load automatically. The founder describes what specific service they want to package. Output persists in `toolSessions`.

### Prerequisite

Same as all tools — requires a completed discovery session with at least one recommendation and roadmap.

---

## 3. The Service Packager Flow

### Step 1 — Context confirmation (0-2 exchanges)

**From a task card:** The tool opens with a pre-populated summary drawn from the belief state, recommendation, and task context:

"Based on your discovery session, you're building a commercial laundry service for 3-star hotels in Greater Accra. Your available budget is low, you're operating solo, and your recommendation focuses on starting with a 2-week trial model to build trust before long-term contracts."

If the Research Tool was used earlier on this roadmap, the summary also includes: "Your research found that competitors charge 35-50 cedis per kg, with most offering same-day or next-day turnaround. Three competitors were identified in the East Legon area."

The founder reads this and either confirms ("That's right, let's go") or adjusts ("Actually I want to focus on guest houses, not hotels" or "I've decided to include ironing as a premium add-on"). Zero to two exchanges — not an interview.

**From standalone:** The tool loads the belief state and asks: "What service do you want to package? Describe what you'd offer and who it's for." One exchange to capture the service context, then proceeds the same way.

### Step 2 — Package generation (single structured output)

The tool generates the complete service package in one Opus call. This is an Opus call because the quality of the positioning, the pricing logic, and the tier differentiation are the entire value proposition — the same reasoning that makes the Coach's preparation package Opus-quality.

The output is a structured `ServicePackage` with seven sections:

**Service name** — a clear, professional name for the offering. Not "laundry service" — something specific and positioned. "PremiumPress — Commercial Laundry for Hotels" or "BrandCraft — Identity Design for Growing Restaurants." The name should feel like something the founder can say out loud to a prospect without embarrassment.

**Target client** — who this service is for, stated in one sentence that the founder can use in outreach. "3-star hotels in Greater Accra with 30-100 rooms that currently outsource laundry to unreliable local vendors." Specific enough to qualify a prospect, clear enough to put in a WhatsApp message.

**What's included** — the concrete deliverables and scope for each tier. Not vague ("laundry services") but specific ("collection 3x per week, wash and press of all bed linens, towels, and staff uniforms, returned within 24 hours, packaged and labeled by room number").

**What's not included** — the explicit boundaries. This prevents scope creep and sets expectations. "Guest personal clothing, dry-clean-only items, and same-day emergency requests (available as add-ons)."

**Tiered pricing** — three tiers: Basic, Standard, Premium. Each tier has a name, a price, and a clear description of what the client gets. The pricing is grounded in:
- The founder's costs (time, materials, transport — inferred from belief state and task context)
- The local market rates (from Research Tool findings if available, or from the agent's knowledge)
- The competitive positioning (where the founder sits relative to competitors — value, mid-market, or premium)
- A target margin

Each tier's price comes with a one-sentence justification the founder can understand: "Standard is priced at 40 cedis/kg because your main competitors charge 35-50 and your 24-hour turnaround guarantee justifies the upper range."

**Revenue scenarios** — three "what if" projections:
- Conservative: "If you close 2 hotels at the Basic tier, your monthly revenue is X"
- Moderate: "If you close 3 hotels at the Standard tier, your monthly revenue is Y"
- Ambitious: "If you close 5 hotels across all tiers, your monthly revenue is Z"

Each scenario also shows: the hours per week required at that volume, whether it fits the founder's available time (from belief state), and when they'd need to hire help.

**One-page service brief** — the final output. A single document that combines the service name, target client description, what's included, what's not, and the tiered pricing into a clean, shareable format. This is what the founder sends to a prospect. It's formatted for the founder's preferred channel — if they primarily communicate via WhatsApp, the brief is structured as a message they can forward. If they need a document to print or email, it's structured as a clean one-pager.

### Step 3 — Refinement (up to 3 adjustment rounds)

After the initial package is generated, the founder can request adjustments. Not regenerations — adjustments. The founder says "make the premium tier include emergency same-day service" or "lower the basic price to 30 cedis because I want to undercut competitors" or "add a fourth tier for chain hotels with 200+ rooms." The tool adjusts the package, recalculates the revenue scenarios, and updates the brief. Three adjustment rounds, each building on the previous version.

The adjustment is a Sonnet call (not Opus) because it's modifying an existing package rather than generating one from scratch. The context from the Opus generation carries forward.

### Step 4 — Output and handoff

The completed service brief has three output actions:

**Copy to clipboard** — formatted for WhatsApp or as plain text. The founder can paste it directly into a conversation.

**Save as brief** — persists on the task or in `toolSessions`. The founder can re-read it anytime, show it to a mentor or partner, or revisit it when they need to adjust pricing.

**Hand off to other tools:**
- "Draft outreach with this package →" opens the Outreach Composer pre-loaded with the service name, target client, and pricing from the package. The Composer generates messages that pitch this specific offering at this specific price.
- "Prepare to pitch this package →" opens the Conversation Coach pre-loaded with the package details. The Coach generates scripts and objection handling around the pricing tiers and the value proposition defined in the package.
- "Research more about this market →" opens the Research Tool pre-loaded with a query about the target client segment and competitive landscape for this specific service.

---

## 4. How Research Findings Feed In

When the Research Tool was used earlier on the same roadmap (or in a standalone session), the Service Packager reads the research findings from the task's `researchSession` or from `toolSessions`. Specifically:

- **Competitor findings** (type: `competitor`) — the agent extracts pricing, positioning, strengths, and weaknesses. These directly inform the pricing calculation and the competitive positioning of each tier.
- **Business findings** (type: `business`) — potential target clients the Research Tool found. These inform the target client description and the revenue scenario calculations (the agent can reference "you found 8 restaurants in your area" when projecting scenarios).
- **Data point findings** (type: `datapoint`) — market rates, industry benchmarks, regulatory requirements. These ground the pricing in verifiable external data.

If no research findings exist, the agent generates the package from its own knowledge of the market (using the Exa and Tavily research tools in its own loop during the Opus call) plus the belief state context. The package is still good — it's just better when the founder has already done targeted research.

---

## 5. Roadmap Generator Integration

The internal tools awareness block in the roadmap generator's prompt gains the Service Packager entry:

```
- service_packager: Helps founders define, scope, and price their service offering. Produces a named service package with tiered pricing, revenue scenarios, and a shareable one-page brief. Suggest this for any task that involves defining what the founder is selling, setting prices, creating service tiers, or producing a document that describes the offering to prospects. Especially relevant for build_service recommendations.
```

Tool choreography examples:

```
Instead of: "Define your service offering and pricing."
Write: "Use the Research Tool to find what competitors in your area charge for similar services. Then open the Service Packager — it will use your research findings to help you define your offering, set competitive pricing across three tiers, and produce a one-page brief you can share with prospects. Once your package is ready, use the Outreach Composer to write messages that pitch your specific offering at your specific price."

Instead of: "Create a pricing structure for your tutoring service."
Write: "Open the Service Packager to turn your tutoring expertise into a concrete offering with tiered pricing. The tool knows your situation from the interview — it will suggest pricing based on your market, your available hours, and what similar tutors charge. After packaging, use the Conversation Coach to rehearse how you'll present your pricing to the first parent who asks 'how much?'"
```

---

## 6. Data Model

### On the task (StoredRoadmapTaskSchema)

```typescript
packagerSession: z.object({
  context: ServiceContextSchema,
  package: ServicePackageSchema,
  adjustments: z.array(z.object({
    request: z.string(),
    round: z.number(),
  })).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).optional()
```

### ServiceContextSchema

```typescript
const ServiceContextSchema = z.object({
  serviceSummary: z.string(),
  targetMarket: z.string(),
  competitorPricing: z.string().optional(),
  founderCosts: z.string().optional(),
  availableHoursPerWeek: z.string().optional(),
  taskContext: z.string().optional(),
  researchFindings: z.string().optional(),
});
```

### ServicePackageSchema

```typescript
const ServicePackageSchema = z.object({
  serviceName: z.string(),
  targetClient: z.string(),
  included: z.array(z.object({
    item: z.string(),
    description: z.string(),
  })),
  notIncluded: z.array(z.string()),
  tiers: z.array(z.object({
    name: z.string(),
    displayName: z.string(),
    price: z.string(),
    period: z.string(),
    description: z.string(),
    features: z.array(z.string()),
    justification: z.string(),
  })),
  revenueScenarios: z.array(z.object({
    label: z.string(),
    clients: z.number(),
    tierMix: z.string(),
    monthlyRevenue: z.string(),
    weeklyHours: z.string(),
    hiringNote: z.string().optional(),
  })),
  brief: z.string(),
  briefFormat: z.enum(['whatsapp', 'document']),
});
```

### On the roadmap (standalone sessions)

Standalone Packager sessions go into the same `toolSessions` array as all other standalone tool sessions, with `tool: 'service_packager'`.

---

## 7. Check-in Agent Integration

When the check-in agent loads a task with a `packagerSession`, the prompt includes:

```
THE FOUNDER USED THE SERVICE PACKAGER ON THIS TASK:
Service name: ${package.serviceName}
Target client: ${package.targetClient}
Number of tiers: ${package.tiers.length}
Pricing range: ${lowestTierPrice} – ${highestTierPrice}
Adjustments made: ${adjustments?.length ?? 0}

When the founder checks in, reference their service package. If they've started pitching, ask which tier prospects are gravitating toward. If they're getting pushback on pricing, reference the justification from the package and ask whether the market data still holds. If they haven't started using the package yet, ask what's holding them back — is the pricing not feeling right, or is the scope unclear, or is it the outreach itself they're avoiding?
```

---

## 8. API Routes

### Task-level routes

- **`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/packager/generate`** — Takes the context (pre-populated from belief state, recommendation, task, and research findings). Generates the full `ServicePackage`. Opus call with research tools available (for market rate verification). Writes to the task's `packagerSession`.

- **`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/packager/adjust`** — Takes an adjustment request and the existing package. Sonnet call. Modifies the package, recalculates revenue scenarios. Appends to `adjustments` array. 3-round cap.

### Standalone routes

- **`POST /api/discovery/roadmaps/[id]/packager/generate`**
- **`POST /api/discovery/roadmaps/[id]/packager/adjust`**

These write to `roadmap.toolSessions`.

---

## 9. UI Components

**`ServicePackagerButton`** — renders on the task card when `suggestedTools` includes `service_packager`. "Package your service →". Also accessible from the tools menu.

**`PackagerContextView`** — renders the pre-populated summary from task context for the founder to confirm or adjust. Shows: what the tool knows about their service, their market, their competitors (from research), and their constraints. "This looks right" button to proceed, or inline text input to adjust.

**`ServicePackageView`** — renders the full generated package:

- **Service name** as a prominent header with the target client as a subtitle.
- **What's included** as a clean list with descriptions.
- **What's not included** as a secondary list.
- **Tiered pricing** as three cards side by side (or stacked on mobile). Each card shows: tier name, price with period, feature list, and the one-sentence justification. The recommended tier (usually Standard) gets a subtle highlight.
- **Revenue scenarios** as three rows: conservative, moderate, ambitious. Each shows clients, monthly revenue, weekly hours, and the hiring note if applicable. The scenario that matches the founder's available time from the belief state gets a highlight.
- **The brief** as a formatted block with a "Copy to clipboard" button. The format adapts: if `briefFormat` is `whatsapp`, it's structured as a clean WhatsApp-length message. If `document`, it's structured as a one-pager.

**`PackagerAdjustInput`** — appears below the package. "Want to adjust anything?" with a text input and a round counter "1/3 adjustments used." The founder types what they want to change and the package updates inline.

**`PackagerHandoffButtons`** — action buttons below the package:
- "Draft outreach with this package →" (opens Composer pre-loaded)
- "Prepare to pitch this →" (opens Coach pre-loaded)
- "Research more about this market →" (opens Research Tool pre-loaded)

**`PackagerSessionReview`** — persistent view on the task card after the session completes. Shows: service name, pricing range across tiers, adjustment count. Expandable to re-read the full package and brief.

---

## 10. Model Selection

| Stage | Model | Fallback | Rationale |
|---|---|---|---|
| Package generation | Opus | Sonnet | The quality of positioning, pricing logic, and tier differentiation is the core value — same reasoning as the Coach's preparation package |
| Adjustments | Sonnet | Haiku | Modifying an existing package is narrower in scope — Sonnet handles targeted edits well |

Research tools (`exa_search`, `tavily_search`) are available during the generation stage so the agent can verify market rates and competitor pricing in real time, even if the founder hasn't used the Research Tool separately.

---

## 11. Security

Same patterns as all other tools:

- All founder-typed text goes through `renderUserContent()` with triple-bracket delimiters
- The SECURITY NOTE appears in every prompt
- Research tool results are wrapped via `renderUserContent` and `sanitizeForPrompt`
- All routes use `enforceSameOrigin`, `requireUserId`, ownership-scoped `findFirst`, `AI_GENERATION` rate limit tier
- The service brief output goes through `clampString` transforms, not `.max()` constraints

---

## 12. Design Principles

1. **Context-first, zero re-explanation.** From a task card, the tool knows the founder's service, market, competitors, and constraints before the founder types a word. It opens with a summary, not a question.

2. **The output is the product.** The one-page service brief is something the founder can hand to a prospect and the prospect can act on. Not a template, not a starting point — a finished document.

3. **Pricing is grounded, not arbitrary.** Every price comes with a justification rooted in market data, competitor positioning, and the founder's cost structure. The founder can explain their pricing because the tool explained it to them.

4. **Revenue scenarios are honest.** The scenarios show what's possible at different volumes, how many hours each scenario requires, and when the founder would need help. No inflated projections, no "if you get 1000 clients" fantasies.

5. **Connected to the tool chain.** The package feeds directly into the Composer (for outreach), the Coach (for pitch preparation), and receives from the Research Tool (for market data). The Service Packager is not standalone — it's the centre of the execution tool chain for `build_service` founders.

6. **Mobile-first, shareable.** The brief format adapts to how the founder communicates. WhatsApp-format briefs are short, structured, and paste-ready. Document-format briefs are clean one-pagers.