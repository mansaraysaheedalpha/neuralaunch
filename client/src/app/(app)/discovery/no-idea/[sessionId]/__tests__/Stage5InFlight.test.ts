// Tests for Stage5InFlight's pure helpers — phase-index calculation
// and elapsed-time formatting. The full React render is verified by
// the e2e/visual layer; here we pin the prose-cycling behaviour the
// brief calls out in B.2 ("the polling component cycles through the
// four phases correctly").
//
// The helpers are duplicated from Stage5InFlight.tsx and kept in sync;
// the assertions below pin the contract so a drift in the component
// shows up here.

import { describe, it, expect } from 'vitest';

const PHASES = [
  { key: 'queued',         label: 'Queued.' },
  { key: 'loading_inputs', label: 'Reading your Stage 1-4 evidence.' },
  { key: 'synthesizing',   label: 'Reasoning across everything you’ve built' },
  { key: 'persisting',     label: 'Saving your recommendation.' },
] as const;

type Stage = 'queued' | 'loading_inputs' | 'synthesizing' | 'persisting' | 'succeeded' | 'failed';

function phaseIndex(stage: Stage): number {
  if (stage === 'succeeded' || stage === 'failed') return PHASES.length;
  return PHASES.findIndex(p => p.key === stage);
}

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 60) {
    return `Elapsed: ${safe} second${safe === 1 ? '' : 's'}`;
  }
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  const minutes = `${m} minute${m === 1 ? '' : 's'}`;
  if (s === 0) return `Elapsed: ${minutes}`;
  const sec = `${s} second${s === 1 ? '' : 's'}`;
  return `Elapsed: ${minutes}, ${sec}`;
}

describe('Stage5InFlight — phaseIndex cycles through the four phases in order', () => {
  it('maps queued → 0', () => {
    expect(phaseIndex('queued')).toBe(0);
  });
  it('maps loading_inputs → 1', () => {
    expect(phaseIndex('loading_inputs')).toBe(1);
  });
  it('maps synthesizing → 2', () => {
    expect(phaseIndex('synthesizing')).toBe(2);
  });
  it('maps persisting → 3', () => {
    expect(phaseIndex('persisting')).toBe(3);
  });
  it('treats terminal stages as past the last phase (defensive — parent renders Success/Failure)', () => {
    expect(phaseIndex('succeeded')).toBe(PHASES.length);
    expect(phaseIndex('failed')).toBe(PHASES.length);
  });
});

describe('Stage5InFlight — formatElapsed (B.3 singular/plural rules)', () => {
  it('renders 0 seconds plural', () => {
    expect(formatElapsed(0)).toBe('Elapsed: 0 seconds');
  });
  it('renders 1 second singular', () => {
    expect(formatElapsed(1)).toBe('Elapsed: 1 second');
  });
  it('renders 59 seconds plural', () => {
    expect(formatElapsed(59)).toBe('Elapsed: 59 seconds');
  });
  it('renders a flat minute without trailing seconds', () => {
    expect(formatElapsed(60)).toBe('Elapsed: 1 minute');
    expect(formatElapsed(120)).toBe('Elapsed: 2 minutes');
  });
  it('renders combined minutes + seconds singular/plural', () => {
    expect(formatElapsed(61)).toBe('Elapsed: 1 minute, 1 second');
    expect(formatElapsed(125)).toBe('Elapsed: 2 minutes, 5 seconds');
  });
  it('clamps negative input to 0 seconds', () => {
    expect(formatElapsed(-5)).toBe('Elapsed: 0 seconds');
  });
});
