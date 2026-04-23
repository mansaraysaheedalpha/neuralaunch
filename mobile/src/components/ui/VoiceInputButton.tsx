// src/components/ui/VoiceInputButton.tsx
//
// Microphone button for the chat input bar. Mirrors the web
// VoiceInputButton's state machine (idle → recording → processing)
// against the web transcribe endpoint, but uses expo-audio's
// useAudioRecorder hook underneath so both iOS and Android record
// to a local m4a that the transcribe service already accepts.
//
// Parent owns tier gating (hide the button when tier !== 'compound')
// and review UI (what to do with the transcribed text). This
// component handles only: permission prompt, recording lifecycle,
// upload, and surfacing errors.

import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Mic, Square, X } from 'lucide-react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';
import { radius, spacing, iconSize } from '@/constants/theme';
import {
  transcribeRecording,
  TranscriptionForbiddenError,
} from '@/services/voice';

interface Props {
  onTranscription: (text: string, meta: { duration: number; confidence: number }) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  style?: ViewStyle;
}

type State = 'idle' | 'recording' | 'processing';

export function VoiceInputButton({ onTranscription, onError, disabled, style }: Props) {
  const { colors: c } = useTheme();
  const [state, setState] = useState<State>('idle');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const pulse = useRef(new Animated.Value(0)).current;

  function runPulse() {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ).start();
  }

  function stopPulse() {
    pulse.stopAnimation();
    pulse.setValue(0);
  }

  async function startRecording() {
    if (disabled) return;
    try {
      // Permission prompt — if already granted, returns instantly.
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        onError?.('Microphone permission was declined.');
        return;
      }
      // iOS requires iOS-specific recording mode; explicitly setting
      // it guarantees the recorder actually captures audio instead of
      // silently producing an empty file.
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording:   true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState('recording');
      runPulse();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      onError?.('Could not start recording.');
      setState('idle');
    }
  }

  async function stopAndTranscribe() {
    setState('processing');
    stopPulse();
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        throw new Error('No audio captured');
      }
      const result = await transcribeRecording(uri);
      onTranscription(result.text, {
        duration:   result.duration,
        confidence: result.confidence,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      if (err instanceof TranscriptionForbiddenError) {
        onError?.('Voice mode is a Compound plan feature.');
      } else {
        onError?.('Could not transcribe. Try again.');
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setState('idle');
    }
  }

  async function cancelRecording() {
    try { await recorder.stop(); } catch { /* ignore */ }
    stopPulse();
    setState('idle');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handlePress() {
    if (state === 'idle') { void startRecording(); return; }
    if (state === 'recording') { void stopAndTranscribe(); }
    // When processing, tap is a no-op — the button is visually
    // disabled until the response arrives.
  }

  const recordingBg = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [c.destructive, c.destructive + '66'] as [string, string],
  });

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || state === 'processing'}
      accessibilityRole="button"
      accessibilityLabel={
        state === 'idle' ? 'Start voice input'
        : state === 'recording' ? 'Stop and transcribe'
        : 'Transcribing…'
      }
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={({ pressed }) => [
        styles.hitArea,
        pressed && !disabled && state !== 'processing' && { opacity: 0.85 },
        style,
      ]}
    >
      {state === 'recording' ? (
        <>
          <Animated.View style={[styles.circle, { backgroundColor: recordingBg }]}>
            <Square size={16} color="#FFFFFF" fill="#FFFFFF" />
          </Animated.View>
          <Pressable
            onPress={() => { void cancelRecording(); }}
            accessibilityRole="button"
            accessibilityLabel="Cancel recording"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.cancel}
          >
            <X size={14} color={c.mutedForeground} />
          </Pressable>
        </>
      ) : (
        <Animated.View
          style={[
            styles.circle,
            {
              backgroundColor: state === 'processing' ? c.muted : 'transparent',
              opacity: state === 'processing' ? 0.6 : 1,
            },
          ]}
        >
          <Mic
            size={iconSize.md}
            color={state === 'processing' ? c.mutedForeground : c.foreground}
          />
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    width: 44,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000088',
  },
});
