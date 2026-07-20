"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildComposerSeedMessage,
  fetchPackagerHandoff,
  readPackagerHandoffParams,
} from "@/app/(app)/tools/packager-handoff";
import type {
  ComposerChannel,
  ComposerMode,
} from "@/lib/roadmap/composer/constants";
import type {
  ComposerOutput,
  ComposerSession,
  OutreachContext,
} from "@/lib/roadmap/composer/schemas";
import { useToolJob } from "@/lib/tool-jobs/use-tool-job";
import {
  fetchCoachChecklistHandoff,
  readCoachHandoffParams,
} from "@/app/(app)/tools/coach-composer-handoff";

export type ComposerStage =
  | "loading"
  | "no_roadmap"
  | "context"
  | "loading_generation"
  | "output";

function updateSessionUrl(sessionId: string | null) {
  const url = new URL(window.location.href);
  if (sessionId) url.searchParams.set("sessionId", sessionId);
  else url.searchParams.delete("sessionId");
  window.history.replaceState({}, "", url.toString());
}

export function useComposerController() {
  const [roadmapId, setRoadmapId] = useState<string | null>(null);
  const [stage, setStage] = useState<ComposerStage>("loading");
  const [context, setContext] = useState<OutreachContext | null>(null);
  const [mode, setMode] = useState<ComposerMode | null>(null);
  const [channel, setChannel] = useState<ComposerChannel | null>(null);
  const [output, setOutput] = useState<ComposerOutput | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sentMessageIds, setSentMessageIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [seedDraft, setSeedDraft] = useState<string>();
  const [meterRefreshKey, setMeterRefreshKey] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const { job: generateJob } = useToolJob({ jobId: generateJobId, roadmapId });

  const refreshUsageAndHistory = useCallback(() => {
    setMeterRefreshKey((key) => key + 1);
    setHistoryRefreshKey((key) => key + 1);
  }, []);

  const hydrateSession = useCallback(
    async (targetRoadmapId: string, targetSessionId: string) => {
      const response = await fetch(
        `/api/discovery/roadmaps/${targetRoadmapId}/composer/sessions/${targetSessionId}`,
      );
      if (!response.ok) return false;
      const data = (await response.json()) as { session: ComposerSession };
      if (!data.session.output) return false;
      setContext(data.session.context);
      setMode(data.session.mode);
      setChannel(data.session.channel);
      setOutput(data.session.output);
      setSessionId(data.session.id);
      setSentMessageIds(
        data.session.sentMessages?.map((item) => item.messageId) ?? [],
      );
      setStage("output");
      return true;
    },
    [],
  );

  const selectSession = useCallback(
    async (targetSessionId: string) => {
      if (!roadmapId) return;
      try {
        if (await hydrateSession(roadmapId, targetSessionId))
          updateSessionUrl(targetSessionId);
      } catch {
        /* The ledger remains available for retry. */
      }
    },
    [hydrateSession, roadmapId],
  );

  const newSession = useCallback(() => {
    setContext(null);
    setMode(null);
    setChannel(null);
    setOutput(null);
    setSessionId(null);
    setSentMessageIds([]);
    setSeedDraft(undefined);
    setError(null);
    setStage("context");
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
        const sessionIdFromUrl = new URL(window.location.href).searchParams.get(
          "sessionId",
        );
        if (sessionIdFromUrl) {
          try {
            if (await hydrateSession(data.roadmapId, sessionIdFromUrl)) return;
          } catch {
            /* Start fresh. */
          }
        }
        const handoffParams = readPackagerHandoffParams();
        if (handoffParams) {
          const handoff = await fetchPackagerHandoff(
            handoffParams.roadmapId,
            handoffParams.sessionId,
          );
          if (handoff) setSeedDraft(buildComposerSeedMessage(handoff));
        }
        const coachHandoffParams = readCoachHandoffParams();
        if (coachHandoffParams) {
          const seed = await fetchCoachChecklistHandoff(coachHandoffParams);
          if (seed) setSeedDraft(seed);
        }
        setStage("context");
      } catch {
        setStage("no_roadmap");
      }
    })();
  }, [hydrateSession]);

  const generate = useCallback(
    async (
      completedContext: OutreachContext,
      completedMode: ComposerMode,
      completedChannel: ComposerChannel,
    ) => {
      if (!roadmapId) return;
      setContext(completedContext);
      setMode(completedMode);
      setChannel(completedChannel);
      setStage("loading_generation");
      setError(null);
      try {
        const response = await fetch(
          `/api/discovery/roadmaps/${roadmapId}/composer/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              context: completedContext,
              mode: completedMode,
              channel: completedChannel,
            }),
          },
        );
        if (!response.ok) {
          const failure = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(failure.error ?? "Could not queue generation.");
        }
        const data = (await response.json()) as {
          jobId: string;
          sessionId: string;
        };
        setSessionId(data.sessionId);
        setGenerateJobId(data.jobId);
        updateSessionUrl(data.sessionId);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Network error — please try again.",
        );
        setStage("context");
        refreshUsageAndHistory();
      }
    },
    [refreshUsageAndHistory, roadmapId],
  );

  useEffect(() => {
    if (generateJob?.stage !== "complete" || !roadmapId || !sessionId) return;
    void hydrateSession(roadmapId, sessionId).finally(() => {
      setGenerateJobId(null);
      refreshUsageAndHistory();
    });
  }, [
    generateJob?.stage,
    hydrateSession,
    refreshUsageAndHistory,
    roadmapId,
    sessionId,
  ]);

  const retryGenerate = useCallback(() => {
    if (!context || !mode || !channel) return;
    setGenerateJobId(null);
    setError(null);
    void generate(context, mode, channel);
  }, [channel, context, generate, mode]);

  return {
    roadmapId,
    stage,
    context,
    mode,
    channel,
    output,
    sessionId,
    sentMessageIds,
    error,
    seedDraft,
    meterRefreshKey,
    historyRefreshKey,
    generateJob,
    refreshUsageAndHistory,
    selectSession,
    newSession,
    generate,
    retryGenerate,
  };
}
