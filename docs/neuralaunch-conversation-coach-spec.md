# NeuraLaunch Conversation Coach — Full Specification

---

## 1. What the Conversation Coach Is

The Conversation Coach is an AI-powered preparation and rehearsal tool for founders who need to have a specific high-stakes conversation. It generates a structured preparation package — script, objection handling, fallback positions, post-conversation checklist — tailored to the founder's specific situation, the specific person they're talking to, the specific channel they're using, and the specific fear that's stopping them. It then offers a role-play mode where the AI plays the other party so the founder can rehearse before the real conversation.

The Coach is not a generic message writer. It's not a template filler. It's the tool that directly addresses the single biggest execution bottleneck in the dataset: 29% of sessions have a founder avoiding one specific conversation, and 39.5% of all roadmap tasks involve conversation preparation. The Coach turns avoidance into readiness.

---

## 2. How the Founder Accesses It

### Primary path — from the roadmap task card

The roadmap generator knows what internal tools exist. When it produces a task that involves a high-stakes conversation — pitching, negotiating, asking for something, confronting someone, delivering difficult news, requesting a meeting — it attaches a `suggestedTools` field to the task with `conversation_coach` as a value. The task card renders a "Prepare with Conversation Coach" button when this field is present.

When the founder clicks it, the Coach opens pre-loaded with the task's full context: the task title and description, the success criteria, the phase objective, the recommendation path, and the relevant belief state fields. The founder doesn't re-explain anything — the Coach already knows what conversation they need to have and why.

### Secondary path — standalone from the tools menu

A "Tools" section accessible from the main navigation lists all available tools. The founder can open the Conversation Coach without a task context. The Coach loads with the belief state and recommendation context but no specific task. The founder describes the conversation from scratch. The output persists in a `toolSessions` store on the roadmap, accessible from the tools menu, and referenceable by the continuation system.

---

## 3. The Conversation Coach Flow

The flow has four stages: Situation, Preparation, Rehearsal, and Debrief.

### Stage 1 — Situation (1-3 exchanges)

The Coach needs to understand four things before it can prepare the founder:

**Who are you talking to?** Not just their role — their relationship to the founder, the power dynamic, any history between them. "My uncle's contact at the hotel, the operations manager, I've never met him but my uncle vouched for me" is different from "my co-founder who I've been working with for 8 months."

**What do you need from this conversation?** The specific outcome. Not "discuss the partnership" but "get him to agree to a 2-week paid trial of our laundry service at a price I can sustain."

**What are you afraid will happen?** The specific fear. "He'll say they already have a vendor and I won't know how to respond" or "she'll think I'm not qualified because I'm a fresh graduate" or "he'll ask about my pricing and I'll panic and undercharge."

**How are you having this conversation?** The channel: WhatsApp message, in-person meeting, email, or LinkedIn message.

If the Coach is launched from a task card, it already knows most of this from the task context and belief state. It might only need to confirm: "Based on your task, it looks like you need to meet the hotel operations manager and pitch your laundry service. Who specifically are you meeting, and what's your biggest worry about the conversation?" One or two exchanges, not a full interview.

If launched standalone, the Coach asks these questions directly. Three exchanges maximum — the Coach is not a discovery interview, it's a preparation tool.

The situation is captured in a `ConversationSetup` object that persists and feeds into every subsequent stage.

### Stage 2 — Preparation (single structured output)

The Coach generates the preparation package in one call. This is an Opus call (not Sonnet) because the quality of the script, the specificity of the objection handling, and the honesty of the fallback positions are the entire value proposition. The output is a structured `PreparationPackage` with five sections:

**Opening script** — the exact words to say or send to start the conversation, adapted to the channel. For WhatsApp, this is the literal message to paste. For in-person, this is the first 30 seconds of the meeting — what to say after "hello." For email, this includes a subject line. For LinkedIn, this respects the platform's message constraints.

**Key asks** — the 2-3 specific things the founder needs to achieve in this conversation, stated as concrete outcomes. Not "discuss pricing" but "establish that your rate is 40 cedis per kilogram and get their reaction before offering the trial discount."

**Objection handling** — the 3-4 most likely pushbacks the other party will raise, with a prepared response for each. Each response is grounded in the founder's actual context from the belief state. "If they say they already have a vendor, say: 'I understand — can I ask what your biggest frustration with your current vendor is? If reliability and turnaround time are issues, that's exactly what our 2-week trial is designed to prove.'" The objections are inferred from the `rolePlaySetup` — the Coach has already modelled the other party.

**Fallback positions** — what the founder can offer if the conversation goes badly. The minimum acceptable outcome. "If they won't commit to a paid trial, ask for a single test batch — one day's uniforms, processed and returned within 24 hours, free of charge. That costs you one day of vendor fees and gives you a foot in the door."

**Post-conversation checklist** — 3-5 specific things to do immediately after the conversation based on the possible outcomes. "If they agreed to the trial: send a confirmation WhatsApp within 2 hours restating the terms. If they said no: ask who else in their network might be interested. If they asked for more time: set a specific follow-up date before you leave."

**The `rolePlaySetup`** — generated as part of this same call but rendered separately. This is the character sheet for the role-play: the other party's likely personality, their motivations, their probable concerns, the power dynamic, and their communication style on the selected channel. In preparation mode the founder doesn't see this directly — it feeds into the objection handling. In rehearsal mode it becomes the AI's character.

### Stage 3 — Rehearsal (multi-turn role-play)

After reading the preparation package, the founder can enter rehearsal mode. The AI switches from advisor to actor — it plays the other party based on the `rolePlaySetup` character sheet.

The role-play adapts to the selected channel:

**In-person** — a back-and-forth dialogue. The founder types what they would say. The AI responds as the other party would respond — in character, with realistic objections, realistic tone, realistic reactions. Not a caricature. Not an impossibly difficult opponent. A realistic simulation of the person the founder described.

**WhatsApp** — the AI responds as the other party would respond on WhatsApp. Short messages. Informal tone. Possible delays implied by pacing. The founder practises sending their prepared opening and handling the response in the format they'll actually use.

**Email** — the AI responds with a realistic email reply. Subject line, greeting, body, sign-off. The founder practises their follow-up.

**LinkedIn** — the AI responds as the other party would respond to a LinkedIn message. Brief, professional, possibly guarded.

The role-play has a **10-turn limit** with a warning at turn 8. Most rehearsals should resolve in 4-6 turns — the founder delivers their opening, handles 2-3 objections, and reaches some outcome. At the end (or when the founder stops), the Coach switches back to advisor mode and delivers a brief debrief.

The role-play uses **Sonnet, not Opus**. The role-play is conversational and responsive — Sonnet's speed matters more than Opus's depth here. The preparation package is where Opus quality matters. The rehearsal is where Sonnet speed matters.

### Stage 4 — Debrief (single structured output)

After the rehearsal ends, the Coach produces a short debrief:

**What went well** — specific moments in the role-play where the founder handled an objection effectively or maintained composure.

**What to watch for** — moments where the founder hesitated, went off-script, or lost the thread. Not criticism — preparation notes. "When they pushed back on pricing you dropped to the discount immediately — in the real conversation, try holding your initial price for one more exchange before offering the trial rate."

**Revised script** — if the rehearsal surfaced something the preparation package missed (an objection the founder didn't anticipate, a better opening that emerged naturally), the debrief produces an updated version of the relevant section.

The debrief is a Haiku call — it's a lightweight synthesis of the role-play transcript, not a strategic analysis.

---

## 4. Data Model

### On the task (StoredRoadmapTaskSchema)

```typescript
suggestedTools: z.array(z.string()).optional()

coachSession: z.object({
  setup: ConversationSetupSchema,
  preparation: PreparationPackageSchema,
  rolePlayHistory: z.array(RolePlayTurnSchema).optional(),
  debrief: DebriefSchema.optional(),
  channel: z.enum(['whatsapp', 'in_person', 'email', 'linkedin']),
  createdAt: z.string(),
  updatedAt: z.string(),
}).optional()
```

The `coachSession` is optional — only present on tasks where the founder used the Coach. The entire session persists on the task so the founder can re-read the preparation, the check-in agent can reference it, and the continuation engine can see it.

### On the roadmap (for standalone sessions)

```typescript
toolSessions: z.array(z.object({
  id: z.string(),
  tool: z.enum(['conversation_coach']),
  setup: ConversationSetupSchema,
  preparation: PreparationPackageSchema,
  rolePlayHistory: z.array(RolePlayTurnSchema).optional(),
  debrief: DebriefSchema.optional(),
  channel: z.enum(['whatsapp', 'in_person', 'email', 'linkedin']),
  createdAt: z.string(),
  updatedAt: z.string(),
})).optional()
```

Standalone sessions live on the roadmap row in a `toolSessions` array. The schema is extensible — when the Outreach Composer and Service Packager ship, they add their own entries to this array with `tool: 'outreach_composer'` and `tool: 'service_packager'`.

### ConversationSetupSchema

```typescript
const ConversationSetupSchema = z.object({
  who: z.string(),            // who the founder is talking to
  relationship: z.string(),   // the dynamic between them
  objective: z.string(),      // what the founder needs from this conversation
  fear: z.string(),           // what the founder is afraid will happen
  channel: z.enum(['whatsapp', 'in_person', 'email', 'linkedin']),
  taskContext: z.string().optional(),  // the task description if launched from a task card
});
```

### PreparationPackageSchema

```typescript
const PreparationPackageSchema = z.object({
  openingScript: z.string(),
  keyAsks: z.array(z.object({
    ask: z.string(),
    whyItMatters: z.string(),
  })),
  objections: z.array(z.object({
    objection: z.string(),
    response: z.string(),
    groundedIn: z.string(),  // which belief state field or context this response draws from
  })),
  fallbackPositions: z.array(z.object({
    trigger: z.string(),     // "if they say no to the trial"
    fallback: z.string(),    // "ask for a single test batch"
  })),
  postConversationChecklist: z.array(z.object({
    condition: z.string(),   // "if they agreed"
    action: z.string(),      // "send confirmation WhatsApp within 2 hours"
  })),
  rolePlaySetup: z.object({
    personality: z.string(),
    motivations: z.string(),
    probableConcerns: z.array(z.string()),
    powerDynamic: z.string(),
    communicationStyle: z.string(),
  }),
});
```

### RolePlayTurnSchema

```typescript
const RolePlayTurnSchema = z.object({
  role: z.enum(['founder', 'other_party']),
  message: z.string(),
  turn: z.number(),
});
```

### DebriefSchema

```typescript
const DebriefSchema = z.object({
  whatWentWell: z.array(z.string()),
  whatToWatchFor: z.array(z.string()),
  revisedSections: z.object({
    openingScript: z.string().optional(),
    additionalObjection: z.object({
      objection: z.string(),
      response: z.string(),
    }).optional(),
  }).optional(),
});
```

---

## 5. Roadmap Generator Integration

The roadmap generator's prompt gains a section describing available internal tools:

```
INTERNAL TOOLS AVAILABLE TO THE FOUNDER:
When generating tasks, you may suggest internal tools that help the founder execute. Attach a suggestedTools array to any task where a tool would materially help.

- conversation_coach: Helps founders prepare for and rehearse high-stakes one-on-one conversations. Generates scripts, objection handling, fallback positions, and offers role-play rehearsal. Suggest this for any task that involves pitching, negotiating, asking for something, confronting someone, delivering difficult news, or requesting a meeting where the founder might hesitate or avoid the conversation.
```

As you build the Outreach Composer and Service Packager, you add them to this same block. The generator's tool awareness grows with the toolkit.

The `RoadmapTaskSchema` gains:

```typescript
suggestedTools: z.array(z.string()).optional().describe(
  'Internal NeuraLaunch tools that would help the founder execute this task. Only suggest when the tool is genuinely relevant, not as a default.'
)
```

---

## 6. Check-in Agent Integration

The check-in agent's prompt gains awareness of Coach sessions. When the agent loads a task that has a `coachSession`, the prompt includes:

```
THE FOUNDER USED THE CONVERSATION COACH ON THIS TASK:
They prepared for a conversation with: ${setup.who}
Their objective was: ${setup.objective}
Their fear was: ${setup.fear}
Channel: ${setup.channel}
They rehearsed: ${rolePlayHistory ? 'yes, ' + rolePlayHistory.length + ' turns' : 'no'}

When the founder checks in on this task, reference their preparation. If the conversation happened, ask how it compared to what they prepared for. If specific objections from the preparation came up, ask about them by name. If they haven't had the conversation yet, acknowledge the preparation and encourage them — they've done the hard work of preparing, now they need to execute.
```

This turns the post-conversation check-in from "how did it go?" into "you prepared for a pricing objection at 800 cedis — did that come up? How did your fallback position land?" That's the strategic debrief the founder doesn't get from any other tool.

---

## 7. API Routes

### Task-level routes

- **`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/coach/setup`** — Receives the founder's situation description. If launched from a task card, pre-populates from task context and asks only for missing fields (who specifically, what's the fear). If standalone, collects all four fields. Returns the `ConversationSetup`. 1-3 exchanges. Sonnet.

- **`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/coach/prepare`** — Takes the completed setup and generates the full `PreparationPackage` including the `rolePlaySetup`. Single call. Opus. Research tools (`exa_search`, `tavily_search`) available so the agent can research the other party's company, industry norms, or relevant context.

- **`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/coach/roleplay`** — One role-play turn per call. Takes the founder's message and the role-play history. Returns the other party's response in character. 10-turn cap with warning at 8. Sonnet.

- **`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/coach/debrief`** — Takes the role-play transcript and produces the debrief. Single call. Haiku.

### Standalone routes (without taskId)

- **`POST /api/discovery/roadmaps/[id]/coach/setup`**
- **`POST /api/discovery/roadmaps/[id]/coach/prepare`**
- **`POST /api/discovery/roadmaps/[id]/coach/roleplay`**
- **`POST /api/discovery/roadmaps/[id]/coach/debrief`**

These write to `roadmap.toolSessions` instead of the task's `coachSession`.

---

## 8. UI Components

**`ConversationCoachButton`** — renders on the task card when `suggestedTools` includes `conversation_coach`. "Prepare with Conversation Coach →". Also accessible from the tools menu for standalone use.

**`CoachSetupChat`** — 1-3 turn setup conversation. Pre-populated fields when launched from a task. The founder confirms or adjusts the pre-populated context, adds the missing pieces (who specifically, what's the fear), and selects the channel.

**`PreparationView`** — renders the five-section preparation package. Each section is collapsible. The opening script has a "Copy to clipboard" button formatted for the selected channel. The objection handling renders as paired cards (objection on top, response below). The checklist renders as a checkable list the founder can tick off after the conversation.

**`RolePlayChat`** — visually distinct from all other chat surfaces in the product. Different background colour, a clear "REHEARSAL MODE" indicator, and the other party's name displayed as the agent identity instead of "NeuraLaunch." The founder needs to feel they're practising with a person, not talking to the product. A "End rehearsal" button is always visible. Turn counter shows "3/10" so the founder knows their budget.

**`DebriefView`** — renders the three debrief sections after rehearsal ends. The revised script sections highlight what changed from the original preparation.

**`CoachSessionReview`** — the persistent view on the task card after the Coach session is complete. Shows a collapsed summary: "You prepared for a conversation with [who] via [channel]" with an expand to re-read the full preparation, role-play transcript, and debrief.

---

## 9. Model Selection

| Stage | Model | Fallback | Rationale |
|---|---|---|---|
| Setup | Sonnet | Haiku | Conversational, fast, low-stakes |
| Preparation | Opus | Sonnet | Highest quality output — the script and objection handling are the core value |
| Role-play | Sonnet | Haiku | Conversational speed matters more than depth during back-and-forth |
| Debrief | Haiku | — | Lightweight synthesis of the role-play transcript |

All stages use `withModelFallback` with the standard fallback chain. Research tools (`exa_search`, `tavily_search`) are available during the Preparation stage so the agent can research the other party's company, industry norms, or relevant context before generating the script.

---

## 10. Security

All founder-typed text in the setup goes through `renderUserContent()` with triple-bracket delimiters before injection into any prompt. The role-play history is delimiter-wrapped on re-injection the same way check-in history is — defence in depth against indirect injection through the conversation transcript. The other party's "character" in role-play is generated by the system, not typed by the founder, so it doesn't need the same wrapping — but the system prompt for the role-play agent includes the standard SECURITY NOTE telling it to treat bracketed content as data.

---

## 11. Design Principles

Derived from the toolkit analysis and applicable to all tools in the suite:

1. **Context-aware:** The Coach reads the belief state, the recommendation, the task description, and the phase objective. It never starts from zero.

2. **Conversation-first:** The founder describes the situation in natural language. The Coach produces the exact words to say.

3. **Copy-paste ready:** The opening script is formatted for the selected channel. WhatsApp output is WhatsApp-length and WhatsApp-tone. Email output has a subject line. LinkedIn output respects character limits.

4. **Channel-native:** The role-play simulates the actual medium. In-person rehearsal is dialogue. WhatsApp rehearsal is message-length exchanges.

5. **Preparation layer, not replacement:** The Coach prepares the founder for a conversation they have themselves. It does not have the conversation for them.

6. **Mobile-first, low-bandwidth:** The primary user is on a smartphone with 3G/4G in West Africa. Every interface must load fast and work on small screens.