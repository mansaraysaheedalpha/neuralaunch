# NeuraLaunch Roadmap Continuation + Execution Support — Final Specification

---

## The Product Insight

Right now NeuraLaunch has a cliff edge. The founder goes through a rich journey — discovery interview, recommendation, pushback, acceptance, roadmap generation, task execution with check-ins — and then nothing. The roadmap ends. The founder is alone again. The relationship that felt like having a strategic co-founder evaporates at the exact moment the founder has the most momentum, the most evidence, and the most questions about what comes next.

That cliff is where competitors win. Not because they're better at the initial recommendation — our engine is genuinely exceptional at that — but because they stay. The founder who just finished a 6-week customer discovery sprint and has real data doesn't need a new platform. They need the same advisor who understood their context from the beginning to say "here's what the data means and here's what to do next."

---

## What Continuation Is NOT

**It is NOT a new discovery session.** The founder shouldn't have to re-explain their situation from scratch. The belief state, the recommendation history, the pushback transcript, the check-in history, the roadmap progress — all of that is already in the system. Continuation reads from it, not on top of it.

**It is NOT an infinite roadmap generator.** "Generate another roadmap" is lazy and produces diminishing quality. The second roadmap should be a fundamentally different shape than the first because the founder has done things and has evidence now.

**It is NOT a chat.** The discovery interview is conversational because the engine needs to gather context. Continuation doesn't need to gather context — it already has it. The shape should be more directive: "here's what I see in your data, here are your options, pick one."

---

## What Continuation IS

A strategic checkpoint that reads the founder's execution evidence and produces the next decision.

---

## The Motivation Anchor

During every Phase 1 interview, the engine asks a question along the lines of: "What makes you want to pursue this?" The answer gets stored as a first-class field in the belief state — not buried in the transcript, but explicitly tagged as the founder's core motivation.

This serves two critical purposes downstream. First, during roadmap execution, if check-in patterns suggest declining engagement, the Inngest nudge can reference it directly: "You told me you started this because [motivation]. That hasn't changed — the work in front of you is the bridge to it." Second, when the "What's Next?" button triggers a diagnostic (see below), the agent uses the motivation anchor to distinguish between "I lost motivation" (where re-anchoring helps) and "the roadmap doesn't fit my reality" (where re-anchoring is irrelevant and the agent should pivot instead).

---

## The "What's Next?" Button

The button is always visible and always active on the roadmap page — never greyed out, never hidden. When clicked, the engine runs a checkpoint evaluation based on the founder's actual progress and enters one of four modes:

### Scenario A — Zero tasks completed

The engine does not proceed to continuation. It enters diagnostic mode and surfaces targeted questions: "You haven't started any tasks from your roadmap yet. I want to understand what's happening." The agent asks suggestive, non-judgmental questions to identify the real blocker: Does the roadmap not align to what you can realistically do? Are the steps unclear or overwhelming? Is something in your life blocking you? Are you unsure where to start? The agent reasons through whatever the founder gives it and responds accordingly — breaking tasks down, adjusting the approach, or re-anchoring with the motivation if the issue is focus or consistency.

### Scenario B — Partial completion (under 70%)

The engine asks why the remaining tasks are unfinished before generating continuation. Not as a gate, but as genuine inquiry: "You've made real progress on X but left Y and Z incomplete — any reason?" The agent reasons through the founder's response. If the reason is legitimate (a task became irrelevant, external circumstances shifted, the market gave a signal that made a task unnecessary), the engine accepts it and proceeds to continuation with that context. If the reason signals lost focus, inconsistency, or avoidance, the engine draws from the motivation anchor to re-engage the founder before offering continuation.

### Scenario C — 70%+ completed, or all final-phase tasks done

Full continuation brief generated. The engine proceeds to the standard synthesis/fork/parking-lot flow.

### Scenario D — 100% completion

Cleanest path. Full continuation brief with the strongest possible evidence base.

---

## Mid-Roadmap Execution Support

Continuation addresses what happens after the roadmap. But there is an equally important problem: what happens when a founder gets stuck during the roadmap. The founder should never feel alone between check-ins. The roadmap is not a PDF they received — it is a living system with an agent behind it that can help at any point.

### When the founder doesn't understand a task

The agent breaks the task into sub-steps. If the original task was "run 10 customer discovery conversations this week," the sub-steps become: write a 3-sentence outreach script, list 15 people you could contact, send 5 messages today, log each response in your tracking sheet. The agent makes the abstract concrete.

### When the founder doesn't know what tools to use

The agent recommends specific tools — both internal (NeuraLaunch's validation page, the pushback system) and external (Google Forms, Canva, WhatsApp Business, specific free-tier SaaS tools relevant to the task). Recommendations are specific to the founder's context and budget, not generic lists.

### When the founder gets stuck midway through a task

The agent helps navigate the sticking point. If the task assumed a condition that doesn't hold (e.g., "contact 10 restaurant owners" but the founder can only find 3), the agent either helps find a different approach to the same goal, helps break through the specific obstacle, or — if the task is genuinely blocked — pivots the founder to an alternative path that achieves the same phase objective through a different route.

### When the roadmap itself is misaligned

Sometimes a founder executes a few tasks and realises the whole direction is off. The agent detects this pattern (multiple blocked tasks, negative check-in sentiment, explicit "this doesn't feel right" signals) and proactively offers a mid-roadmap recalibration — not a full restart, but an adjustment to the remaining phases based on what execution has revealed.

---

## The Continuation Brief

When the checkpoint evaluation clears (Scenario C or D, or Scenario B with a legitimate reason), the continuation engine reads the full execution record — which tasks were completed, which were blocked, what the check-in transcripts said, whether the flagged-fundamental escape hatch was triggered, what the validation page signal was (if Phase 3 was used), how long things actually took vs. the estimates — and produces a structured document with five sections:

### 1. What Happened

A 3-4 sentence synthesis of the execution. Not a list of completed tasks — an interpretation of what the founder learned by doing them. This is where Opus handles the synthesis, not Sonnet. The interpretation quality is the entire value proposition of continuation.

### 2. What I Got Wrong

The engine explicitly names where the original recommendation's assumptions, market hypotheses, or time estimates diverged from what actually happened. Example: "I recommended you start with restaurants but your check-in data shows your strongest traction came from catering companies — the original market assumption was wrong, and the fork below reflects that." This builds trust by demonstrating intellectual honesty and produces the single most valuable training signal for fine-tuning: labelled examples of recommendation-reality divergence.

### 3. What the Evidence Says

The strongest signal from check-in data, validation data, and any feedback collected. Specific and interpretive: "You contacted 15 restaurants and 8 said they're interested but only 2 scheduled a demo — the interest-to-commitment gap suggests your pitch lands but your close doesn't."

### 4. The Fork

2-3 possible next directions. Each one has a concrete first step, a time estimate calibrated to the founder's actual execution speed (see below), and a "this is right if..." condition. Not a menu to pick from — a decision to make. The phase count of the resulting roadmap is driven by which fork the founder chooses, not by a default. "Double down on what's working" might produce 2-3 phases. "Pivot to the adjacent opportunity from the parking lot" might need 4-5 because it's partially new territory.

### 5. The Parking Lot

Every idea, opportunity, or adjacent direction the founder mentioned during check-ins, the interview, or pushback that wasn't part of the current roadmap. Surfaced now because this is the moment they're relevant. Rendered as "Ideas you mentioned along the way" with the context of when and where each was mentioned.

---

## The Parking Lot — Implementation

A JSONB array on the Roadmap row (or Recommendation row). Each item:

```json
{
  "idea": "string",
  "surfacedAt": "ISO date",
  "surfacedFrom": "checkin | interview | pushback",
  "taskContext": "string"
}
```

### Population from two sources

**Automatic** — add a field to the check-in agent's response schema: `parkingLotItem?: { idea: string }`. The agent captures adjacent opportunities it detects in the founder's check-in text.

**Manual** — a "Park this idea" button on the roadmap page where the founder can type something they want to remember but not act on yet.

### Surfacing

The parking lot is rendered in the continuation brief under section 5. Each item shows the idea, the date it was mentioned, and the context it came from.

---

## Execution Speed Calibration

When the next roadmap is generated after continuation, if the engine adjusts the timeline based on actual vs. estimated execution pace, it states the adjustment explicitly: "Your first roadmap was calibrated to 10 hours/week but your check-in pattern suggests you're operating closer to 5-6 hours. This roadmap is built around that real pace."

The engine also distinguishes between "this person is slower than they estimated" and "this task was genuinely harder than expected." The check-in transcripts contain enough signal to make that distinction. Transparency over silent correction — a roadmap that explains its calibration builds trust, a roadmap that silently doubles the timeline feels patronising.

---

## The Cycle

Founder completes roadmap → hits "What's Next?" → engine evaluates progress and enters the appropriate scenario → if ready, produces Continuation Brief → founder picks a fork → next roadmap generates (shorter, more specific, evidence-grounded, speed-calibrated) → founder executes with mid-roadmap support available at any time → cycle repeats.

Each cycle makes the engine smarter about that specific founder. The belief state grows. The parking lot accumulates. The speed calibration sharpens. The "What I got wrong" section produces training data. The relationship deepens instead of ending.