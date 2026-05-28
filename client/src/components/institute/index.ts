// src/components/institute/index.ts
//
// Public barrel for the Institute shared primitives. Downstream
// consumers (Stage 1/2/3/4/5 surfaces, Discovery, Stuck-founder,
// marketing) import from "@/components/institute" — never from the
// individual files. New primitives added in later PRs re-export here.

export { TopBar, Pill } from './TopBar';
export type { TopBarProps, PillProps, BreadcrumbItem } from './TopBar';

export { StageBanner } from './StageBanner';
export type { StageBannerProps } from './StageBanner';

export { StageInterview } from './StageInterview';
export type {
  StageInterviewProps,
  StageInterviewQuestion,
  StageInterviewRecall,
  StageInterviewHandle,
  VoiceState,
} from './StageInterview';

export { BeliefRail } from './BeliefRail';
export type {
  BeliefRailProps,
  BeliefRailGroup,
  BeliefRailField,
  BeliefRailGroupAccent,
  BeliefRailFootRight,
  FieldState,
} from './BeliefRail';

export { default as AppShell } from './AppShell';
export type { AppShellProps } from './AppShell';

export { default as AppSidebar, AppMobileBar } from './AppSidebar';
export type { AppSidebarProps } from './AppSidebar';

export { PhaseLadder } from './PhaseLadder';
export type { PhaseLadderProps } from './PhaseLadder';

export { SynthesisOverlay } from './SynthesisOverlay';
export type {
  SynthesisOverlayProps,
  SynthesisStep,
  SynthesisStepState,
} from './SynthesisOverlay';
