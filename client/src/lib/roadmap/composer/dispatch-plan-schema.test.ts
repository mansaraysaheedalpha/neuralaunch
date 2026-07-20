import { describe, expect, it } from "vitest";
import { ComposerOutputSchema, GeneratedComposerOutputSchema } from "./schemas";
import {
  DispatchPlanSchema,
  validateDispatchPlanForMessages,
} from "./dispatch-plan-schema";

const plan = {
  recommendedMessageId: "cm_1",
  recommendationReason: "It makes the smallest concrete ask.",
  firstRecipients: [
    {
      description: "Three prior interview participants",
      priority: 1,
      reason: "They already know the problem.",
    },
  ],
  timing: {
    sendBy: "Within the next working day",
    followUpAfter: "Five days without a response",
  },
  responseSignals: {
    strongInterest: ["Requests a call or asks how to start"],
    weakInterest: ["Asks a general question without committing"],
    rejection: ["Explicitly declines or asks not to be contacted"],
  },
  stopRule:
    "Stop immediately on an explicit no; otherwise stop after the final follow-up.",
  changeMessageWhen: [
    "Qualified recipients read but do not respond after the full sequence",
  ],
  changeAudienceWhen: [
    "Recipients consistently say the problem is not relevant to their role",
  ],
};

const message = {
  id: "cm_1",
  body: "Could we discuss this?",
  annotation: "A small direct ask.",
};

describe("DispatchPlanSchema", () => {
  it("parses a complete operational dispatch plan", () => {
    expect(DispatchPlanSchema.parse(plan)).toMatchObject(plan);
  });

  it("rejects a recommendation that references an unknown message", () => {
    expect(() =>
      validateDispatchPlanForMessages(DispatchPlanSchema.parse(plan), ["cm_2"]),
    ).toThrow("unknown message id");
  });

  it("rejects a plan without initial recipients", () => {
    const parsed = DispatchPlanSchema.parse({ ...plan, firstRecipients: [] });
    expect(() => validateDispatchPlanForMessages(parsed, ["cm_1"])).toThrow(
      "at least one initial recipient",
    );
  });

  it("keeps legacy persisted output readable", () => {
    expect(
      ComposerOutputSchema.safeParse({ messages: [message] }).success,
    ).toBe(true);
  });

  it("requires dispatch plans for newly generated output", () => {
    expect(
      GeneratedComposerOutputSchema.safeParse({ messages: [message] }).success,
    ).toBe(false);
    expect(
      GeneratedComposerOutputSchema.safeParse({
        messages: [message],
        dispatchPlan: plan,
      }).success,
    ).toBe(true);
  });
});
