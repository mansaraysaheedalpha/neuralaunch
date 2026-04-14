// src/components/discovery/InterviewGuide.tsx
//
// Modal dialog shown from the discovery chat header. Helps founders
// understand how to answer for the best recommendation quality.
// Mirrors the web app's InterviewGuide.

import { Modal, View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, Separator } from '@/components/ui';
import { spacing, radius } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function Tip({ label, detail }: { label: string; detail: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.tipRow}>
      <Text variant="caption" color={c.mutedForeground} style={{ opacity: 0.4 }}>→</Text>
      <View style={{ flex: 1 }}>
        <Text variant="caption">
          <Text variant="label">{label}. </Text>
          <Text variant="caption" color={c.foreground}>{detail}</Text>
        </Text>
      </View>
    </View>
  );
}

export function InterviewGuide({ visible, onClose }: Props) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[{ flex: 1, backgroundColor: c.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: c.border, paddingTop: insets.top + spacing[3] }]}>
          <View style={{ flex: 1 }}>
            <Text variant="title">Getting the most out of your session</Text>
            <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
              Built from 19 real discovery sessions.
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <X size={24} color={c.foreground} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing[8] }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Core principle */}
          <View style={styles.section}>
            <Text variant="overline" color={c.mutedForeground}>The core principle</Text>
            <Text variant="body" color={c.foreground} style={{ marginTop: spacing[2], opacity: 0.85 }}>
              The recommendation you receive will only ever be as specific as
              the information you provide. Vague answers produce general
              recommendations. Specific answers produce recommendations that
              feel like they were written for you — because they were.
            </Text>
          </View>

          <Separator />

          {/* What produces the best results */}
          <View style={styles.section}>
            <Text variant="overline" color={c.mutedForeground}>What produces the best results</Text>
            <View style={styles.tipList}>
              <Tip
                label="Give specific numbers"
                detail={'"Maybe 10 to 12 hours a week" is far more useful than "some time on evenings and weekends." Cover time, money, revenue targets, team size.'}
              />
              <Tip
                label="Name failed attempts honestly"
                detail={'"I tried freelancing on Fiverr, made $80 in three months, and stopped because I couldn\'t get clients" produces a fundamentally different recommendation than "I tried freelancing before."'}
              />
              <Tip
                label="Define success concretely"
                detail={'"10 people I\'ve never met decide my thing is worth $100 a month" is an anchor. "I want to be successful" is not.'}
              />
              <Tip
                label="Answer psychological questions honestly"
                detail="What would make you walk away. What has stopped you before. Whether you trust your own discipline. These determine whether the recommendation accounts for the real constraints on your behaviour."
              />
            </View>
          </View>

          <Separator />

          {/* What to avoid */}
          <View style={styles.section}>
            <Text variant="overline" color={c.mutedForeground}>What to avoid</Text>
            <View style={styles.tipList}>
              <Tip
                label="Don't give the answer you think the engine wants"
                detail="It has no preference for what your situation is. A founder with Le 300,000 and 25 free hours who answers honestly will receive a better recommendation than someone who overstates their readiness."
              />
              <Tip
                label="Don't compress multiple answers into one"
                detail="Answer the question asked, then let the engine ask the next one."
              />
              <Tip
                label="Don't answer in hypotheticals"
                detail={'"I could probably get 10 hours a week if I really committed" is not the same as "I have 10 hours a week." The engine builds recommendations around what is real.'}
              />
              <Tip
                label="Don't skip the resilience questions"
                detail="What has stopped you before. What you would do if things don't work. These feel like the least important questions. They are usually the most important."
              />
            </View>
          </View>

          {/* Quick reference */}
          <View style={[styles.quickRef, { backgroundColor: c.muted }]}>
            <Text variant="overline" color={c.mutedForeground}>Quick reference</Text>
            <View style={{ gap: spacing[2], marginTop: spacing[3] }}>
              {[
                'Specific numbers over approximations',
                'Failed attempts named honestly — what, why, what caused the stop',
                'Success defined concretely enough that a stranger could verify it',
                'Psychological questions answered with the same honesty as practical ones',
                'One question, one answer — no compression',
                'Your real situation, not the version you wish were true',
              ].map(item => (
                <View key={item} style={styles.tipRow}>
                  <Text variant="caption" color={c.mutedForeground} style={{ opacity: 0.4 }}>·</Text>
                  <Text variant="caption" color={c.foreground} style={{ flex: 1, opacity: 0.75 }}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[4],
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: spacing[2],
    marginRight: -spacing[2],
    marginTop: -spacing[1],
  },
  content: {
    padding: spacing[5],
    gap: spacing[5],
  },
  section: {
    gap: spacing[2],
  },
  tipList: {
    gap: spacing[3],
    marginTop: spacing[2],
  },
  tipRow: {
    flexDirection: 'row',
    gap: spacing[2.5],
    alignItems: 'flex-start',
  },
  quickRef: {
    borderRadius: radius.lg,
    padding: spacing[4],
  },
});
