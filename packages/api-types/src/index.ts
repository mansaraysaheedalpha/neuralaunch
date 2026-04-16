/**
 * @neuralaunch/api-types — shared API shapes.
 *
 * Every Zod schema and inferred TypeScript type that crosses the wire
 * between the client (Next.js) and the mobile (Expo) app lives here.
 * The client's API routes validate against these schemas. The mobile
 * app parses API responses against the same schemas so backend drift
 * surfaces as a clean validation error instead of a silent crash.
 *
 * Scope: data shapes only. No engine logic, no AI calls, no Prisma,
 * no server-only imports. Everything in this package must run in both
 * Node (client API routes) and React Native (mobile hooks).
 */

// Initial scaffold — real schemas land in later commits of the
// monorepo migration. Re-exports added as each domain moves over:
//   - roadmap.ts       → RoadmapSchema, Roadmap, RoadmapPhase, RoadmapTask
//   - recommendation.ts → RecommendationSchema, Recommendation
//   - checkin.ts       → CheckInEntrySchema, CheckInEntry, TaskStatus
//   - pushback.ts      → PushbackTurnSchema, PushbackTurn
//   - auth.ts          → User, Session
export {};
