// src/lib/roadmap/roadmap-schema.ts
import { z } from 'zod';

export const RoadmapTaskSchema = z.object({
  title:           z.string().describe('Short action-oriented task title (verb-first, e.g. "Identify 10 potential customers")'),
  description:     z.string().describe('2-3 sentences: what to do, how to do it, and what to produce'),
  rationale:       z.string().describe('One sentence explaining why this task at this point in the journey'),
  timeEstimate:    z.string().describe('Realistic time estimate tied to their available hours, e.g. "3 hours across 2 evenings"'),
  successCriteria: z.string().describe('One concrete, observable signal that this task is done — not "understand X" but "have X in hand"'),
  resources:       z.array(z.string()).optional().describe('Specific tools, platforms, or frameworks relevant to this task'),
});

export const RoadmapPhaseSchema = z.object({
  phase:         z.number().describe('Phase number starting at 1 — must be a whole number'),
  title:         z.string().describe('Name of this phase, e.g. "Foundation" or "First Customer"'),
  objective:     z.string().describe('One sentence: what this phase achieves and why it comes before the next'),
  durationWeeks: z.number().describe('Realistic duration in weeks given their available time — must be a whole number, minimum 1'),
  tasks:         z.array(RoadmapTaskSchema).describe('Between 1 and 5 tasks for this phase'),
});

export const RoadmapSchema = z.object({
  phases:        z.array(RoadmapPhaseSchema).describe('Between 2 and 6 phases in order. A simple sales_motion recommendation might need only 3 phases. A complex build_software recommendation might need 5-6. Do NOT always produce exactly 5 — let the complexity of the recommendation determine the phase count.'),
  closingThought: z.string().describe('2-3 sentences addressed directly to this person: what completing this roadmap means for them specifically, and what the first action is right now'),
});

export type RoadmapTask  = z.infer<typeof RoadmapTaskSchema>;
export type RoadmapPhase = z.infer<typeof RoadmapPhaseSchema>;
export type Roadmap      = z.infer<typeof RoadmapSchema>;
