'use client';

import { SCORE_AXIS_HINTS, SCORE_AXIS_LABELS } from './labels';

export type ScoreAxis = 'intensity' | 'frequency' | 'nicheSpecificity';

export interface ScoreRowProps {
  axis:     ScoreAxis;
  value:    number;
  onChange: (n: number) => void;
  disabled: boolean | undefined;
}

/**
 * One axis of the pain-point score input: 1-5 range slider with
 * axis label + hint. Extracted from PainPointCard to keep that file
 * under the 200-line component cap.
 */
export function ScoreRow({ axis, value, onChange, disabled }: ScoreRowProps) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-foreground font-medium">{SCORE_AXIS_LABELS[axis]}</span>
        <span className="text-muted-foreground">{SCORE_AXIS_HINTS[axis]}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          disabled={disabled}
          aria-label={SCORE_AXIS_LABELS[axis]}
          className="flex-1"
        />
        <span className="w-4 text-right font-mono text-xs text-foreground">{value}</span>
      </div>
    </label>
  );
}
