// src/inngest/functions/transformation-report-function.ts
//
// Durable execution for the Transformation Report — the once-per-
// venture personal narrative the founder gets when they Mark
// Complete. Mirrors the tool-jobs pattern (loading_data → drafting
// → persisting → notify) but writes through the venture-scoped
// TransformationReport row instead of a roadmap-scoped ToolJob.
//
// Tab-close survival is automatic: each step.run boundary writes
// the stage to the durable row, the result lands on completion
// regardless of whether the founder is still on the page, and a
// push notification fires so a backgrounded founder finds out
// when their report is ready.

import { inngest } from '../client';
import { logger } from '@/lib/logger';
import {
  TRANSFORMATION_REPORT_EVENT,
  loadVentureEvidenceBundle,
  generateTransformationReport,
  updateTransformationStage,
  completeTransformationReport,
  failTransformationReport,
  notifyTransformationComplete,
  notifyTransformationFailed,
} from '@/lib/transformation';

export const transformationReportFunction = inngest.createFunction(
  {
    id:      'discovery-transformation-report',
    name:    'Discovery — Transformation Report',
    // Single retry on Inngest's transient infrastructure errors;
    // withModelFallback inside the engine owns its own one-shot
    // retry on Anthropic overload.
    retries: 1,
    triggers: [{ event: TRANSFORMATION_REPORT_EVENT }],
  },
  async ({ event, step }) => {
    const { reportId, ventureId, userId } = event.data as {
      reportId:  string;
      ventureId: string;
      userId:    string;
    };
    const log = logger.child({
      inngestFunction: 'transformationReport',
      reportId,
      ventureId,
      userId,
      runId:           event.id,
    });

    // Look up ventureName once for push-notification copy. Best-
    // effort — if the venture vanished between the event firing
    // and now, the worker still tries to do its job and only the
    // push label degrades.
    let ventureName = 'your venture';

    try {
      // -----------------------------------------------------------------
      // Stage 1 — load evidence bundle
      //
      // One read pulls the entire venture surface: cycles, belief
      // states, recommendations + pushback, every roadmap's phases /
      // tasks / check-ins / tool sessions, founder profile, validation
      // signal, parking lot. The engine does no further DB work.
      // -----------------------------------------------------------------
      const bundle = await step.run('loading_data', async () => {
        await updateTransformationStage(reportId, 'loading_data');
        const evidence = await loadVentureEvidenceBundle({ userId, ventureId });
        if (!evidence) {
          throw new Error(`Venture ${ventureId} not found or not owned by user`);
        }
        ventureName = evidence.ventureName;
        return evidence;
      });

      ventureName = bundle.ventureName;

      // -----------------------------------------------------------------
      // Stage 2 — narrative synthesis
      //
      // Opus 4.7 reads the prose-rendered evidence bundle and
      // returns a TransformationReportSchema-validated object. The
      // engine wraps the call in withModelFallback so a transient
      // overload falls back to Opus 4.6 for one shot.
      // -----------------------------------------------------------------
      const report = await step.run('drafting', async () => {
        await updateTransformationStage(reportId, 'drafting');
        return await generateTransformationReport(bundle);
      });

      // -----------------------------------------------------------------
      // Stage 3 — persist + complete
      //
      // The redaction-candidate detection step is intentionally
      // skipped in this commit. Commit 3 will insert a
      // 'detecting_redactions' step here that runs the redaction
      // detector and writes redactionCandidates before completing.
      // -----------------------------------------------------------------
      await step.run('persisting', async () => {
        await updateTransformationStage(reportId, 'persisting');
        await completeTransformationReport(reportId, report);
      });

      // -----------------------------------------------------------------
      // Stage 4 — notify (best-effort)
      // -----------------------------------------------------------------
      await step.run('notify-and-complete', async () => {
        await notifyTransformationComplete({ userId, ventureId, ventureName });
      });

      log.info('[TransformationReport] Done', {
        sections:        report.sectionOrder.length,
        customSections:  report.customSections?.length ?? 0,
        cycles:          bundle.cycleCount,
      });

      return { ok: true, reportId };
    } catch (err) {
      log.error(
        '[TransformationReport] Failed',
        err instanceof Error ? err : new Error(String(err)),
      );
      const errorMessage = err instanceof Error ? err.message : String(err);

      await failTransformationReport(reportId, err);
      // Best-effort failure push so a backgrounded founder finds
      // out without re-opening the tab.
      await notifyTransformationFailed({
        userId,
        ventureId,
        ventureName,
        errorMessage,
      });

      // Re-throw so Inngest records the failure on the run record.
      // retries: 1 gives one more attempt at transient failures
      // (e.g. brief Anthropic overload exhausting both primary +
      // fallback inside withModelFallback).
      throw err;
    }
  },
);
