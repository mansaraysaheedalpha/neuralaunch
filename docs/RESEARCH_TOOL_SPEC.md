# NeuraLaunch Research Tool Access — Agent-Level Specification

---

## Architecture: Shared Research Layer

A single research capability exposed to all agents through a common interface. Tavily remains primary (LLM-optimised output, agent-friendly API). Exa remains secondary (competitor similarity search, semantic discovery). Each agent invokes the same tool with queries shaped by its specific context. One research pipeline maintained, not six separate ones.

---

## Agent 1: Phase 1 Interview Agent

**Purpose of research access:** Verify founder claims in real time and sharpen follow-up questions with external context.

### When to trigger research

- The founder names a specific competitor ("Kippa already does this," "I've looked at Wave"). Research the competitor to understand what it actually does, how it's priced, and where it operates — so the next question can probe whether the founder's understanding is accurate and where the real gap is.
- The founder claims a market condition ("nobody is doing this in Sierra Leone," "all small businesses here use exercise books"). Research to verify or challenge the claim before building the belief state around it.
- The founder mentions a specific regulation, certification, or legal requirement ("you need Bank of Sierra Leone approval," "FIRS compliance"). Research to confirm the requirement exists and understand its implications so the interview can probe whether the founder has accounted for it.
- The founder names a specific tool, platform, or service they plan to use ("I'll use Paystack for payments," "I want to deploy on Vercel"). Research to confirm it's available in their geography and appropriate for their use case.

### When NOT to trigger research

- Emotional, motivational, or personal questions (why they're pursuing this, what success looks like, their relationship with a co-founder). External data is irrelevant here.
- Questions about the founder's own experience, skills, or history. The founder is the source of truth for these.
- Generic follow-ups where the conversation is flowing well and research would break the rhythm.

### How results flow into output

Research findings do not get dumped into the conversation. The agent uses them silently to inform the next question. If the founder says "there's no competitor in this space" and research reveals there is one, the agent asks: "Have you come across [competitor name]? They seem to be operating in a similar space — how does what you're building differ?" The research sharpens the question without turning the interview into a lecture.

### Estimated research calls per session

2-4. Most interview questions don't need research. The triggers above are selective by design.

---

## Agent 2: Phase 2 Recommendation Agent

**Purpose of research access:** Ground the recommendation in verified market data, competitive intelligence, and actionable resources.

### When to trigger research

- Always research the competitive landscape for the founder's specific market and geography before generating the recommendation. Even if the founder named competitors during the interview, the recommendation agent should independently verify and expand. This is what was missing in Session 3 (Chidi) — the engine had the competitor names but never researched them.
- Research specific tools, services, or platforms that will appear in the "First Three Steps." If step 1 says "contact commercial laundry vendors in Accra," the agent should research actual vendors with real names, and if possible, contact information. The difference between "find a vendor" and "contact [specific vendor]" is the difference between a plan and an actionable plan.
- Research pricing benchmarks for the founder's industry and geography. If the recommendation involves pricing a service, the agent should ground the suggested price point in market data rather than inventing a number.
- Research regulatory or compliance requirements that affect the recommendation. If the founder is entering a regulated industry (fintech, healthcare, education), the recommendation should reference the actual regulatory framework rather than generic "check local regulations" language.

### When NOT to trigger research

- The "Why This Fits You" section. This is synthesis of the founder's own context — research doesn't add value here.
- The "What Would Make This Wrong" section. These are logical conditions derived from the belief state, not external data points.
- Emotional or motivational framing within the recommendation.

### How results flow into output

Research findings appear directly in the recommendation content. Competitor names, pricing data, tool recommendations, and regulatory references are woven into the recommendation text, the first three steps, and the risks/assumptions sections. Every research-sourced data point should be something the founder can act on immediately.

### Estimated research calls per session

4-8. This agent benefits most from research access because its output is the most externally-grounded artifact in the system.

---

## Agent 3: Pushback Agent

**Purpose of research access:** Defend or refine the recommendation with evidence, not just argumentation.

### When to trigger research

- The founder names a specific alternative or competitor during pushback ("but what about using [tool X] instead," "I heard [company Y] is already doing this better"). Research the named entity to either incorporate it into a refined recommendation or explain with evidence why the original recommendation still holds.
- The founder challenges a market assumption ("I don't think people will pay for this," "the market is bigger than you said"). Research current market data to either validate the founder's pushback (leading to a refine or replace action) or support the original assumption (leading to a defend action with evidence).
- The founder proposes an alternative approach that the engine didn't consider. Research the viability of the alternative before deciding whether to defend, refine, or replace.

### When NOT to trigger research

- Emotional pushback ("this feels too small," "I wanted something more ambitious"). The response here is about framing and motivation, not data.
- Pushback on the timeline or effort level. These are personal capacity questions, not market questions.
- When the pushback is about execution mechanics ("how do I actually do step 2?"). This is a clarification, not a challenge to the recommendation's thesis.

### How results flow into output

Research findings are cited naturally within the pushback response. "You mentioned [competitor] — I looked into their current offering and [specific finding]. Here's how that affects the recommendation..." The agent uses research to make the defend/refine/replace decision more credible and to show the founder that pushback is taken seriously enough to warrant investigation.

### Estimated research calls per pushback round

1-3. Pushback rounds are focused exchanges, not broad research sweeps.

---

## Agent 4: Check-in Agent

**Purpose of research access:** Provide concrete, actionable help when founders get stuck during roadmap execution.

### When to trigger research

- The founder says they can't find something required by a task ("I can't find restaurant owners to pitch to," "I don't know which laundry vendors operate in my area"). Research specific businesses, directories, associations, or communities relevant to the founder's geography and task.
- The founder mentions a tool or resource they need but don't know how to access ("I need a way to create invoices," "I need a simple CRM"). Research free or low-cost tools appropriate for their budget and technical skill level.
- The founder reports a new competitor or market development during a check-in ("someone just launched something similar," "a new regulation was announced"). Research the development to assess whether it affects the current roadmap.
- The founder asks for help with a specific sub-task that requires external knowledge ("what's the standard pricing for this service in Lagos," "what do I need to register a business in Kenya").

### When NOT to trigger research

- Routine check-ins where the founder is reporting progress normally. Research would add unnecessary latency.
- Emotional or motivational check-ins where the founder needs encouragement, not data.
- When the founder is describing interpersonal challenges (co-founder disagreements, family pressure). External research is irrelevant to these situations.

### How results flow into output

Research findings are delivered as direct answers or actionable resources within the check-in response. "You mentioned you're struggling to find restaurant owners — here are 3 restaurant associations in Accra: [names]. You could also try [specific approach]." The check-in agent becomes a research assistant, not just a progress tracker.

### Estimated research calls per check-in

0-2. Most check-ins won't need research. The triggers above are for when the founder is genuinely stuck and external data would unblock them.

---

## Agent 5: Continuation Agent

**Purpose of research access:** Ground the fork options in current market reality, not just historical execution data.

### When to trigger research

- Always research what has changed in the founder's market since the original recommendation was generated. New competitors, regulatory changes, funding rounds in the space, relevant industry news. The continuation brief should reflect the world as it is now, not as it was when the first roadmap was created.
- Research the viability of each fork option before presenting it. If one fork is "expand to a new geography," the agent should research that geography's market conditions. If another fork is "add a new service line," the agent should research demand signals for that service.
- Research any parking lot items that reference specific external entities ("a competitor reached out about partnering," "a client asked if I also do X"). Verify and contextualise these before surfacing them in the continuation brief.

### When NOT to trigger research

- The "What Happened" synthesis. This is interpretation of internal execution data.
- The "What I Got Wrong" section. This compares internal predictions to internal outcomes.
- The execution speed calibration. This is purely an internal calculation.

### How results flow into output

Research findings appear in the "What the Evidence Says" section (external market context layered on top of execution data), in the fork descriptions (each option grounded in current market reality), and in the parking lot annotations (external context added to internally-surfaced ideas).

### Estimated research calls per continuation

3-6. Continuation is a high-stakes decision point — the research investment is justified.

---

## Research Call Budget Summary

| Agent | Calls Per Invocation | Frequency | Monthly Estimate (per active user) |
|---|---|---|---|
| Interview Agent | 2-4 | Once per session | 2-4 |
| Recommendation Agent | 4-8 | Once per session | 4-8 |
| Pushback Agent | 1-3 per round | 0-3 rounds per session | 0-9 |
| Check-in Agent | 0-2 | Weekly check-ins | 0-8 |
| Continuation Agent | 3-6 | Every 6-10 weeks | 3-6 |
| **Total per active user per month** | | | **~9-35 calls** |

This is well within Tavily's rate limits and cost structure. The heaviest research consumers are the Recommendation Agent (one-time per session) and the Check-in Agent (recurring but low per-call). The Continuation Agent is infrequent but high-value.

---

## Implementation Approach

### Step 1: Extract the shared ResearchTool module

Create a shared `ResearchTool` module that wraps Tavily (primary) and Exa (secondary) with a unified interface. This module already partially exists in the Phase 2 pipeline — extract it into a standalone utility.

### Step 2: Add ResearchTool to agent tool definitions

Add the `ResearchTool` to the tool definitions of each agent's system prompt. Include the trigger heuristics above as part of the agent's instructions so it knows when to call research vs. when to proceed without it.

### Step 3: Add a researchLog for auditing and training

Add a `researchLog` field to the session/check-in/continuation records — a JSONB array that captures every research query made, which agent made it, and a summary of what was returned. This becomes a quality assurance tool (you can audit what the agents are researching) and a training data source (you can identify which research queries produced the most valuable results).

### Step 4: Phased rollout

Start with the Recommendation Agent and Check-in Agent as the first two agents to receive research access. These are the highest-value use cases. Add the others incrementally after validating that research improves output quality without unacceptable latency.