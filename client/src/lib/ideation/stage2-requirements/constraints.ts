// src/lib/ideation/stage2-requirements/constraints.ts
//
// Pure deterministic computation of Constraint[] from
// (SkillInventory + ExpectedProfileEntry[]). No LLM. No I/O.
//
// Algorithm:
//   For each Expected Profile entry:
//     1. Compute the "strongest-across-team" tier for this skill —
//        the best tier any one of (founder + every teammate) has on
//        the skill. 'unknown' is special: it never beats a known
//        tier, and only propagates through when EVERY person is at
//        'unknown' on this skill.
//     2. Compare to the entry's requiredTier:
//        - actual >= required             → no constraint
//        - actual === 'unknown' globally  → blind_spot
//        - 1 tier below required           → mild
//        - 2+ tiers below                  → structural
//   Return Constraint[] in the same order as the input entries.

import type {
  SkillTier,
  SkillKey,
} from '@neuralaunch/constants';
import type {
  SkillInventory,
  ExpectedProfileEntry,
  Constraint,
} from './schema';
import { TIER_ORDER } from './constants';

/**
 * Compute the strongest tier across (founder + team) for one skill.
 *
 * Returns 'unknown' only when literally every person carries
 * 'unknown' for this skill. Otherwise returns the highest-ranked
 * known tier (good > acceptable > bad).
 */
export function computeStrongestTier(
  inventory: SkillInventory,
  skill:     SkillKey,
): SkillTier {
  const founderTier = inventory.founder.tiers[skill] ?? 'unknown';
  const teamTiers   = inventory.team.map(t => t.tiers[skill] ?? 'unknown');
  const allTiers: SkillTier[] = [founderTier, ...teamTiers];

  const known = allTiers.filter((t): t is Exclude<SkillTier, 'unknown'> => t !== 'unknown');
  if (known.length === 0) return 'unknown';

  // Pick the tier with the highest TIER_ORDER value.
  return known.reduce((best, current) =>
    TIER_ORDER[current] > TIER_ORDER[best] ? current : best,
  );
}

/**
 * Severity classifier. The 'unknown' case is the special blind_spot;
 * otherwise we measure tier-distance using TIER_ORDER values.
 *
 * Returns null when the skill is met or exceeded (no constraint
 * needed — drop the entry from the constraint list).
 */
export function classifyGap(
  required: SkillTier,
  actual:   SkillTier,
): Constraint['gap'] | null {
  // Order matters: required='unknown' is a noop on the gap axis
  // (the model decided not to assert a requirement) and supersedes
  // any actual tier. Only when there IS a real requirement does
  // actual='unknown' become the blind-spot constraint.
  if (required === 'unknown') return null;
  if (actual === 'unknown')   return 'blind_spot';
  const requiredOrder = TIER_ORDER[required];
  const actualOrder   = TIER_ORDER[actual];
  if (actualOrder >= requiredOrder) return null;
  const distance = requiredOrder - actualOrder;
  return distance === 1 ? 'mild' : 'structural';
}

/**
 * Compute Constraints for an Expected Profile against an Inventory.
 *
 * The composer fills in `implication` for each constraint via the
 * LLM prose pass; this function returns the structured skeleton with
 * `implication: ''` and the composer overwrites those strings.
 */
export function computeConstraints(
  inventory:       SkillInventory,
  expectedProfile: ReadonlyArray<ExpectedProfileEntry>,
): Constraint[] {
  const constraints: Constraint[] = [];

  for (const entry of expectedProfile) {
    const actual = computeStrongestTier(inventory, entry.skill);
    const gap = classifyGap(entry.requiredTier, actual);
    if (gap === null) continue;
    constraints.push({
      skill:        entry.skill,
      requiredTier: entry.requiredTier,
      actualTier:   actual,
      gap,
      critical:     entry.critical,
      implication:  '',
    });
  }
  return constraints;
}
