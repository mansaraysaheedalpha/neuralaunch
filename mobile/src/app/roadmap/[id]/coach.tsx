// src/app/roadmap/[id]/coach.tsx
//
// Conversation Coach flow — four stages:
// 1. Setup (1–3 exchanges)
// 2. Preparation (single Opus call, loading state)
// 3. Role-play (multi-turn Sonnet)
// 4. Debrief (single Haiku call)
//
// State machine managed locally. Each stage component calls back
// to advance to the next.

import { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import { SetupChat } from '@/components/coach/SetupChat';
import { PreparationView } from '@/components/coach/PreparationView';
import { RolePlayChat } from '@/components/coach/RolePlayChat';
import { DebriefView } from '@/components/coach/DebriefView';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Stage = 'setup' | 'preparation' | 'roleplay' | 'debrief';

interface SetupData {
  who:       string;
  objective: string;
  fear:      string;
  channel:   string;
}

interface PreparationPackage {
  openingScript: string;
  keyAsks: Array<{ ask: string; whyItMatters: string }>;
  objections: Array<{ objection: string; response: string; groundedIn: string }>;
  fallbackPositions: Array<{ trigger: string; fallback: string }>;
  postConversationChecklist: Array<{ condition: string; action: string }>;
  rolePlaySetup: {
    personality: string;
    motivations: string;
    probableConcerns: string[];
    powerDynamic: string;
    communicationStyle: string;
  };
}

interface RolePlayTurn {
  role:    'founder' | 'other_party';
  message: string;
  turn:    number;
}

interface Debrief {
  whatWentWell:    string[];
  whatToWatchFor:  string[];
  revisedSections?: {
    openingScript?:      string;
    additionalObjection?: { objection: string; response: string };
  };
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CoachScreen() {
  const { id: roadmapId, taskId } = useLocalSearchParams<{
    id: string;
    taskId?: string;
  }>();
  const { colors: c } = useTheme();
  const router = useRouter();

  const [stage, setStage]               = useState<Stage>('setup');
  const [setup, setSetup]               = useState<SetupData | null>(null);
  const [preparation, setPreparation]   = useState<PreparationPackage | null>(null);
  const [prepLoading, setPrepLoading]   = useState(false);
  const [rolePlayHistory, setRolePlayHistory] = useState<RolePlayTurn[]>([]);
  const [debrief, setDebrief]           = useState<Debrief | null>(null);
  const [debriefLoading, setDebriefLoading] = useState(false);

  // Stage 1 → 2: setup complete, fire preparation call
  const handleSetupComplete = useCallback(async (data: SetupData) => {
    setSetup(data);
    setStage('preparation');
    setPrepLoading(true);

    try {
      const basePath = taskId
        ? `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/coach/prepare`
        : `/api/discovery/roadmaps/${roadmapId}/coach/prepare`;

      const result = await api<{ preparation: PreparationPackage }>(basePath, {
        method: 'POST',
        body: { setup: data },
      });

      setPreparation(result.preparation);
    } catch {
      // Stay on preparation view with loading=false so user sees error
    } finally {
      setPrepLoading(false);
    }
  }, [roadmapId, taskId]);

  // Stage 2 → 3: start role-play
  const handleStartRolePlay = useCallback(() => {
    setStage('roleplay');
  }, []);

  // Stage 3 → 4: role-play done, fire debrief
  const handleRolePlayComplete = useCallback(async (history: RolePlayTurn[]) => {
    setRolePlayHistory(history);
    setStage('debrief');
    setDebriefLoading(true);

    try {
      const basePath = taskId
        ? `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/coach/debrief`
        : `/api/discovery/roadmapId/${roadmapId}/coach/debrief`;

      const result = await api<{ debrief: Debrief }>(basePath, {
        method: 'POST',
        body: { history },
      });

      setDebrief(result.debrief);
    } catch {
      // Stay on debrief view with loading=false
    } finally {
      setDebriefLoading(false);
    }
  }, [roadmapId, taskId]);

  // Stage 4 → done: back to roadmap
  const handleDone = useCallback(() => {
    router.back();
  }, [router]);

  const stageTitle: Record<Stage, string> = {
    setup:       'Conversation Coach',
    preparation: 'Your Preparation',
    roleplay:    'Rehearsal',
    debrief:     'Debrief',
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: stageTitle[stage],
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <View style={[styles.container, { backgroundColor: c.background }]}>
        {stage === 'setup' && (
          <SetupChat
            roadmapId={roadmapId ?? ''}
            taskId={taskId}
            onSetupComplete={(data) => { void handleSetupComplete(data); }}
          />
        )}

        {stage === 'preparation' && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <PreparationView
              preparation={preparation}
              loading={prepLoading}
              channel={setup?.channel ?? 'in_person'}
              onStartRolePlay={handleStartRolePlay}
            />
          </ScrollView>
        )}

        {stage === 'roleplay' && (
          <RolePlayChat
            roadmapId={roadmapId ?? ''}
            taskId={taskId}
            otherParty={setup?.who ?? 'the other party'}
            channel={setup?.channel ?? 'in_person'}
            onComplete={(history) => { void handleRolePlayComplete(history); }}
          />
        )}

        {stage === 'debrief' && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <DebriefView
              debrief={debrief}
              loading={debriefLoading}
              onDone={handleDone}
            />
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
