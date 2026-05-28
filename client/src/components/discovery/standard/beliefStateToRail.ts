// src/components/discovery/standard/beliefStateToRail.ts
//
// The ONLY place that knows both the DiscoveryContext (15-field belief
// state) shape AND the generic <BeliefRail> group structure. Keeps the
// rail primitive domain-agnostic and the belief-state hook untouched —
// when PR 10 redesigns Stage 1 it writes its own adapter for the
// 4-field outcome state instead of bending this one.

import type { BeliefRailGroup, BeliefRailField, FieldState } from '@/components/institute';
import type { DiscoveryContext } from '@/lib/discovery';

/**
 * Captured threshold — mirrors MIN_FIELD_CONFIDENCE (0.65) from the
 * server's discovery constants. Duplicated as a client-side literal
 * rather than imported because the discovery barrel pulls server-only
 * engine modules; the value is a stable contract, not logic.
 */
const CAPTURED_CONFIDENCE = 0.65;

interface FieldDef {
  key:   keyof DiscoveryContext;
  roman: string;
  name:  string;
}

interface GroupDef {
  label:  string;
  fields: FieldDef[];
}

/** The four interview phases → their belief fields, in render order. */
const GROUP_DEFS: GroupDef[] = [
  {
    label: 'I. Orientation',
    fields: [
      { key: 'situation',       roman: 'i.',   name: 'Situation' },
      { key: 'background',      roman: 'ii.',  name: 'Background' },
      { key: 'whatTriedBefore', roman: 'iii.', name: "What you've tried" },
    ],
  },
  {
    label: 'II. Goals',
    fields: [
      { key: 'primaryGoal',       roman: 'iv.', name: 'Primary goal' },
      { key: 'successDefinition', roman: 'v.',  name: 'Success' },
      { key: 'timeHorizon',       roman: 'vi.', name: 'Time horizon' },
    ],
  },
  {
    label: 'III. Constraints',
    fields: [
      { key: 'availableTimePerWeek', roman: 'vii.',  name: 'Weekly hours' },
      { key: 'availableBudget',      roman: 'viii.', name: 'Budget' },
      { key: 'teamSize',             roman: 'ix.',   name: 'Team' },
      { key: 'technicalAbility',     roman: 'x.',    name: 'Technical' },
      { key: 'geographicMarket',     roman: 'xi.',   name: 'Geography' },
    ],
  },
  {
    label: 'IV. Conviction',
    fields: [
      { key: 'commitmentLevel',  roman: 'xii.',  name: 'Commitment' },
      { key: 'biggestConcern',   roman: 'xiii.', name: 'Biggest fear' },
      { key: 'whyNow',           roman: 'xiv.',  name: 'Why now' },
      { key: 'motivationAnchor', roman: 'xv.',   name: 'Motivation anchor' },
    ],
  },
];

/** Display-format a belief field value for the rail's mono value row. */
function formatValue(key: keyof DiscoveryContext, ctx: DiscoveryContext): string {
  const field = ctx[key];
  const raw = field.value;
  if (raw === null || raw === undefined) return '—';
  if (Array.isArray(raw)) {
    return raw.length === 0 ? '—' : raw.join(' · ');
  }
  return String(raw);
}

function fieldState(
  key: keyof DiscoveryContext,
  ctx: DiscoveryContext,
  activeField: string | null,
): FieldState {
  if (ctx[key].confidence >= CAPTURED_CONFIDENCE) return 'captured';
  // The field the engine is currently probing pulses, even before it
  // crosses the capture threshold.
  if (activeField === key) return 'live';
  return 'pending';
}

/**
 * Map the 15-field belief state to the rail's group structure.
 *
 * @param ctx          the parsed DiscoveryContext (from the belief endpoint)
 * @param activeField  the field the engine is probing (rendered "live")
 */
export function beliefStateToRail(
  ctx: DiscoveryContext,
  activeField: string | null,
): BeliefRailGroup[] {
  return GROUP_DEFS.map((group) => {
    const fields: BeliefRailField[] = group.fields.map((def) => {
      const state = fieldState(def.key, ctx, activeField);
      return {
        id:    def.key,
        roman: def.roman,
        name:  def.name,
        value:
          state === 'captured'
            ? formatValue(def.key, ctx)
            : state === 'live'
              ? 'listening…'
              : '—',
        state,
      };
    });
    const captured = fields.filter((f) => f.state === 'captured').length;
    return {
      label: group.label,
      labelRight: {
        text:   captured === group.fields.length ? 'Complete' : `${captured}/${group.fields.length}`,
        accent: captured === group.fields.length,
      },
      fields,
    };
  });
}

/**
 * Readiness label for the rail's foot-right slot.
 *
 * @param capturedCount fields captured at/above the threshold
 * @param synthTarget   fields needed before synthesis unlocks
 * @param synthesising  true once the synthesis pipeline has fired
 */
export function readinessLabel(
  capturedCount: number,
  synthTarget: number,
  synthesising: boolean,
): string {
  if (synthesising) return 'Synthesising shortly…';
  const remaining = synthTarget - capturedCount;
  if (remaining <= 0) return 'Ready';
  return `Ready in ~${remaining} turn${remaining === 1 ? '' : 's'}`;
}
