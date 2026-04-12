#!/usr/bin/env tsx
// scripts/export-what-i-got-wrong.ts
//
// A5: standalone admin export script. Queries all roadmaps with a
// non-null continuationBrief, extracts whatIGotWrong alongside the
// original assumptions and recommendation type, and outputs JSONL
// to stdout. Run manually whenever the dataset grows:
//
//   pnpm exec tsx scripts/export-what-i-got-wrong.ts > export.jsonl
//
// The output format is one JSON object per line:
//   {
//     "sessionId": "...",
//     "recommendationType": "...",
//     "originalAssumptions": ["..."],
//     "whatIGotWrong": "...",
//     "forkChosen": "...",
//     "timestamp": "..."
//   }
//
// No UI, no API endpoint, no authentication — this is an offline
// admin tool run from the server or a local checkout with database
// access. The Prisma client connects to whatever DATABASE_URL is
// in the environment.

import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Minimal shape — we only need the fields we export. Using a
// permissive schema so rows with unexpected extra fields don't
// break the export.
const BriefPartialSchema = z.object({
  whatIGotWrong: z.string(),
  forks:        z.array(z.object({ title: z.string() }).passthrough()).optional(),
});

async function main() {
  // Prisma's JSON null filtering requires Prisma.DbNull, not bare null.
  // Explicit select avoids fetching the entire Roadmap row (phases can
  // be 50KB+ of JSONB per row).
  const rows = await prisma.roadmap.findMany({
    where: { continuationBrief: { not: Prisma.DbNull } },
    select: {
      continuationBrief:  true,
      continuationStatus: true,
      createdAt:          true,
      recommendation: {
        select: {
          recommendationType: true,
          assumptions:        true,
          session: { select: { id: true } },
        },
      },
    },
  });

  let exported = 0;
  for (const row of rows) {
    if (!row.continuationBrief || !row.recommendation) continue;

    const briefParsed = BriefPartialSchema.safeParse(row.continuationBrief);
    if (!briefParsed.success) continue;

    // Which forks were available. The first fork is NOT necessarily
    // the one chosen — the actual choice is tracked by the
    // forkRecommendationId linkage, not by array order. Export all
    // titles so the analyst can see the option set.
    const forkTitles = (briefParsed.data.forks ?? []).map(f => f.title);
    const forkSelected = row.continuationStatus === 'FORK_SELECTED';

    const entry = {
      sessionId:           row.recommendation.session?.id ?? 'unknown',
      recommendationType:  row.recommendation.recommendationType ?? 'other',
      originalAssumptions: row.recommendation.assumptions ?? [],
      whatIGotWrong:       briefParsed.data.whatIGotWrong,
      forkTitles,
      forkSelected,
      timestamp:           row.createdAt.toISOString(),
    };

    process.stdout.write(JSON.stringify(entry) + '\n');
    exported++;
  }

  process.stderr.write(`Exported ${exported} entries from ${rows.length} roadmaps.\n`);
}

main()
  .catch(err => {
    process.stderr.write(`Export failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
