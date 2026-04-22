// src/components/packager/PackageView.tsx
//
// Final stage of the Service Packager flow — renders the generated
// ServicePackage (tiers, scenarios, one-page brief) plus the refinement
// form. The screen orchestrator owns stage transitions and API calls;
// this view is pure presentation.

import {
  View,
  StyleSheet,
  TextInput as RNTextInput,
} from 'react-native';
import {
  Copy,
  Check,
  Share2,
  Sparkles,
  MessageSquare,
  FileText,
  ArrowRight,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, Button, Badge } from '@/components/ui';
import { spacing, radius, typography, iconSize } from '@/constants/theme';
import { MAX_ADJUSTMENTS, type ServicePackage } from './types';

interface Props {
  pkg:                ServicePackage;
  adjustments:        number;
  adjustInstruction:  string;
  setAdjustInstruction: (s: string) => void;
  onAdjust:           () => void;
  onCopyBrief:        () => void;
  onShareBrief:       () => void;
  onBackToRoadmap:    () => void;
  busy:               boolean;
  error:              string | null;
}

export function PackageView({
  pkg, adjustments, adjustInstruction, setAdjustInstruction,
  onAdjust, onCopyBrief, onShareBrief, onBackToRoadmap, busy, error,
}: Props) {
  const { colors: c } = useTheme();
  const remaining = MAX_ADJUSTMENTS - adjustments;

  return (
    <>
      {/* Service name + target client — gold accent, this is the capstone */}
      <Card variant="primary" style={{ marginBottom: spacing[4] }}>
        <View style={styles.nameRow}>
          <Sparkles size={iconSize.md} color={c.secondary} />
          <Text variant="heading" color={c.foreground} style={{ flex: 1, marginLeft: spacing[2] }}>
            {pkg.serviceName}
          </Text>
        </View>
        <Text variant="body" color={c.mutedForeground} style={{ marginTop: spacing[3] }}>
          For {pkg.targetClient}
        </Text>
      </Card>

      {/* Tiers */}
      <Text variant="title" style={{ marginTop: spacing[4], marginBottom: spacing[3] }}>Pricing tiers</Text>
      <View style={{ gap: spacing[3] }}>
        {pkg.tiers.map((t, i) => (
          <Card key={i}>
            <View style={styles.tierHeader}>
              <Text variant="label">{t.displayName}</Text>
              <Badge label={t.name} variant="muted" />
            </View>
            <View style={styles.tierPrice}>
              <Text variant="heading" color={c.primary}>{t.price}</Text>
              <Text variant="caption" color={c.mutedForeground}>{t.period}</Text>
            </View>
            <Text variant="body" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
              {t.description}
            </Text>
            <View style={{ marginTop: spacing[3], gap: spacing[1] }}>
              {t.features.map((f, j) => (
                <View key={j} style={styles.featureRow}>
                  <Check size={iconSize.xs} color={c.success} />
                  <Text variant="caption" color={c.foreground} style={{ flex: 1 }}>{f}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.justification, { backgroundColor: c.muted }]}>
              <Text variant="caption" color={c.mutedForeground} style={{ fontStyle: 'italic' }}>
                {t.justification}
              </Text>
            </View>
          </Card>
        ))}
      </View>

      {/* Included */}
      <Text variant="title" style={{ marginTop: spacing[6], marginBottom: spacing[3] }}>What's included</Text>
      <Card>
        <View style={{ gap: spacing[3] }}>
          {pkg.included.map((item, i) => (
            <View key={i}>
              <Text variant="label">{item.item}</Text>
              <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[0.5] }}>
                {item.description}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Not included */}
      {pkg.notIncluded.length > 0 && (
        <>
          <Text variant="title" style={{ marginTop: spacing[6], marginBottom: spacing[3] }}>Not included</Text>
          <Card variant="muted">
            <View style={{ gap: spacing[2] }}>
              {pkg.notIncluded.map((x, i) => (
                <Text key={i} variant="caption" color={c.mutedForeground}>
                  · {x}
                </Text>
              ))}
            </View>
          </Card>
        </>
      )}

      {/* Revenue scenarios */}
      <Text variant="title" style={{ marginTop: spacing[6], marginBottom: spacing[3] }}>Revenue scenarios</Text>
      <View style={{ gap: spacing[2] }}>
        {pkg.revenueScenarios.map((s, i) => (
          <Card key={i}>
            <View style={styles.scenarioHeader}>
              <Badge label={s.label} variant="primary" />
              <Text variant="label" color={c.primary}>{s.monthlyRevenue}</Text>
            </View>
            <Text variant="body" style={{ marginTop: spacing[2] }}>
              {s.clients} {s.clients === 1 ? 'client' : 'clients'} · {s.tierMix}
            </Text>
            <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
              {s.weeklyHours}
            </Text>
            {s.hiringNote ? (
              <Text variant="caption" color={c.warning} style={{ marginTop: spacing[1] }}>
                {s.hiringNote}
              </Text>
            ) : null}
          </Card>
        ))}
      </View>

      {/* Brief */}
      <Text variant="title" style={{ marginTop: spacing[6], marginBottom: spacing[3] }}>
        Your one-page brief
      </Text>
      <Card>
        <View style={styles.briefHeader}>
          {pkg.briefFormat === 'whatsapp'
            ? <MessageSquare size={iconSize.sm} color={c.mutedForeground} />
            : <FileText size={iconSize.sm} color={c.mutedForeground} />}
          <Text variant="caption" color={c.mutedForeground}>
            Formatted for {pkg.briefFormat === 'whatsapp' ? 'WhatsApp / SMS' : 'email or print'}
          </Text>
        </View>
        <Text variant="body" style={{ marginTop: spacing[3], lineHeight: 22 }}>
          {pkg.brief}
        </Text>
        <View style={styles.briefActions}>
          <Button
            title="Copy"
            onPress={onCopyBrief}
            variant="secondary"
            size="sm"
            icon={<Copy size={iconSize.sm} color={c.foreground} />}
          />
          <Button
            title="Share"
            onPress={onShareBrief}
            variant="ghost"
            size="sm"
            icon={<Share2 size={iconSize.sm} color={c.primary} />}
          />
        </View>
      </Card>

      {/* Adjustment form */}
      <View style={{ marginTop: spacing[6] }}>
        <Text variant="overline" color={c.mutedForeground}>
          Refine the package · {adjustments}/{MAX_ADJUSTMENTS} used
        </Text>
        {remaining > 0 ? (
          <>
            <View style={[styles.textArea, { backgroundColor: c.card, borderColor: c.border, marginTop: spacing[2] }]}>
              <RNTextInput
                value={adjustInstruction}
                onChangeText={setAdjustInstruction}
                placeholder='e.g. "cheaper basic tier", "more premium features", "shorter brief"'
                placeholderTextColor={c.placeholder}
                multiline
                maxLength={1000}
                style={[styles.input, { color: c.foreground }]}
              />
            </View>
            <Button
              title={busy ? 'Refining…' : 'Refine'}
              onPress={onAdjust}
              loading={busy}
              disabled={!adjustInstruction.trim() || busy}
              size="md"
              fullWidth
              style={{ marginTop: spacing[2] }}
            />
          </>
        ) : (
          <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
            You've used all {MAX_ADJUSTMENTS} refinements. Start a new session if you need to rework the package from scratch.
          </Text>
        )}
        {error ? (
          <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[2] }}>
            {error}
          </Text>
        ) : null}
      </View>

      <Button
        title="Done — back to my roadmap"
        onPress={onBackToRoadmap}
        variant="secondary"
        size="md"
        fullWidth
        style={{ marginTop: spacing[6] }}
        icon={<ArrowRight size={iconSize.sm} color={c.foreground} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  tierPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  justification: {
    marginTop: spacing[3],
    padding: spacing[2.5],
    borderRadius: radius.md,
  },
  scenarioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  briefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  briefActions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[4],
  },
});
