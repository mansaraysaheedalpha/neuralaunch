// src/lib/tool-jobs/persistence.ts
//
// Shared persistence helper for the Inngest tool-job workers. The
// persisting step is structurally identical across Research /
// Packager / Composer / Coach: read the freshest roadmap, branch on
// whether the job is task-launched or standalone, write the updated
// session row (either inside task.<x>Session via patchTask or inside
// roadmap.toolSessions[]), and append research-tool calls to the
// roadmap's researchLog if the worker accumulated any.
//
// Pulling this out of each worker keeps every tool-job function under
// the 200-line CLAUDE.md cap and ensures the standalone-vs-task
// branching logic stays consistent — a bug fix here propagates to
// every tool at once.

import 'server-only';
import prisma, { toJsonValue } from '@/lib/prisma';
import {
  StoredPhasesArraySchema,
  readTask,
  patchTask,
} from '@/lib/roadmap/checkin-types';
import {
  safeParseResearchLog,
  appendResearchLog,
  type ResearchLogEntry,
} from '@/lib/research';

/**
 * Names of the per-task JSON-column fields that each tool writes its
 * session row into. Mirrors the keys on StoredRoadmapTask. Keeping
 * this as a literal union (rather than a free string) means typos
 * like 'researchSesion' are caught at compile time.
 */
export type TaskSessionField =
  | 'researchSession'
  | 'packagerSession'
  | 'composerSession'
  | 'coachSession';

export interface PersistToolJobResultInput {
  roadmapId: string;
  userId:    string;
  sessionId: string;
  /** When set the worker writes into task.<taskField>; otherwise into
   *  roadmap.toolSessions[]. */
  taskId:    string | null;
  /** Which task JSON column to write to when taskId is set. Ignored
   *  for standalone runs. */
  taskField: TaskSessionField;
  /**
   * Builds the next session row from the existing one (or `null` if
   * none exists). Implementations should spread `existing ?? {}` to
   * preserve fields the worker doesn't own (e.g. createdAt) and
   * stamp `updatedAt` themselves.
   */
  buildSession: (
    existing: Record<string, unknown> | null,
  ) => Record<string, unknown>;
  /** Optional research-tool calls accumulated during the run. */
  researchAccumulator?: ResearchLogEntry[];
}

/**
 * Persist a tool-job's result. Routes both standalone (toolSessions
 * array on the roadmap) and task-launched (task.<x>Session via
 * patchTask) shapes through one entry point. Throws on any structural
 * mismatch (roadmap missing, phases malformed, task missing) so the
 * worker's catch can flip the ToolJob to 'failed'.
 */
export async function persistToolJobResult(input: PersistToolJobResultInput): Promise<void> {
  const { roadmapId, userId, sessionId, taskId, taskField, buildSession } = input;
  const accumulator = input.researchAccumulator ?? [];

  if (taskId) {
    const fresh = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { phases: true, researchLog: true },
    });
    if (!fresh) throw new Error('Roadmap disappeared mid-execution');

    const phasesParsed = StoredPhasesArraySchema.safeParse(fresh.phases);
    if (!phasesParsed.success) throw new Error('Phases failed schema parse');

    const found = readTask(phasesParsed.data, taskId);
    if (!found) throw new Error('Task not found mid-execution');

    const existing = (found.task[taskField] ?? null) as Record<string, unknown> | null;
    const nextSession = buildSession(existing);
    const next = patchTask(phasesParsed.data, taskId, t => ({
      ...t,
      [taskField]: nextSession,
    }));
    if (!next) throw new Error('patchTask returned null mid-execution');

    const nextLog = accumulator.length > 0
      ? appendResearchLog(safeParseResearchLog(fresh.researchLog), accumulator)
      : null;

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  {
        phases: toJsonValue(next),
        ...(nextLog ? { researchLog: toJsonValue(nextLog) } : {}),
      },
    });
    return;
  }

  // Standalone path — roadmap.toolSessions[] keyed by sessionId.
  const fresh = await prisma.roadmap.findFirst({
    where:  { id: roadmapId, userId },
    select: { toolSessions: true, researchLog: true },
  });
  if (!fresh) throw new Error('Roadmap disappeared mid-execution');

  const rawSessions: Array<Record<string, unknown>> = Array.isArray(fresh.toolSessions)
    ? (fresh.toolSessions as Array<Record<string, unknown>>)
    : [];
  const existing = rawSessions.find(s => s['id'] === sessionId) ?? null;
  const updatedSession = buildSession(existing);
  const others = rawSessions.filter(s => s['id'] !== sessionId);

  const nextLog = accumulator.length > 0
    ? appendResearchLog(safeParseResearchLog(fresh.researchLog), accumulator)
    : null;

  await prisma.roadmap.update({
    where: { id: roadmapId },
    data:  {
      toolSessions: toJsonValue([...others, updatedSession]),
      ...(nextLog ? { researchLog: toJsonValue(nextLog) } : {}),
    },
  });
}
