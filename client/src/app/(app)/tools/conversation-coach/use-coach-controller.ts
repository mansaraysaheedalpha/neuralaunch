"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildCoachSeedFromComposerMessage,
  fetchComposerHandoff,
  readComposerHandoffParams,
} from "@/app/(app)/tools/composer-handoff";
import {
  buildCoachSeedMessage,
  fetchPackagerHandoff,
  readPackagerHandoffParams,
} from "@/app/(app)/tools/packager-handoff";
import type {
  CoachSession,
  ConversationSetup,
  Debrief,
  PreparationPackage,
} from "@/lib/roadmap/coach";
import { useToolJob } from "@/lib/tool-jobs/use-tool-job";

export type CoachStage =
  | "loading"
  | "no_roadmap"
  | "setup"
  | "loading_preparation"
  | "preparation"
  | "roleplay"
  | "loading_debrief"
  | "debrief"
  | "done";

function updateSessionUrl(sessionId: string | null) {
  const url = new URL(window.location.href);
  if (sessionId) url.searchParams.set("sessionId", sessionId);
  else url.searchParams.delete("sessionId");
  window.history.replaceState({}, "", url.toString());
}

export function useCoachController() {
  const [roadmapId, setRoadmapId] = useState<string | null>(null);
  const [stage, setStage] = useState<CoachStage>("loading");
  const [setup, setSetup] = useState<ConversationSetup | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [preparation, setPreparation] = useState<PreparationPackage | null>(
    null,
  );
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seedDraft, setSeedDraft] = useState<string>();
  const [meterRefreshKey, setMeterRefreshKey] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [prepareJobId, setPrepareJobId] = useState<string | null>(null);
  const { job: prepareJob } = useToolJob({ jobId: prepareJobId, roadmapId });

  const refreshUsageAndHistory = useCallback(() => {
    setMeterRefreshKey((key) => key + 1);
    setHistoryRefreshKey((key) => key + 1);
  }, []);

  const applySession = useCallback((session: CoachSession) => {
    setSessionId(session.id);
    setSetup(session.setup);
    if (session.debrief) {
      setDebrief(session.debrief);
      setStage("debrief");
    } else if (session.rolePlayHistory?.length) {
      setPreparation(session.preparation ?? null);
      setStage("roleplay");
    } else if (session.preparation) {
      setPreparation(session.preparation);
      setStage("preparation");
    } else setStage("setup");
  }, []);

  const hydrateSession = useCallback(
    async (targetRoadmapId: string, targetSessionId: string) => {
      const response = await fetch(
        `/api/discovery/roadmaps/${targetRoadmapId}/coach/sessions/${targetSessionId}`,
      );
      if (!response.ok) return false;
      const data = (await response.json()) as { session: CoachSession };
      applySession(data.session);
      return true;
    },
    [applySession],
  );

  const selectSession = useCallback(
    async (targetSessionId: string) => {
      if (!roadmapId) return;
      try {
        if (await hydrateSession(roadmapId, targetSessionId))
          updateSessionUrl(targetSessionId);
      } catch {
        /* Retry remains available. */
      }
    },
    [hydrateSession, roadmapId],
  );

  const newSession = useCallback(() => {
    setSetup(null);
    setSessionId(null);
    setPreparation(null);
    setDebrief(null);
    setSeedDraft(undefined);
    setError(null);
    setStage("setup");
    updateSessionUrl(null);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/discovery/roadmaps/has-any");
        if (!response.ok) {
          setStage("no_roadmap");
          return;
        }
        const data = (await response.json()) as {
          hasRoadmap: boolean;
          roadmapId?: string;
        };
        if (!data.hasRoadmap || !data.roadmapId) {
          setStage("no_roadmap");
          return;
        }
        setRoadmapId(data.roadmapId);
        const restoreId = new URLSearchParams(window.location.search).get(
          "sessionId",
        );
        if (restoreId) {
          try {
            if (await hydrateSession(data.roadmapId, restoreId)) return;
          } catch {
            /* Continue to handoff. */
          }
        }
        const composerParams = readComposerHandoffParams();
        if (composerParams) {
          const handoff = await fetchComposerHandoff(
            composerParams.roadmapId,
            composerParams.sessionId,
            composerParams.messageId,
          );
          if (handoff) setSeedDraft(buildCoachSeedFromComposerMessage(handoff));
        } else {
          const packagerParams = readPackagerHandoffParams();
          if (packagerParams) {
            const handoff = await fetchPackagerHandoff(
              packagerParams.roadmapId,
              packagerParams.sessionId,
            );
            if (handoff) setSeedDraft(buildCoachSeedMessage(handoff));
          }
        }
        setStage("setup");
      } catch {
        setStage("no_roadmap");
      }
    })();
  }, [hydrateSession]);

  const prepare = useCallback(
    async (completed: ConversationSetup, completedSessionId?: string) => {
      if (!roadmapId || !completedSessionId) {
        setError("Setup completed but no session was returned.");
        return;
      }
      setSetup(completed);
      setSessionId(completedSessionId);
      setStage("loading_preparation");
      setError(null);
      updateSessionUrl(completedSessionId);
      try {
        const response = await fetch(
          `/api/discovery/roadmaps/${roadmapId}/coach/prepare`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: completedSessionId }),
          },
        );
        if (!response.ok) {
          const failure = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(failure.error ?? "Could not queue preparation.");
        }
        const data = (await response.json()) as { jobId: string };
        setPrepareJobId(data.jobId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Network error.");
        setStage("setup");
        refreshUsageAndHistory();
      }
    },
    [refreshUsageAndHistory, roadmapId],
  );

  useEffect(() => {
    if (prepareJob?.stage !== "complete" || !roadmapId || !sessionId) return;
    void hydrateSession(roadmapId, sessionId).finally(() => {
      setPrepareJobId(null);
      refreshUsageAndHistory();
    });
  }, [
    hydrateSession,
    prepareJob?.stage,
    refreshUsageAndHistory,
    roadmapId,
    sessionId,
  ]);

  const retryPrepare = useCallback(() => {
    if (!setup || !sessionId) return;
    setPrepareJobId(null);
    setError(null);
    void prepare(setup, sessionId);
  }, [prepare, sessionId, setup]);

  const endRolePlay = useCallback(async () => {
    if (!roadmapId || !sessionId) return;
    setStage("loading_debrief");
    setError(null);
    try {
      const response = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/coach/debrief`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        },
      );
      if (!response.ok) throw new Error("Could not generate the debrief.");
      const data = (await response.json()) as { debrief: Debrief };
      setDebrief(data.debrief);
      setStage("debrief");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Network error.");
      setStage("roleplay");
    } finally {
      refreshUsageAndHistory();
    }
  }, [refreshUsageAndHistory, roadmapId, sessionId]);

  return {
    roadmapId,
    stage,
    setup,
    sessionId,
    preparation,
    debrief,
    error,
    seedDraft,
    meterRefreshKey,
    historyRefreshKey,
    prepareJob,
    refreshUsageAndHistory,
    selectSession,
    newSession,
    prepare,
    retryPrepare,
    endRolePlay,
    setStage,
  };
}
