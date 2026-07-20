import { describe, expect, it } from "vitest";
import { GeneratedServicePackageSchema } from "./generated-package-schema";
import {
  PackageDecisionSchema,
  validatePackageDecision,
} from "./package-decision-schema";
import { ServicePackageSchema } from "./schemas";

const decision = {
  recommendedTierName: "standard",
  recommendation:
    "Lead with Standard because it balances scope and buyer risk.",
  confidence: "medium" as const,
  learned: ["The target buyer values predictable turnaround."],
  nextTest: {
    audience: "Independent hotels in Accra",
    sampleSize: 10.8,
    action: "Send the Standard offer and ask for a paid two-week trial.",
    successSignal: "At least two buyers request a call or trial.",
    deadlineGuidance: "Complete outreach within the next seven days.",
  },
  reconsiderWhen: ["Fewer than two qualified buyers respond after ten sends."],
};

const legacyPackage = {
  serviceName: "PremiumPress",
  targetClient: "Independent hotels in Accra",
  included: [
    { item: "Linen care", description: "Collection, cleaning, and return." },
  ],
  notIncluded: ["Dry cleaning"],
  tiers: [
    {
      name: "standard",
      displayName: "Managed Care",
      price: "GHS 40",
      period: "per kg",
      description: "Predictable commercial linen care.",
      features: ["Collection", "24-hour turnaround", "Labelled return"],
      justification: "Positioned within the observed local commercial range.",
    },
  ],
  revenueScenarios: [
    {
      label: "conservative",
      clients: 2,
      tierMix: "2 Standard",
      monthlyRevenue: "GHS 8,000",
      weeklyHours: "20 hours",
    },
  ],
  brief: "PremiumPress offer",
  briefFormat: "whatsapp" as const,
};

describe("PackageDecisionSchema", () => {
  it("normalizes the prospect sample to a positive whole number", () => {
    expect(PackageDecisionSchema.parse(decision).nextTest.sampleSize).toBe(10);
  });

  it("rejects a recommendation for a tier that does not exist", () => {
    expect(() =>
      validatePackageDecision(decision, ["basic", "premium"]),
    ).toThrow("unknown tier");
  });

  it("rejects decisions without learning or reconsideration evidence", () => {
    expect(() =>
      validatePackageDecision({ ...decision, learned: [] }, ["standard"]),
    ).toThrow("at least one learning");
    expect(() =>
      validatePackageDecision({ ...decision, reconsiderWhen: [] }, [
        "standard",
      ]),
    ).toThrow("reconsideration evidence");
  });

  it("keeps packages created before decision support readable", () => {
    expect(ServicePackageSchema.safeParse(legacyPackage).success).toBe(true);
  });

  it("requires a decision from every new model generation", () => {
    expect(GeneratedServicePackageSchema.safeParse(legacyPackage).success).toBe(
      false,
    );
    expect(
      GeneratedServicePackageSchema.safeParse({ ...legacyPackage, decision })
        .success,
    ).toBe(true);
  });
});
