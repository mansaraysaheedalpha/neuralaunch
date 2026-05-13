'use client';

import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SKILL_KEYS, SKILL_TIERS, type SkillKey, type SkillTier } from '@neuralaunch/constants';
import type { SkillInventory } from '@/lib/ideation/stage2-requirements/schema';
import { TeammateForm } from './TeammateForm';
import { SKILL_LABELS, TIER_LANE_LABEL } from './labels';
import { Trash2 } from 'lucide-react';

interface SkillCanvasProps {
  inventory: SkillInventory;
  /** Disabled when the row is not in 'authoring' (e.g. document committed). */
  readOnly?: boolean;
  onTierChange: (person: 'founder' | number, skill: SkillKey, tier: SkillTier) => Promise<void>;
  onTeammateAdd:    (name: string) => Promise<void>;
  onTeammateRemove: (index: number) => Promise<void>;
}

const TIER_STYLE: Record<SkillTier, string> = {
  good:       'border-success/40 bg-success/5',
  acceptable: 'border-primary/40 bg-primary/5',
  bad:        'border-destructive/40 bg-destructive/5',
  unknown:    'border-border bg-card/30 opacity-80',
};

/**
 * Drag-and-drop tier-list canvas. 14 skill chips × 4 tier lanes per
 * person (founder + each teammate, switched via tabs at the top).
 *
 * `unknown` is rendered as a subdued "Set aside" lane — the brief
 * specifies the 4-tier UI but with conversational framing staying
 * 3-tier in the calibration chat.
 *
 * The parent owns the API write — each drag calls onTierChange and
 * waits for the route to confirm before the canvas state visually
 * settles (router refresh is the parent's choice).
 */
export function SkillCanvas({
  inventory,
  readOnly = false,
  onTierChange,
  onTeammateAdd,
  onTeammateRemove,
}: SkillCanvasProps) {
  const [activePerson, setActivePerson] = useState<'founder' | number>('founder');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 100, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const currentPerson =
    activePerson === 'founder'
      ? inventory.founder
      : inventory.team[activePerson] ?? inventory.founder;

  const handleDragEnd = (e: DragEndEvent) => {
    if (readOnly) return;
    const skill = e.active.id as SkillKey;
    const targetTier = e.over?.id as SkillTier | undefined;
    if (!targetTier) return;
    if (!SKILL_TIERS.includes(targetTier)) return;
    if (currentPerson.tiers[skill] === targetTier) return;
    void onTierChange(activePerson, skill, targetTier);
  };

  const existingTeammates = inventory.team
    .map(t => t.name)
    .filter((n): n is string => typeof n === 'string');

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3 pb-2 border-b border-border">
        <PersonTab
          label="Founder"
          active={activePerson === 'founder'}
          onClick={() => setActivePerson('founder')}
        />
        {inventory.team.map((t, i) => (
          <div key={i} className="flex items-center gap-1">
            <PersonTab
              label={t.name ?? `Teammate ${i + 1}`}
              active={activePerson === i}
              onClick={() => setActivePerson(i)}
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => { void onTeammateRemove(i); if (activePerson === i) setActivePerson('founder'); }}
                aria-label={`Remove ${t.name ?? `Teammate ${i + 1}`}`}
                className="p-1 rounded text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <TeammateForm existingNames={existingTeammates} onAdd={onTeammateAdd} />
        )}
      </div>

      {/* Tier lanes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SKILL_TIERS.map(tier => (
          <TierLane
            key={tier}
            tier={tier}
            label={TIER_LANE_LABEL[tier]}
            style={TIER_STYLE[tier]}
            skills={SKILL_KEYS.filter(s => currentPerson.tiers[s] === tier)}
            readOnly={readOnly}
          />
        ))}
      </div>
    </DndContext>
  );
}

function PersonTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-card/40 text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function TierLane({
  tier,
  label,
  style,
  skills,
  readOnly,
}: {
  tier:     SkillTier;
  label:    string;
  style:    string;
  skills:   SkillKey[];
  readOnly: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tier });
  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={`${label} tier — drop skills here to set their level`}
      aria-dropeffect="move"
      className={`rounded-lg border px-3 py-3 min-h-[120px] ${style} ${
        isOver ? 'ring-2 ring-primary/40' : ''
      }`}
    >
      <div className="text-xs font-medium text-foreground mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {skills.length === 0 && (
          <span className="text-xs text-muted-foreground italic">(empty)</span>
        )}
        {skills.map(s => (
          <SkillChip key={s} skill={s} disabled={readOnly} />
        ))}
      </div>
    </div>
  );
}

function SkillChip({ skill, disabled }: { skill: SkillKey; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id:       skill,
    disabled,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <span
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`text-xs rounded-full border border-border bg-background/80 px-2 py-1 ${
        disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      {SKILL_LABELS[skill]}
    </span>
  );
}
