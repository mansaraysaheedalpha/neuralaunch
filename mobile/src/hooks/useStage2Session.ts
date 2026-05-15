// src/hooks/useStage2Session.ts
//
// Mobile counterpart to
// client/src/app/(app)/discovery/no-idea/[sessionId]/useStage2Session.ts.
// Drives the Stage 2 (Outcome Requirements) chat surface and the
// skill-canvas action dispatchers. The contract mirrors the web hook
// exactly so behaviour stays in lock-step.
//
// Two response shapes for the streaming turn route
// (POST /api/discovery/sessions/[sessionId]/turn — same endpoint as
// Stage 1; the server routes by scenario + active stage):
//
//   - text/plain stream   → accumulate tokens into the latest
//                            assistant message. After the stream
//                            completes, fire onTurnComplete so the
//                            parent screen refetches — the agent's
//                            extractor may have applied tier updates
//                            during the turn that the canvas needs
//                            to see.
//   - application/json    → terminal:
//                            * 200 + { status: 'output_ready', stageNumber: 2 }
//                              → status='composing'; parent watches
//                                via useEffect and refetches into
//                                RequirementsDocumentView.
//                            * 403 + { sessionTerminated, error }
//                              → status='terminated'.
//                            * other → status='error'.
//
// Canvas action dispatchers (skill-tier / teammate / derive-expected-
// profile) hit dedicated narrow routes. Each is atomic on the server
// side (skill-tier + teammate dual-write into FounderProfile inside
// a Prisma transaction); the caller awaits the dispatcher and then
// invokes its own refetch helper to re-render the canvas. Errors are
// captured into turnError so the UI can surface them without the
// caller needing a separate try/catch.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getToken, API_BASE_URL, api } from '@/services/api-client';
import type { SkillKey, SkillTier } from '@/lib/ideation-types';

export type Stage2Message = {
  id:          string;
  role:        'user' | 'assistant';
  content:     string;
  inputMethod: 'voice' | null;
};

export type Stage2Status =
  | 'idle'
  | 'sending'
  | 'streaming'
  | 'composing'
  | 'error'
  | 'terminated';

export type Stage2TurnError = {
  kind:    'http' | 'cut_stream' | 'session_terminated' | 'action';
  message: string;
};

interface UseStage2SessionArgs {
  sessionId:        string;
  stageRunId:       string;
  initialMessages:  Stage2Message[];
  /** Called after a streaming turn completes successfully — gives the
   *  parent a chance to refetch session state because the agent's
   *  extractor may have applied tier updates during the turn that the
   *  canvas needs to pick up. The 'composing' terminal status flip is
   *  signalled via the status field separately (so the parent can
   *  useEffect on it the same way it does for Stage 1). */
  onTurnComplete?:  () => Promise<void> | void;
}

interface UseStage2SessionResult {
  messages:               Stage2Message[];
  status:                 Stage2Status;
  turnError:              Stage2TurnError | null;
  /** True while one or more canvas action dispatchers (skill-tier,
   *  teammate add/remove/rename) are in flight. Distinct from
   *  `status` because canvas writes don't transition the chat-status
   *  state machine — but the SkillCanvas needs to surface a "saving"
   *  state and prevent rapid duplicate writes from racing. Computed
   *  from an internal in-flight counter so concurrent actions track
   *  correctly. */
  canvasBusy:             boolean;
  sendMessage:            (content: string, inputMethod?: 'voice') => Promise<void>;
  updateSkillTier:        (person: 'founder' | number, skill: SkillKey, tier: SkillTier) => Promise<void>;
  addTeammate:            (name: string) => Promise<void>;
  removeTeammate:         (index: number) => Promise<void>;
  renameTeammate:         (index: number, name: string) => Promise<void>;
  deriveExpectedProfile:  () => Promise<void>;
  clearError:             () => void;
}

function newId(prefix: string): string {
  // CLAUDE.md bans Math.random() for IDs; Hermes (RN 0.74+) supports
  // crypto.randomUUID() natively via the Web Crypto API.
  return `${prefix}-${crypto.randomUUID()}`;
}

export function useStage2Session({
  sessionId,
  stageRunId,
  initialMessages,
  onTurnComplete,
}: UseStage2SessionArgs): UseStage2SessionResult {
  const [messages,   setMessages]   = useState<Stage2Message[]>(initialMessages);
  const [status,     setStatus]     = useState<Stage2Status>('idle');
  const [turnError,  setTurnError]  = useState<Stage2TurnError | null>(null);
  const [canvasBusy, setCanvasBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Concurrent canvas dispatchers (e.g. updateSkillTier + addTeammate
  // fired rapidly) need to coexist without one prematurely clearing
  // canvasBusy. We track an in-flight count via ref so the boolean
  // only flips when the last action settles.
  const canvasInFlightRef = useRef(0);

  const beginCanvasWrite = useCallback(() => {
    canvasInFlightRef.current += 1;
    if (canvasInFlightRef.current === 1) setCanvasBusy(true);
  }, []);
  const endCanvasWrite = useCallback(() => {
    canvasInFlightRef.current = Math.max(0, canvasInFlightRef.current - 1);
    if (canvasInFlightRef.current === 0) setCanvasBusy(false);
  }, []);

  // Abort any in-flight stream on unmount so a navigation away mid-
  // turn doesn't leak a fetch + setState into a torn-down component.
  // Same pattern as useStage1Session.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const clearError = useCallback(() => setTurnError(null), []);

  // ───────────────────────────────────────────────────────────────────
  // Streaming turn
  // ───────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (content: string, inputMethod?: 'voice') => {
    if (status === 'sending' || status === 'streaming') return;

    const userMsg: Stage2Message = {
      id:          newId('u'),
      role:        'user',
      content,
      inputMethod: inputMethod ?? null,
    };
    setMessages(prev => [...prev, userMsg]);
    setTurnError(null);
    setStatus('sending');

    // 7500-char history cap matches Stage 1 + the server's 8000 ceiling.
    const history = [...messages, userMsg]
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 7500);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = await getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept':       'text/plain, application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(
        `${API_BASE_URL}/api/discovery/sessions/${sessionId}/turn`,
        {
          method:  'POST',
          headers,
          body:    JSON.stringify({
            message: content,
            history,
            ...(inputMethod && { inputMethod }),
          }),
          signal:  controller.signal,
        },
      );

      const contentType = res.headers.get('content-type') ?? '';

      // ── JSON terminal responses ────────────────────────────────────
      if (contentType.includes('application/json')) {
        const data = await res.json() as {
          status?:            'output_ready';
          stageRunId?:        string;
          stageNumber?:       number;
          error?:             string;
          sessionTerminated?: boolean;
        };

        if (res.status === 403 && data.sessionTerminated) {
          setStatus('terminated');
          setTurnError({
            kind:    'session_terminated',
            message: data.error ?? 'Session terminated',
          });
          return;
        }

        if (res.ok && data.status === 'output_ready') {
          // Parent watches `status === 'composing'` via useEffect and
          // calls its refetch — same pattern as Stage 1. The dispatcher
          // will then route to RequirementsDocumentView.
          setStatus('composing');
          return;
        }

        setStatus('error');
        setTurnError({
          kind:    'http',
          message: data.error ?? `Server returned ${res.status}`,
        });
        return;
      }

      // ── Streaming text response ────────────────────────────────────
      if (!res.ok || !res.body) {
        setStatus('error');
        setTurnError({
          kind:    'http',
          message: `Server returned ${res.status}`,
        });
        return;
      }

      setStatus('streaming');
      const assistantId = newId('a');
      setMessages(prev => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '', inputMethod: null },
      ]);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';

      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages(prev =>
            prev.map(m => (m.id === assistantId ? { ...m, content: acc } : m)),
          );
        }
        acc += decoder.decode();
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, content: acc } : m)),
        );
      } catch (streamErr) {
        if (controller.signal.aborted) return;
        setStatus('error');
        setTurnError({
          kind:    'cut_stream',
          message: streamErr instanceof Error ? streamErr.message : 'Stream interrupted',
        });
        return;
      }

      setStatus('idle');
      // Fire the turn-complete hook so the parent refetches the canvas
      // (the agent's extractor may have moved tier chips during this
      // turn — the server has the truth, mobile's optimistic local
      // state would miss those moves otherwise).
      try {
        await onTurnComplete?.();
      } catch (refetchErr) {
        // The refetch is best-effort — a failure there shouldn't bury
        // the chat in an error state since the turn itself succeeded.
        // Log so the founder team has a breadcrumb if the canvas ever
        // looks stale after a turn (otherwise the failure is invisible
        // and very hard to diagnose).
        // eslint-disable-next-line no-console
        console.warn(
          '[useStage2Session] onTurnComplete refetch failed — canvas may be stale',
          refetchErr,
        );
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus('error');
      setTurnError({
        kind:    'http',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [messages, sessionId, status, onTurnComplete]);

  // ───────────────────────────────────────────────────────────────────
  // Canvas action dispatchers
  // ───────────────────────────────────────────────────────────────────
  //
  // All canvas mutations are atomic on the server side (dual-write into
  // FounderProfile inside a Prisma transaction). Each returns void;
  // the caller is expected to refetch session state after awaiting so
  // the canvas re-renders with the persisted shape. Errors land in
  // turnError so the UI can surface them; the caller can also catch
  // the thrown error if it wants imperative handling.

  const runAction = useCallback(async (
    label:   string,
    invoke:  () => Promise<unknown>,
  ): Promise<void> => {
    setTurnError(null);
    beginCanvasWrite();
    try {
      await invoke();
    } catch (err) {
      const message = err instanceof Error ? err.message : `Could not ${label}`;
      setTurnError({ kind: 'action', message });
      throw err instanceof Error ? err : new Error(message);
    } finally {
      endCanvasWrite();
    }
  }, [beginCanvasWrite, endCanvasWrite]);

  const updateSkillTier = useCallback(
    (person: 'founder' | number, skill: SkillKey, tier: SkillTier) =>
      runAction('update skill tier', () =>
        api(`/api/ideation/stage-runs/${stageRunId}/skill-tier`, {
          method: 'POST',
          body:   { person, skill, tier },
        }),
      ),
    [runAction, stageRunId],
  );

  const addTeammate = useCallback(
    (name: string) =>
      runAction('add teammate', () =>
        api(`/api/ideation/stage-runs/${stageRunId}/teammate`, {
          method: 'POST',
          body:   { op: 'add', name },
        }),
      ),
    [runAction, stageRunId],
  );

  const removeTeammate = useCallback(
    (index: number) =>
      runAction('remove teammate', () =>
        api(`/api/ideation/stage-runs/${stageRunId}/teammate`, {
          method: 'POST',
          body:   { op: 'remove', index },
        }),
      ),
    [runAction, stageRunId],
  );

  const renameTeammate = useCallback(
    (index: number, name: string) =>
      runAction('rename teammate', () =>
        api(`/api/ideation/stage-runs/${stageRunId}/teammate`, {
          method: 'POST',
          body:   { op: 'rename', index, name },
        }),
      ),
    [runAction, stageRunId],
  );

  const deriveExpectedProfile = useCallback(async () => {
    // Derive is synchronous on the server (~15s p99 — Expected Profile
    // agent + research). Mirror the web's UX by flipping status to
    // 'composing' for the duration so loaders / disable-states fire.
    setStatus('composing');
    setTurnError(null);
    try {
      await api(`/api/ideation/stage-runs/${stageRunId}/derive-expected-profile`, {
        method: 'POST',
        body:   {},
      });
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setTurnError({
        kind:    'action',
        message: err instanceof Error ? err.message : 'Derivation failed',
      });
    }
  }, [stageRunId]);

  return {
    messages,
    status,
    turnError,
    canvasBusy,
    sendMessage,
    updateSkillTier,
    addTeammate,
    removeTeammate,
    renameTeammate,
    deriveExpectedProfile,
    clearError,
  };
}
