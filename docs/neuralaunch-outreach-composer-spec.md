# NeuraLaunch Outreach Composer — Full Specification

---

## 1. What the Outreach Composer Is

The Outreach Composer is an AI-powered message generation tool for founders who need to reach people — prospects, partners, dormant contacts, potential clients — with the right words through the right channel. It produces ready-to-send messages that the founder copies and pastes directly into WhatsApp, email, or LinkedIn with zero editing required.

The Composer is not a template library. It's not a mail merge tool. Every message it generates is grounded in the founder's specific situation, their recommendation, their belief state, and the specific person or audience they're reaching. It operates in three modes — single message, batch, and sequence — matching the three distinct outreach patterns that appear across roadmap tasks.

The Composer and the Conversation Coach are siblings. The Coach prepares founders for high-stakes one-on-one conversations they're afraid to have. The Composer produces the volume-driven written outreach that fills the pipeline. The Coach addresses fear. The Composer addresses friction. They hand off to each other: the Coach's post-conversation checklist can trigger the Composer for follow-up messages, and the Composer's responses can trigger the Coach for meeting preparation.

---

## 2. How the Founder Accesses It

### Primary path — from the roadmap task card

Same pattern as the Coach. The roadmap generator's internal tools awareness block includes the Outreach Composer. When a task involves sending messages, reaching out to prospects, following up with contacts, or drafting proposals, the generator attaches `outreach_composer` to the task's `suggestedTools` array. The task card renders a "Draft with Outreach Composer" button.

The Composer opens pre-loaded with the task context — who the founder needs to reach, why, through what channel, and with what goal. The founder doesn't re-explain anything.

### Secondary path — standalone from the tools menu

Same as the Coach. The founder opens the Composer from the tools menu without a task context. The Composer loads with the belief state and recommendation context but no specific task. The founder describes the outreach need from scratch. Output persists in `toolSessions` on the roadmap.

---

## 3. The Three Modes

After the founder describes what they need, the Composer presents three modes:

### Mode 1 — Single Message

"One message to a specific person." The founder names the recipient, their relationship, the context, and the goal. The Composer generates one ready-to-send message for the selected channel.

Best for: following up after a meeting, reaching out to a specific warm lead, sending a proposal to someone the founder has spoken with, responding to an inquiry.

### Mode 2 — Batch

"Multiple messages to similar people." The founder describes the target audience ("restaurant owners in Accra," "HR directors at mid-size Lagos companies," "tutors I found through Mariama"). The Composer generates 5-10 personalised messages that share the same core pitch but vary in opening hooks, personalisation angles, and phrasing so they don't look like copy-paste templates. Each message has a slot for the recipient's name and a context-specific personalisation hook.

Best for: cold outreach campaigns, initial prospecting, reaching a list of leads.

### Mode 3 — Sequence

"A follow-up sequence over time." The founder describes one recipient or a group, and the Composer generates a multi-touch sequence: Day 1 (initial outreach), Day 5 (gentle follow-up referencing the first message), Day 14 (final follow-up with a new angle or a graceful close). Each touch is adapted to the channel and escalates appropriately — the Day 14 message doesn't repeat the Day 1 message, it offers a new reason to respond or closes gracefully.

Best for: following up with people who didn't respond, nurturing warm leads over time, systematic outreach to a priority list.

---

## 4. Channels

Three channels, each with native formatting:

**WhatsApp** — short paragraphs, informal but professional tone, no subject line, emoji used sparingly and only when culturally appropriate. Messages respect WhatsApp's reading patterns: most people read the first 2 lines in the notification preview, so the hook must land immediately.

**Email** — subject line included, professional structure (greeting, body, call to action, sign-off), appropriate length for the context (a cold outreach email is 4-6 sentences, a follow-up is 2-3 sentences, a proposal is longer with structure).

**LinkedIn** — respects the platform's connection request character limit (300 chars) for cold outreach. Follow-up messages after connection can be longer but stay concise and professional. The tone acknowledges the professional context.

---

## 5. The Outreach Composer Flow

### Step 1 — Context (1-2 exchanges)

The Composer needs to understand:

**Who are you reaching out to?** A specific person (single mode) or a type of person (batch/sequence mode). Their role, their relationship to the founder, any prior interaction.

**What's the goal?** Not "introduce myself" but "get them to agree to a 15-minute call next week" or "get them to respond so I can pitch the trial" or "re-engage a contact who went quiet 3 weeks ago."

**What channel?** WhatsApp, email, or LinkedIn.

**What mode?** Single, batch, or sequence. The Composer can infer this from context ("I need to contact 10 restaurant owners" implies batch; "I need to follow up with someone who didn't respond" implies sequence) but confirms with the founder.

If launched from a task card, most of this is pre-populated. One confirmation exchange at most.

### Step 2 — Generation (single structured output)

The Composer generates the messages in one Sonnet call. The output is a structured `ComposerOutput` adapted to the selected mode:

**Single mode:** One message with the full text, formatted for the channel, plus a brief "why this works" annotation the founder can read but doesn't send.

**Batch mode:** 5-10 messages, each with a recipient placeholder, a personalisation hook, the full message text, and a brief annotation. The messages share a core pitch but vary in openings, angles, and phrasing. The founder can see all of them at once and pick which ones to use.

**Sequence mode:** 3 messages (Day 1, Day 5, Day 14), each with the full text, the recommended send timing, the escalation logic ("this message assumes no response to Day 1"), and a brief annotation. The Day 5 message references the Day 1 message naturally. The Day 14 message either offers a new angle or closes gracefully.

### Step 3 — Refinement (up to 2 regenerations per message)

Each generated message has a "Try a different angle" button. The founder can regenerate with a variation instruction — "more casual," "shorter," "different opening hook," "more direct," "less salesy." The regeneration keeps the same context and goal but produces a fresh version. Two regenerations per message maximum, giving the founder three total versions to choose from.

The regeneration is a lightweight Sonnet call that receives the original message, the founder's variation instruction, and the full context. It produces one new version. The founder can keep any version — all three persist and they pick the one that feels right.

### Step 4 — Output

Every message has a "Copy to clipboard" button. The founder copies, switches to WhatsApp/email/LinkedIn, pastes, and sends. The Composer also offers "Mark as sent" so the system knows the founder actually used the message — this feeds into the check-in agent's awareness and the continuation engine's evidence base.

---

## 6. Coach-Composer Handoff

### Coach → Composer

The Coach's post-conversation checklist items can trigger the Composer. When a checklist item involves sending a follow-up message (e.g., "if they agreed to the trial, send a confirmation WhatsApp within 2 hours"), the item carries a `suggestedTool: 'outreach_composer'` field and a `composerContext` object containing: who the message is for, what was agreed in the conversation, the channel, and the goal of the follow-up. The checklist item renders a "Draft this message" button that opens the Composer pre-loaded with this context. The founder goes from rehearsal to conversation to follow-up message without re-explaining anything.

### Composer → Coach

When the Composer is used in batch or sequence mode and the founder marks a message as sent, the Composer can detect when a follow-up would involve a live conversation rather than another written message. If the logical next step after an outreach response is a meeting, call, or in-person conversation, the message's output includes a `suggestedTool: 'conversation_coach'` field and a `coachContext` object containing: who responded, what they said, the original outreach context, and the likely conversation topic. The message renders a "Prepare for this conversation" link that opens the Coach pre-loaded with this context.

Both handoff directions use the same shared context substrate — belief state, recommendation, task — so neither tool starts from zero when receiving a handoff.

---

## 7. Data Model

### On the task (StoredRoadmapTaskSchema)

```typescript
composerSession: z.object({
  context: OutreachContextSchema,
  mode: z.enum(['single', 'batch', 'sequence']),
  channel: z.enum(['whatsapp', 'email', 'linkedin']),
  output: ComposerOutputSchema,
  sentMessages: z.array(z.object({
    messageId: z.string(),
    sentAt: z.string(),
  })).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).optional()
```

### OutreachContextSchema

```typescript
const OutreachContextSchema = z.object({
  targetDescription: z.string(),
  recipientName: z.string().optional(),
  recipientRole: z.string().optional(),
  relationship: z.string(),
  goal: z.string(),
  priorInteraction: z.string().optional(),
  taskContext: z.string().optional(),
  coachHandoffContext: z.object({
    conversationOutcome: z.string(),
    agreedTerms: z.string().optional(),
    coachSessionId: z.string(),
  }).optional(),
});
```

### ComposerOutputSchema

```typescript
const ComposerOutputSchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    recipientPlaceholder: z.string().optional(),
    personalisationHook: z.string().optional(),
    subject: z.string().optional(),
    body: z.string(),
    annotation: z.string(),
    sendTiming: z.string().optional(),
    escalationNote: z.string().optional(),
    suggestedTool: z.enum(['conversation_coach']).optional(),
    coachContext: z.object({
      recipientDetails: z.string(),
      outreachContext: z.string(),
      likelyConversationTopic: z.string(),
    }).optional(),
    variations: z.array(z.object({
      body: z.string(),
      subject: z.string().optional(),
      variationInstruction: z.string(),
    })).optional(),
  })),
});
```

### On the roadmap (standalone sessions)

Standalone Composer sessions go into the same `toolSessions` array as standalone Coach sessions, with `tool: 'outreach_composer'`.

### Coach PreparationPackageSchema extension for handoff

Add to the post-conversation checklist items:

```typescript
suggestedTool: z.enum(['outreach_composer']).optional(),
composerContext: z.object({
  recipient: z.string(),
  conversationOutcome: z.string(),
  agreedTerms: z.string().optional(),
  channel: z.enum(['whatsapp', 'email', 'linkedin']),
  messageGoal: z.string(),
}).optional(),
```

---

## 8. Roadmap Generator Integration

The internal tools awareness block in the roadmap generator's prompt gains the Outreach Composer entry:

```
- outreach_composer: Generates ready-to-send outreach messages for WhatsApp, email, and LinkedIn. Three modes: single message to a specific person, batch messages to multiple similar people, and multi-touch follow-up sequences. Suggest this for any task that involves sending cold outreach, following up with contacts, re-engaging dormant leads, drafting proposals, or reaching out to multiple prospects.
```

The generator can suggest both `conversation_coach` and `outreach_composer` on the same task if the task involves both preparation and outreach — e.g., "meet with the hotel manager and follow up with a confirmation message."

---

## 9. Check-in Agent Integration

Same pattern as the Coach. When the check-in agent loads a task with a `composerSession`, the prompt includes:

```
THE FOUNDER USED THE OUTREACH COMPOSER ON THIS TASK:
Mode: ${mode}
Channel: ${channel}
Target: ${context.targetDescription}
Goal: ${context.goal}
Messages generated: ${output.messages.length}
Messages marked as sent: ${sentMessages?.length ?? 0}

When the founder checks in, reference their outreach. If they sent messages, ask about responses — did anyone reply? What did they say? If they generated messages but haven't sent them, ask what's holding them back. If they're in batch mode and sent some but not all, ask whether the remaining targets are still worth pursuing or whether the responses they got changed their approach.
```

---

## 10. API Routes

### Task-level routes

- **`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/composer/generate`** — Takes the outreach context, mode, and channel. Generates the full `ComposerOutput`. Single Sonnet call with research tools available. Writes to the task's `composerSession`.

- **`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/composer/regenerate`** — Takes a message ID and a variation instruction. Regenerates one message. Sonnet call. Appends the variation to the message's `variations` array. Rejects if the message already has 2 variations (cap reached).

- **`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/composer/mark-sent`** — Takes a message ID. Appends to `sentMessages` with timestamp. No LLM call. `API_AUTHENTICATED` rate limit tier.

### Standalone routes (without taskId)

- **`POST /api/discovery/roadmaps/[id]/composer/generate`**
- **`POST /api/discovery/roadmaps/[id]/composer/regenerate`**
- **`POST /api/discovery/roadmaps/[id]/composer/mark-sent`**

These write to `roadmap.toolSessions` instead of the task's `composerSession`.

---

## 11. UI Components

**`OutreachComposerButton`** — renders on the task card when `suggestedTools` includes `outreach_composer`. "Draft with Outreach Composer →". Also accessible from the tools menu.

**`ComposerContextChat`** — 1-2 turn context collection. Pre-populated from task context when launched from a task card. The founder confirms the target, goal, channel, and mode.

**`ComposerOutputView`** — renders the generated messages. Adapted per mode:

- **Single mode:** One message card with the full text, annotation, and copy button.
- **Batch mode:** A scrollable list of 5-10 message cards, each with recipient placeholder, personalisation hook, full text, annotation, and copy button. A "select all" and "copy all" option for founders who want to use the whole batch.
- **Sequence mode:** Three message cards stacked vertically with Day 1/Day 5/Day 14 headers, send timing indicators, escalation notes between them, and individual copy buttons.

Each message card has: "Copy to clipboard" button (primary action), "Try a different angle" button (regeneration, shows remaining count "2 left" / "1 left" / greyed out), "Mark as sent" toggle, and the Coach handoff link when `suggestedTool` is present ("Prepare for this conversation →").

**`ComposerSessionReview`** — persistent view on the task card after the session completes. Shows: mode, channel, number of messages generated, number marked as sent. Expandable to re-read all messages and their variations.

---

## 12. Model Selection

| Stage | Model | Fallback | Rationale |
|---|---|---|---|
| Context collection | Sonnet | Haiku | Conversational, fast, confirming details |
| Message generation | Sonnet | Haiku | Volume output, channel-native formatting — Sonnet's quality is sufficient for outreach messages and the cost matters in batch mode (5-10 messages per call) |
| Regeneration | Sonnet | Haiku | Single message variation, fast turnaround |

The Composer uses Sonnet throughout, not Opus. The Coach uses Opus for preparation because the script quality and objection handling depth are the core value. The Composer's value is in volume, channel-native formatting, and personalisation — Sonnet handles this well and the cost is significantly lower, especially in batch mode where a single call produces 5-10 messages.

Research tools (`exa_search`, `tavily_search`) are available during the generation stage so the agent can research recipient companies, industry context, or local market norms before generating messages.

---

## 13. Security

Same patterns as the Coach and all other agents:

- All founder-typed text goes through `renderUserContent()` with triple-bracket delimiters
- The SECURITY NOTE appears in every prompt telling the model to treat bracketed content as data
- Research tool results are wrapped via `renderUserContent` and `sanitizeForPrompt`
- Message outputs go through `clampString` transforms, not `.max()` constraints
- No founder-typed text or AI output content appears in log lines
- All routes use `enforceSameOrigin`, `requireUserId`, `findFirst` with ownership scope

---

## 14. Design Principles

1. **Copy-paste ready:** Every message is formatted for the exact channel. The founder copies, pastes, sends. No editing, no reformatting.

2. **Volume-efficient:** Batch mode generates 5-10 messages in one call. The founder gets a full outreach campaign from a single interaction.

3. **Personalised, not templated:** Batch messages share a core pitch but vary in opening hooks, angles, and phrasing. They don't look like the same message sent 10 times.

4. **Channel-native:** WhatsApp messages are WhatsApp-length and WhatsApp-tone. Email has subject lines and professional structure. LinkedIn respects character limits and platform norms.

5. **Connected to the Coach:** The handoff between Coach and Composer means the founder's journey from preparation to conversation to follow-up is one continuous flow, not three disconnected tools.

6. **Trackable:** "Mark as sent" creates a record that the check-in agent and continuation engine can reference. The tools feed evidence back into the system.

7. **Mobile-first, low-bandwidth:** The primary user is on a smartphone with 3G/4G in West Africa. Every interface must load fast and work on small screens.