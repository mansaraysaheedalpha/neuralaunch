# NeuraLaunch — Lifecycle Memory Architecture Specification

---

## 1. What This Is

This specification defines the architecture that makes NeuraLaunch an infinite execution partner — a system that gets smarter the longer a founder uses it. It is not a separate "memory feature." It is the core lifecycle infrastructure that connects every cycle of discovery, recommendation, execution, and continuation into a coherent, evolving understanding of the founder and their journey.

The architecture has three components:
1. **The Founder Profile** — a living document about the person that evolves across every cycle and every venture
2. **The Venture and Cycle model** — the data structure that organises the founder's journey into distinct business directions (ventures) with sequential execution loops (cycles)
3. **The Lifecycle Transition Engine** — the background process that updates the Founder Profile and generates Cycle Summaries at the boundary between cycles

No external memory service, vector database, or RAG pipeline is required. The memory is structured data in PostgreSQL, updated at lifecycle boundaries by lightweight agents, and loaded selectively into prompts based on per-agent loading rules.

---

## 2. The NeuraLaunch Lifecycle

The founder's journey is an infinite loop:

```
Interview → Recommendation → Roadmap → Execute → Continuation Brief → Fork Selection
     ↑                                                                        |
     |________________________________________________________________________|
```

Each loop is a **cycle.** A chain of related cycles is a **venture.** A founder can have multiple ventures (a laundry business and a tutoring platform). Each venture has its own lineage of cycles.

There is no terminal state. The lifecycle continues as long as the founder keeps executing and selecting forks. The system sustains this infinite loop by keeping the memory bounded and the context selective.

### 2.1 Two Ways to Start a New Cycle

**Fork continuation** — the founder completes a roadmap, gets a continuation brief, and picks a fork. The fork becomes a new cycle within the same venture. The system loads the full venture history.

**Fresh start** — the founder starts a completely new discovery interview unrelated to any existing venture. This creates a new venture with its own cycle lineage. The system loads the Founder Profile and behavioural calibration but not the business-specific content from other ventures.

### 2.2 Tier Constraints on Active Ventures

- **Free tier:** No active ventures (recommendation only, no roadmap)
- **Execute tier:** One active venture with one active cycle at a time
- **Compound tier:** Up to three active ventures simultaneously

A venture can be in `active`, `paused`, or `completed` state. An Execute-tier founder who wants to start a fresh venture must pause or complete their current venture first. A Compound-tier founder can have three active ventures running in parallel.

---

## 3. The Three-Layer Memory Architecture

### Layer 1 — Founder Profile (always loaded, always current, small)

A single structured document per user that represents the system's current understanding of who this founder is. It is updated at the end of every cycle and replaces the static belief state as the system's primary context about the person.

The Founder Profile is loaded into every agent call across every tool. It is the minimum context that makes any interaction feel like the system knows the founder. It is always cacheable because it changes only at cycle boundaries.

**Size target:** 500-1000 tokens. Never grows unboundedly.

**Content:**

```
Stable context (changes rarely):
- Name, location, country
- Professional background and skills
- Education and qualifications
- Languages spoken
- Technical ability level

Current situation (updated each cycle):
- Primary focus / active ventures description
- Available hours per week (real, calibrated)
- Financial constraints
- Team composition (solo, has partner, has employees)
- Tools and resources available

Behavioural calibration (inferred from execution data):
- Real speed multiplier (ratio of actual vs estimated execution pace)
- Task avoidance patterns (task types consistently completed last or blocked)
- Tool preferences (which tools the founder gravitates toward)
- Check-in detail level (sparse / moderate / detailed)
- Pushback tendency (accepts quickly / challenges thoroughly)
- Response to nudges (responsive / ignores / delayed)
- Outreach comfort level (avoids / neutral / proactive)
- Strongest execution patterns (what they consistently do well)

Journey overview (high-level only):
- Number of completed ventures
- Number of completed cycles across all ventures
- Total tasks completed lifetime
- Most recent venture name and status
```

The Founder Profile is NOT a log. It is a snapshot. When the laundry business pricing changes from 35 to 40 cedis/kg, the profile doesn't append — it overwrites. The history lives in the Cycle Summaries.

### Layer 2 — Cycle Summaries (loaded when relevant, medium)

Each completed cycle produces a structured summary. This is the compressed interpretation of what happened during that cycle — not the raw data, but the narrative that matters for future decisions.

Cycle Summaries belong to a specific venture. They are loaded into agents that need historical context within that venture: the interview agent (for fork continuations), the recommendation agent (to build on prior learnings), and the continuation brief agent (to see the arc across cycles).

**Size target:** 1000-2000 tokens per summary. A venture with 5 cycles has 5000-10000 tokens of summaries.

**Content per summary:**

```
Cycle metadata:
- Cycle number within venture
- Duration (start date to completion date)
- Recommendation type given

What was recommended:
- The recommendation in 2-3 sentences
- Key assumptions it rested on

What the founder did:
- Tasks completed (count and highlights)
- Tasks blocked (count and common reasons)
- Tasks skipped (count and reasons if known)
- Overall completion percentage

Tool usage:
- Coach sessions (count, key conversations rehearsed)
- Composer sessions (count, messages sent vs generated)
- Research sessions (count, key findings)
- Packager sessions (count, pricing defined)

Check-in patterns:
- Frequency (daily / weekly / sporadic)
- Recurring themes in blocks
- Evidence of progress vs stagnation

Continuation brief conclusion:
- What the brief determined
- What assumptions were validated or invalidated
- Key learnings in 2-3 sentences

Fork selected:
- Which fork was chosen
- Why (if the founder stated a reason)

Calibration adjustments:
- Speed multiplier change
- New avoidance patterns detected
- Tool preference shifts
```

### Layer 3 — Raw History (never loaded wholesale, queried on demand)

Everything else: every check-in entry, every tool session transcript, every research finding, every Coach role-play, every Composer message, every roadmap task with its full metadata. This lives in the database exactly as it does today. It is never loaded into a prompt in bulk.

It is queried selectively when a specific agent needs a specific piece of history:
- The check-in agent detects a pattern (blocked on outreach for the third task) and queries prior outreach blocks
- The recommendation agent needs to know what pricing was tested in a previous cycle and queries that cycle's Packager session
- The Coach is preparing for a conversation with a person the founder met in a previous cycle and queries that prior Coach session

The query is targeted. The result is small. Only the relevant slice enters the prompt.

---

## 4. Data Models

### 4.1 FounderProfile

New Prisma model:

```prisma
model FounderProfile {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Structured JSON containing all three sections:
  // stableContext, currentSituation, behaviouralCalibration, journeyOverview
  profile   Json

  // Track when it was last updated and by which cycle
  lastUpdatedByCycleId  String?
  updatedAt             DateTime @updatedAt
  createdAt             DateTime @default(now())
}
```

### 4.2 Venture

New Prisma model:

```prisma
model Venture {
  id             String    @id @default(cuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  name           String    // "Commercial laundry service" — auto-generated from first recommendation
  status         String    @default("active") // 'active' | 'paused' | 'completed'

  currentCycleId String?

  cycles         Cycle[]

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

### 4.3 Cycle

New Prisma model:

```prisma
model Cycle {
  id                   String    @id @default(cuid())
  ventureId            String
  venture              Venture   @relation(fields: [ventureId], references: [id], onDelete: Cascade)

  cycleNumber          Int       // 1, 2, 3... within the venture
  status               String    @default("in_progress") // 'in_progress' | 'completed' | 'abandoned'

  // References to existing models
  recommendationId     String?   @unique
  roadmapId            String?

  // The compressed summary generated at cycle completion (Layer 2)
  summary              Json?

  // The fork that was selected to start the next cycle (null if cycle is current)
  selectedForkIndex    Int?
  selectedForkSummary  String?

  createdAt            DateTime  @default(now())
  completedAt          DateTime?
}
```

### 4.4 Modifications to Existing Models

**User model gains:**

```prisma
model User {
  // ... existing fields
  founderProfile   FounderProfile?
  ventures         Venture[]
}
```

**Recommendation model gains:**

```prisma
model Recommendation {
  // ... existing fields
  cycleId    String?   // Links recommendation to its cycle
}
```

**Roadmap model gains (or existing field repurposed):**

```prisma
model Roadmap {
  // ... existing fields (already has recommendationId which links to cycle)
  ventureId  String?   // Direct reference for query convenience
}
```

### 4.5 FounderProfile JSON Schema

```typescript
const FounderProfileSchema = z.object({
  stableContext: z.object({
    name: z.string(),
    location: z.string(),
    country: z.string(),
    background: z.string(),
    skills: z.array(z.string()),
    education: z.string().optional(),
    technicalAbility: z.string(), // 'none' | 'basic' | 'intermediate' | 'advanced'
    languages: z.array(z.string()),
  }),
  currentSituation: z.object({
    primaryFocus: z.string(),
    availableHoursPerWeek: z.number(),
    financialConstraints: z.string(),
    teamComposition: z.string(),
    toolsAndResources: z.string().optional(),
    activeVentureNames: z.array(z.string()),
  }),
  behaviouralCalibration: z.object({
    realSpeedMultiplier: z.number(), // 0.6 means they execute at 60% of estimated speed
    taskAvoidancePatterns: z.array(z.string()),
    toolPreferences: z.array(z.string()),
    checkInDetailLevel: z.enum(['sparse', 'moderate', 'detailed']),
    pushbackTendency: z.enum(['accepts_quickly', 'challenges_thoroughly', 'mixed']),
    responseToNudges: z.enum(['responsive', 'ignores', 'delayed']),
    outreachComfortLevel: z.enum(['avoids', 'neutral', 'proactive']),
    strengths: z.array(z.string()),
  }),
  journeyOverview: z.object({
    completedVentures: z.number(),
    completedCycles: z.number(),
    totalTasksCompleted: z.number(),
    mostRecentVentureName: z.string().optional(),
    mostRecentVentureStatus: z.string().optional(),
  }),
});
```

### 4.6 CycleSummary JSON Schema

```typescript
const CycleSummarySchema = z.object({
  cycleNumber: z.number(),
  duration: z.object({
    startDate: z.string(),
    endDate: z.string(),
    totalDays: z.number(),
  }),
  recommendationType: z.string(),
  recommendationSummary: z.string(),
  keyAssumptions: z.array(z.string()),

  execution: z.object({
    tasksCompleted: z.number(),
    tasksBlocked: z.number(),
    tasksSkipped: z.number(),
    totalTasks: z.number(),
    completionPercentage: z.number(),
    highlightedCompletions: z.array(z.string()),
    commonBlockReasons: z.array(z.string()),
  }),

  toolUsage: z.object({
    coachSessions: z.number(),
    coachHighlights: z.array(z.string()),
    composerSessions: z.number(),
    messagesSent: z.number(),
    messagesGenerated: z.number(),
    researchSessions: z.number(),
    researchKeyFindings: z.array(z.string()),
    packagerSessions: z.number(),
    pricingDefined: z.boolean(),
  }),

  checkInPatterns: z.object({
    frequency: z.enum(['daily', 'weekly', 'sporadic', 'rare']),
    recurringThemes: z.array(z.string()),
    progressTrend: z.enum(['accelerating', 'steady', 'decelerating', 'stalled']),
  }),

  continuationConclusion: z.string(),
  validatedAssumptions: z.array(z.string()),
  invalidatedAssumptions: z.array(z.string()),
  keyLearnings: z.array(z.string()),

  forkSelected: z.object({
    forkIndex: z.number(),
    forkSummary: z.string(),
    founderReason: z.string().optional(),
  }).optional(),

  calibrationAdjustments: z.object({
    speedMultiplierChange: z.number().optional(),
    newAvoidancePatterns: z.array(z.string()),
    newStrengths: z.array(z.string()),
    toolPreferenceShifts: z.array(z.string()),
  }),
});
```

---

## 5. The Lifecycle Transition Engine

At the boundary between cycles — when a founder completes a roadmap and the continuation brief is generated — two background jobs fire via Inngest.

### 5.1 Trigger

The continuation brief generation is the trigger. When the continuation brief route completes and stores the brief, it emits an Inngest event: `neuralaunch/cycle.completing`.

### 5.2 Job 1 — Generate Cycle Summary (Haiku)

**Input:** The completed roadmap with all tasks, check-in history, tool sessions, and the continuation brief.

**Agent:** Haiku (this is compression and extraction, not creative synthesis).

**Output:** A `CycleSummary` conforming to the schema above.

**Persistence:** Written to the Cycle's `summary` field.

**Prompt context:**
- The recommendation (what was suggested)
- The full roadmap with task statuses and check-in counts
- A condensed view of tool sessions (session counts and types, not full transcripts)
- The continuation brief text
- The CycleSummary schema for structured output

### 5.3 Job 2 — Update Founder Profile (Haiku)

**Input:** The current Founder Profile, the just-generated Cycle Summary, and selected raw data points where calibration changed.

**Agent:** Haiku (this is a structured update, not reasoning).

**Output:** An updated `FounderProfile` conforming to the schema above.

**Persistence:** Upserted to the FounderProfile model.

**What it updates:**
- `currentSituation.primaryFocus` — based on the fork selected (or venture completed)
- `currentSituation.availableHoursPerWeek` — adjusted if the cycle revealed the founder's real availability differs from stated
- `currentSituation.activeVentureNames` — updated to reflect venture status changes
- `behaviouralCalibration.realSpeedMultiplier` — recalculated from the ratio of actual task duration to estimated duration across all completed tasks in this cycle
- `behaviouralCalibration.taskAvoidancePatterns` — updated if new avoidance patterns were detected
- `behaviouralCalibration.toolPreferences` — updated based on which tools were used most
- `behaviouralCalibration.checkInDetailLevel` — recalculated from average check-in message length
- `behaviouralCalibration.strengths` — updated if the cycle revealed new strengths
- `journeyOverview` — incremented counts

**What it does NOT update:**
- `stableContext` — name, location, skills, education. These only change if the founder explicitly updates them (future: profile editing feature) or if the interview agent detects a change during a new cycle's interview.

### 5.4 Job Sequencing

Job 1 (Cycle Summary) must complete before Job 2 (Profile Update) runs, because the Profile Update uses the Cycle Summary as input. Use Inngest's step chaining:

```typescript
inngest.createFunction(
  { id: 'cycle-completion-processor' },
  { event: 'neuralaunch/cycle.completing' },
  async ({ event, step }) => {
    const cycleSummary = await step.run('generate-cycle-summary', async () => {
      return generateCycleSummary(event.data.cycleId);
    });

    await step.run('update-founder-profile', async () => {
      return updateFounderProfile(event.data.userId, cycleSummary);
    });
  }
);
```

### 5.5 First Cycle Bootstrap

When a founder completes their very first cycle, the Founder Profile doesn't exist yet. The bootstrap process:

1. The first discovery interview creates the initial belief state (this exists today).
2. When the first cycle completes, Job 2 creates the Founder Profile from scratch using the belief state as the seed plus the first Cycle Summary for calibration.
3. All subsequent cycles update the existing profile.

For founders who already have completed sessions in the database (pre-Venture-model), a migration script should:
- Create a Venture for each recommendation lineage
- Create Cycles within each venture
- Generate retroactive Cycle Summaries from the existing data (batch Haiku job)
- Bootstrap the Founder Profile from the most recent belief state plus the retroactive summaries

---

## 6. Agent Loading Rules

The core principle: **agents don't retain context, they read context.** Every agent starts fresh on every call. What makes it smart is what gets loaded from the database into the prompt.

### 6.1 Loading Matrix

| Agent | Founder Profile (L1) | Venture Cycle Summaries (L2) | Other Venture Data | Current Context | Selective History (L3) |
|---|---|---|---|---|---|
| Interview (fresh start) | Full | None | Behavioural calibration only | None | None |
| Interview (fork continuation) | Full | All prior cycles in this venture | None | Fork context from continuation brief | None |
| Recommendation synthesis | Full | All prior cycles in this venture | None | Interview transcript | None |
| Roadmap generator | Full | Latest cycle summary only | None | Recommendation + tool choreography rules | None |
| Check-in agent | Full | None | None | Current task + task check-in history | On-demand: query if recurring block pattern detected |
| Conversation Coach | Full | None | None | Current task + coach session state | None |
| Outreach Composer | Full | None | None | Current task + package if exists + composer session state | None |
| Research Tool | Full | None | None | Current task + query + research plan | None |
| Service Packager | Full | None | None | Current task + research findings | None |
| Continuation brief agent | Full | All cycles in this venture | None | Full roadmap progress + check-in summaries | On-demand: conversation arc data |
| Cycle Summary generator | None (reads raw data) | None | None | Full roadmap + continuation brief | Full task and check-in data for this cycle |
| Profile Update agent | Current profile | Just-generated cycle summary | None | None | None |
| Nudge cron | None | None | None | Stale task title only | None |

### 6.2 Caching Strategy

**Always cacheable (stable within a session, changes only at cycle boundaries):**
- Founder Profile — identical across all calls within a cycle
- Current recommendation and roadmap structure — identical across all task-level calls
- Venture Cycle Summaries — identical across all calls that load them

**Variable per call (not cached):**
- Current task context (changes per task)
- Check-in messages (grows per check-in)
- Tool session state (changes per tool interaction)
- Selective history query results (unique per query)

**Prompt structure for caching:**

```
[CACHED PREFIX — same across all calls in this cycle]
  System prompt for this agent
  Founder Profile
  (If applicable) Venture Cycle Summaries
  Current recommendation summary
  Roadmap structure overview

[VARIABLE SUFFIX — changes per call]
  Current task details
  Specific check-in or tool session context
  The founder's current message/input
```

Anthropic's prompt caching charges $1.50 per million tokens for cached input (vs $15 for uncached Opus input). If the cached prefix is 3000 tokens and the variable suffix is 1000 tokens, the effective cost per call drops from $0.06 to $0.0195 — a 67% reduction.

---

## 7. Interview Agent Modifications

### 7.1 Fork Continuation Interview

When a founder picks a fork from the continuation brief, the next cycle's interview should be dramatically shorter than the first. The system already knows the founder. The interview agent receives:

- The full Founder Profile
- All Cycle Summaries for this venture
- The selected fork description
- The continuation brief text

The interview opens with acknowledgment, not questions:

"You completed your roadmap for [venture name] — [completion percentage]% of tasks done. The continuation brief identified [key learnings]. You've chosen to [fork description]. Let me ask a few questions about this new direction."

The agent asks only:
- What's changed since the last cycle? (situation, resources, constraints)
- What specific aspect of this fork are you most focused on?
- Is there anything from the last cycle you want to carry forward or explicitly leave behind?

Target: 3-5 questions, not 15-20. The belief state for this cycle is generated by merging the Founder Profile with the new answers.

### 7.2 Fresh Start Interview

When a founder starts a completely new venture, the interview loads the Founder Profile and opens with recognition:

"Welcome back. Last time you [most recent venture summary]. You're starting something new — tell me what you're thinking."

The agent skips all stable context questions (location, skills, education, technical ability) because the Founder Profile already has them. It asks only:
- What's the new idea or direction?
- Why now? What changed?
- Is this related to anything you've done before, or completely new?
- What resources are you bringing to this? (may have changed)
- How much time can you give this? (may have changed)

Target: 5-8 questions. The stable context from the Founder Profile is merged with new situation-specific answers to create the new cycle's belief state.

---

## 8. Continuation Brief Agent Modifications

The continuation brief agent currently produces five sections. With the lifecycle architecture, it gains awareness of the venture arc.

### 8.1 Additional Context

The brief agent receives all Cycle Summaries for the current venture. In cycle 3, it can reference patterns across all three cycles:

"Across your three cycles with this venture, a pattern has emerged: you consistently reach 70% task completion before momentum slows. The tasks that stall are always outreach-related. In cycle 1, you blocked on contacting restaurant owners. In cycle 2, you blocked on following up with hotel managers. In cycle 3, the same pattern appeared with guest house operators. The Conversation Coach helped you break through each time, but only after 2-3 weeks of avoidance."

### 8.2 Fork Generation With Venture Arc

The forks offered at the end of a cycle should account for the venture's full history, not just the most recent cycle. A fork that suggests "expand to a new market" is more meaningful when the system can say "you've proven your pricing model works in East Legon across two cycles — the logical expansion is Cantonments or Airport Residential."

### 8.3 Cycle Completion Signal

When the founder clicks "What's Next?" and the continuation brief is generated, the brief route also emits the `neuralaunch/cycle.completing` event that triggers the Lifecycle Transition Engine (Section 5).

---

## 9. Sessions Tab Becomes Venture-Aware

### 9.1 Current Structure

The Sessions tab currently shows a flat list of recommendations with status badges.

### 9.2 New Structure

The Sessions tab shows ventures, with cycles nested inside:

```
"Start new discovery" button

Active Ventures:
┌─────────────────────────────────────────────┐
│ Commercial Laundry Service          Active   │
│ Cycle 3 of 3 — "Expand to guest houses"     │
│ ████████░░ 65% — 8 of 12 tasks              │
│                                              │
│ ▸ Cycle 1: Initial hotel launch (completed)  │
│ ▸ Cycle 2: Pricing optimisation (completed)  │
│ ▸ Cycle 3: Guest house expansion (active)    │
└─────────────────────────────────────────────┘

Paused Ventures:
┌─────────────────────────────────────────────┐
│ Tutoring Platform                   Paused   │
│ Cycle 1 of 1 — "Validate demand"            │
│ ███░░░░░░░ 30% — 3 of 10 tasks              │
└─────────────────────────────────────────────┘

Completed Ventures:
┌─────────────────────────────────────────────┐
│ Freelance Graphic Design           Completed │
│ 2 cycles — Completed 4 months ago            │
└─────────────────────────────────────────────┘
```

Tapping a venture card expands it to show its cycles. Tapping an active cycle navigates to its roadmap. Tapping a completed cycle shows the Cycle Summary and continuation brief in read-only mode.

### 9.3 Venture Naming

The venture name is auto-generated from the first recommendation in the venture's first cycle. The recommendation synthesis agent produces a short venture name as part of its output: "Commercial laundry service for hotels" or "Freelance graphic design positioning." The founder can rename the venture from the Sessions tab.

---

## 10. Migration Strategy for Existing Data

### 10.1 Schema Migration

Add the FounderProfile, Venture, and Cycle models to the Prisma schema. Run the migration. No application code changes yet.

### 10.2 Data Backfill

Run a background script that:

1. For each user with completed recommendations, create a Venture per recommendation lineage (a recommendation and its forks form one venture).
2. Within each venture, create Cycle records linking to existing recommendations and roadmaps.
3. For cycles with completed roadmaps, generate retroactive Cycle Summaries using a batch Haiku job that reads the existing check-in history, tool sessions, and continuation briefs.
4. For each user, bootstrap a Founder Profile from their most recent belief state plus any retroactive Cycle Summaries.

### 10.3 Phased Rollout

Phase 1: Deploy schema and backfill. Existing flows continue unchanged. The Founder Profile and Cycle Summaries exist in the database but are not yet read by agents.

Phase 2: Update the interview agent to read the Founder Profile for returning users. Update the continuation brief agent to read Cycle Summaries. Update the recommendation agent to read Cycle Summaries. Monitor quality and token usage.

Phase 3: Deploy the Lifecycle Transition Engine (Inngest jobs). New cycle completions now auto-generate summaries and update profiles. Deploy the venture-aware Sessions tab UI.

Phase 4: Update the roadmap generator to use the Founder Profile's speed calibration for time estimates. Update the check-in agent to use selective history queries for pattern detection. Deploy remaining agent loading rule changes.

---

## 11. Security

- The Founder Profile, Cycle Summaries, and Venture data follow the same ownership-scoped query pattern as all other NeuraLaunch data. All database queries are scoped to the authenticated user's ID.
- The Lifecycle Transition Engine runs as Inngest background jobs authenticated via the internal Inngest key, not user-facing routes.
- Founder Profile content is treated as user data and included in data deletion requests (Section 9.6 of the Terms of Service).
- The Cycle Summary generator and Profile Update agent prompts include the standard SECURITY NOTE and use `renderUserContent()` on all founder-provided text.

---

## 12. Prompt Caching Implementation Priority

Prompt caching is the single highest-ROI engineering task for the lifecycle architecture. Without it, every agent call pays full Opus input rates on the Founder Profile and Cycle Summaries. With it, those stable prefixes are cached at 90% discount.

**Implementation order:**
1. Add prompt caching to the check-in agent (highest call volume per user)
2. Add prompt caching to the Coach and Composer agents (frequent calls during active execution)
3. Add prompt caching to the Research Tool and Service Packager (fewer calls but expensive Opus calls)
4. Add prompt caching to the recommendation and continuation brief agents (once per cycle but largest context windows)

**Expected cost reduction:** 50-67% reduction in per-user API costs, bringing the active-user COGS from $15-19 (uncached) to $8-12 (cached). This transforms the $29/month Execute tier from a tight margin to a healthy one.