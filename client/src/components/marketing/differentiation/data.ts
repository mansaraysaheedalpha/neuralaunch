export type Competitor = {
  id: string;
  name: string;
  /** Position along the journey track, 0-100. Earlier % = the
   *  category drops off sooner in the founder's arc. The spacing
   *  itself communicates the argument — see brief. */
  trackPositionPercent: number;
  /** Verbatim line describing where the competitor stops. */
  stopsAt: string;
  /** Verbatim line describing the matching NeuraLaunch behavior. */
  neuralaunchAnswer: string;
  /** Phases of the journey NeuraLaunch covers that this competitor
   *  doesn't — rendered as small "what this unlocks" pills. */
  unlocks: string[];
};

export const COMPETITORS: Competitor[] = [
  {
    id: "idea-validators",
    name: "Idea validators",
    trackPositionPercent: 18,
    stopsAt:
      "Score your idea against a generic rubric. Send you away with a number.",
    neuralaunchAnswer:
      "Interviews your situation, not your idea. Stays with you through every task that follows.",
    unlocks: ["Roadmap", "Tools", "Check-ins", "Continuation"],
  },
  {
    id: "report-generators",
    name: "Report generators",
    trackPositionPercent: 32,
    stopsAt: "Produce a document. You read it once. You close the tab.",
    neuralaunchAnswer:
      "Produces a roadmap you live inside for weeks, with tools and check-ins built into every step.",
    unlocks: ["Tools", "Check-ins", "Continuation"],
  },
  {
    id: "advice-tools",
    name: "Advice tools",
    trackPositionPercent: 46,
    stopsAt: "Hand you a menu of five options. Wish you luck.",
    neuralaunchAnswer:
      "Gives you one answer, defends it, changes its mind only if you argue well enough.",
    unlocks: ["Commitment", "Defense", "Pushback"],
  },
  {
    id: "chatbots",
    name: "Chatbots",
    trackPositionPercent: 62,
    stopsAt: "Forget every previous conversation when you close the tab.",
    neuralaunchAnswer:
      "Remembers every check-in, every block, every parked idea — and uses them to tell you what you learned.",
    unlocks: ["Memory", "Continuation", "Cross-cycle interpretation"],
  },
  {
    id: "consultants",
    name: "Consultants",
    trackPositionPercent: 80,
    stopsAt: "Cost thousands. Live in one meeting. Disappear.",
    neuralaunchAnswer:
      "There every time you open the tab, at a fraction of the price, with perfect recall.",
    unlocks: ["Daily access", "Perfect recall", "1/30th the cost"],
  },
];

export const JOURNEY_PHASES = [
  "Discovery",
  "Recommendation",
  "Roadmap",
  "Execution",
  "Continuation",
];
