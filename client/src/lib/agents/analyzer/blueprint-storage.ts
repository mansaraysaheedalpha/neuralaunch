import type { Prisma } from "@prisma/client";
import type { ParsedBlueprint } from "@/lib/parsers/blueprint-parser";

export type ParsedBlueprintJson = Omit<ParsedBlueprint, "extractedAt"> & {
  extractedAt: string;
};

export interface StoredBlueprint {
  raw: string;
  parsed: ParsedBlueprintJson;
}

export const serializeParsedBlueprint = (
  parsed: ParsedBlueprint
): ParsedBlueprintJson => ({
  ...parsed,
  extractedAt: parsed.extractedAt.toISOString(),
});

export const serializeBlueprintForStorage = (
  rawBlueprint: string,
  parsedBlueprint: ParsedBlueprint
): Prisma.JsonObject => ({
  raw: rawBlueprint,
  parsed: serializeParsedBlueprint(parsedBlueprint) as unknown as Prisma.JsonValue,
} as Prisma.JsonObject);

export const deserializeParsedBlueprint = (
  parsedBlueprint: ParsedBlueprintJson
): ParsedBlueprint => ({
  ...parsedBlueprint,
  extractedAt: new Date(parsedBlueprint.extractedAt),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isParsedBlueprintJson = (value: unknown): value is ParsedBlueprintJson => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.projectName === "string" &&
    typeof value.extractedAt === "string" &&
    Array.isArray(value.features) &&
    Array.isArray(value.techStack) &&
    Array.isArray(value.successMetrics) &&
    Array.isArray(value.pricingTiers)
  );
};

export const parseStoredBlueprint = (
  value: Prisma.JsonValue | null | undefined
): StoredBlueprint | null => {
  if (!isRecord(value)) {
    return null;
  }

  const { raw, parsed } = value;

  if (typeof raw !== "string" || !isParsedBlueprintJson(parsed)) {
    return null;
  }

  return { raw, parsed };
};
