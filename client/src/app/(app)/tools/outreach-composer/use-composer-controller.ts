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
  const {
    job: generateJob,
    error: generatePollError,
    timedOut: generateTimedOut,
  } = useToolJob({ jobId: generateJobId, roadmapId });
  const generateStage = generateJob?.stage;
  const generateErrorMessage = generateJob?.errorMessage;

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
        if (!(await hydrateSession(roadmapId, targetSessionId))) {
          throw new Error("That saved outreach session could not be loaded.");
        }
        updateSessionUrl(targetSessionId);
        setError(null);
      } catch {
        setError("That saved outreach session could not be loaded. Select it again to retry.");
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
          throw new Error("Could not check your roadmap. Please reload the tool.");
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
            throw new Error("Saved outreach unavailable");
          } catch {
            setError("The requested saved outreach could not be loaded. You can retry it from history.");
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
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load the tool.");
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
    if (!generateStage || !roadmapId || !sessionId) return;
    if (generateStage === "failed") {
      setError(generateErrorMessage ?? "Message generation failed.");
      setGenerateJobId(null);
      setStage("context");
      refreshUsageAndHistory();
      return;
    }
    if (generateStage !== "complete") return;
    void (async () => {
      try {
        if (!(await hydrateSession(roadmapId, sessionId))) {
          throw new Error("The messages were saved but could not be loaded.");
        }
        setGenerateJobId(null);
        setError(null);
        refreshUsageAndHistory();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The saved messages could not be loaded.");
      }
    })();
  }, [
    generateErrorMessage,
    generateStage,
    hydrateSession,
    refreshUsageAndHistory,
    roadmapId,
    sessionId,
  ]);

  const retryGenerate = useCallback(() => {
    if (!context || !mode || !channel) return;
    if (generateJob?.stage === "complete" && roadmapId && sessionId) {
      void hydrateSession(roadmapId, sessionId).then((loaded) => {
        if (!loaded) return;
        setGenerateJobId(null);
        setError(null);
        refreshUsageAndHistory();
      });
      return;
    }
    setGenerateJobId(null);
    setError(null);
    void generate(context, mode, channel);
  }, [channel, context, generate, generateJob?.stage, hydrateSession, mode, refreshUsageAndHistory, roadmapId, sessionId]);

  const operationStatus = generatePollError || generateTimedOut
    ? "running_unknown" as const
    : generateJob?.stage === "complete" && error
      ? "completed_not_loaded" as const
      : "stopped" as const;
  const displayError = error ?? (generatePollError || generateTimedOut
    ? "The server status could not be confirmed. Message generation may still be running."
    : null);

  return {
    roadmapId,
    stage,
    context,
    mode,
    channel,
    output,
    sessionId,
    sentMessageIds,
    error: displayError,
    seedDraft,
    meterRefreshKey,
    historyRefreshKey,
    generateJob,
    operationStatus,
    refreshUsageAndHistory,
    selectSession,
    newSession,
    generate,
    retryGenerate,
  };
}
