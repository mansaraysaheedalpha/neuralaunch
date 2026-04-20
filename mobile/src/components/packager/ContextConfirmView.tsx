// src/components/packager/ContextConfirmView.tsx
//
// First stage of the Service Packager flow — shows the server's
// pre-populated ServiceContext so the founder can confirm or edit
// before we spend ~60-90s generating the full package.

import {
  View,
  StyleSheet,
  ActivityIndicator,
  TextInput as RNTextInput,
} from 'react-native';
import { Package } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Button } from '@/components/ui';
import { spacing, radius, typography, iconSize } from '@/constants/theme';
import type { ServiceContext } from './types';

interface Props {
  context: ServiceContext | null;
  message: string;
  busy:    boolean;
  error:   string | null;
  onEdit:  (ctx: ServiceContext) => void;
  onConfirm: () => void;
}

export function ContextConfirmView({
  context, message, busy, error, onEdit, onConfirm,
}: Props) {
  const { colors: c } = useTheme();

  if (!context) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text variant="label" color={c.mutedForeground} style={{ marginTop: spacing[3] }}>
          Loading your context…
        </Text>
      </View>
    );
  }

  function editField(key: keyof ServiceContext, value: string) {
    onEdit({ ...context!, [key]: value });
  }

  return (
    <>
      <Text variant="title">Confirm your service</Text>
      {message ? (
        <Text variant="body" color={c.mutedForeground} style={{ marginTop: spacing[2], marginBottom: spacing[5] }}>
          {message}
        </Text>
      ) : null}

      <EditableField
        label="What you're packaging"
        value={context.serviceSummary}
        onChange={v => editField('serviceSummary', v)}
        minHeight={100}
      />
      <EditableField
        label="Who it's for"
        value={context.targetMarket}
        onChange={v => editField('targetMarket', v)}
      />

      {context.competitorPricing ? (
        <EditableField
          label="What competitors charge"
          value={context.competitorPricing}
          onChange={v => editField('competitorPricing', v)}
        />
      ) : null}

      {context.availableHoursPerWeek ? (
        <EditableField
          label="Your weekly hours"
          value={context.availableHoursPerWeek}
          onChange={v => editField('availableHoursPerWeek', v)}
        />
      ) : null}

      {context.researchFindings ? (
        <View style={[styles.researchFindings, { backgroundColor: c.secondaryAlpha10, borderColor: c.secondary }]}>
          <Text variant="overline" color={c.secondary}>From your Research Tool findings</Text>
          <Text variant="caption" color={c.foreground} style={{ marginTop: spacing[2] }}>
            {context.researchFindings}
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[3] }}>
          {error}
        </Text>
      ) : null}

      <Button
        title={busy ? 'Generating your package…' : 'Generate my package'}
        onPress={onConfirm}
        loading={busy}
        disabled={busy}
        size="lg"
        fullWidth
        icon={<Package size={iconSize.md} color={c.primaryForeground} />}
        style={{ marginTop: spacing[6] }}
      />
    </>
  );
}

function EditableField({
  label, value, onChange, minHeight,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minHeight?: number;
}) {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: spacing[4] }}>
      <Text variant="overline" color={c.mutedForeground} style={{ marginBottom: spacing[2] }}>
        {label}
      </Text>
      <View style={[styles.textArea, { backgroundColor: c.card, borderColor: c.border }]}>
        <RNTextInput
          value={value}
          onChangeText={onChange}
          multiline
          maxLength={3000}
          style={[styles.input, { color: c.foreground, minHeight: minHeight ?? 60 }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing[10],
    paddingHorizontal: spacing[6],
  },
  textArea: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing[3],
  },
  input: {
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.leading.relaxed,
    textAlignVertical: 'top',
  },
  researchFindings: {
    marginTop: spacing[4],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
});
