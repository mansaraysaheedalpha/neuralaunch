import { describe, expect, it } from "vitest";
import { GeneratedDebriefSchema } from "./generated-debrief-schema";
import { validatePreparationHandoffs } from "./handoff-validation";
import { DebriefSchema, PreparationPackageSchema } from "./schemas";

const legacyDebrief = {
  whatWentWell: ["The founder made a direct ask."],
  whatToWatchFor: ["The founder softened the fallback under pressure."],
};

const readinessVerdict = {
  status: "rehearse_once_more" as const,
  summary: "One focused rehearsal is needed before the real conversation.",
  evidence: ["The ask was clear, but the fallback was abandoned in turn four."],
  primaryRisk: "Conceding before the buyer responds to the first fallback.",
  nextAction: "Repeat the price-objection exchange while holding the fallback.",
  nextActionTiming: "Before contacting the buyer.",
  readyWhen: [
    "The fallback is stated once without apologising or discounting.",
  ],
  reconsiderWhen: ["A new objection exposes a missing fallback position."],
};

const preparation = PreparationPackageSchema.parse({
  openingScript: "Hello, I would like to discuss a trial.",
  keyAsks: [{ ask: "Agree to a trial", whyItMatters: "It tests real demand." }],
  objections: [
    {
      objection: "Too expensive",
      response: "Start with the trial.",
      groundedIn: "Offer scope",
    },
  ],
  fallbackPositions: [
    { trigger: "They decline", fallback: "Ask for a referral." },
  ],
  postConversationChecklist: [
    { condition: "They agree", action: "Send confirmation." },
  ],
  rolePlaySetup: {
    personality: "Direct",
    motivations: "Reduce risk",
    probableConcerns: ["Price"],
    powerDynamic: "Buyer",
    communicationStyle: "Concise",
  },
});

describe("Coach decision contracts", () => {
  it("keeps legacy debriefs readable but requires verdicts from new generations", () => {
    expect(DebriefSchema.safeParse(legacyDebrief).success).toBe(true);
    expect(GeneratedDebriefSchema.safeParse(legacyDebrief).success).toBe(false);
    expect(
      GeneratedDebriefSchema.safeParse({ ...legacyDebrief, readinessVerdict })
        .success,
    ).toBe(true);
  });

  it("accepts complete Composer checklist handoffs", () => {
    const item = {
      condition: "They agree",
      action: "Send confirmation.",
      suggestedTool: "outreach_composer" as const,
      composerContext: {
        recipient: "A hotel manager",
        conversationOutcome: "Trial agreed",
        channel: "whatsapp" as const,
        messageGoal: "Confirm the trial details",
      },
    };
    expect(() =>
      validatePreparationHandoffs({
        ...preparation,
        postConversationChecklist: [item],
      }),
    ).not.toThrow();
  });

  it("rejects checklist handoffs missing either the tool or context", () => {
    const malformed = {
      ...preparation,
      postConversationChecklist: [
        {
          condition: "They agree",
          action: "Send confirmation.",
          suggestedTool: "outreach_composer" as const,
        },
      ],
    };
    expect(() => validatePreparationHandoffs(malformed)).toThrow(
      "both tool and Composer context",
    );
  });
});
