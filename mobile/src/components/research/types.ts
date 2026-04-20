// src/components/research/types.ts
//
// Shared types for the Research Tool views. Mirrors the backend
// ResearchReport schema.

export type FindingType = 'business' | 'person' | 'competitor' | 'datapoint' | 'regulation' | 'tool' | 'insight';
export type Confidence  = 'verified' | 'likely' | 'unverified';
export type SuggestedTool = 'conversation_coach' | 'outreach_composer' | 'service_packager';

export interface SocialMedia {
  platform: string;
  handle:   string;
  url:      string;
}

export interface ContactInfo {
  website?:         string;
  phone?:           string;
  email?:           string;
  socialMedia?:     SocialMedia[];
  physicalAddress?: string;
}

export interface Finding {
  title:        string;
  description:  string;
  type:         FindingType;
  location?:    string;
  contactInfo?: ContactInfo;
  sourceUrl:    string;
  confidence:   Confidence;
}

export interface Source {
  title:     string;
  url:       string;
  relevance: string;
}

export interface NextStep {
  action:         string;
  suggestedTool?: SuggestedTool;
  toolContext?:   string;
}

export interface ResearchReport {
  summary:             string;
  findings:            Finding[];
  sources:             Source[];
  roadmapConnections?: string;
  suggestedNextSteps?: NextStep[];
}

export interface FollowUpRound {
  query:    string;
  findings: Finding[];
  round:    number;
}

export const MAX_FOLLOW_UPS = 5;

export const CONFIDENCE_VARIANT: Record<Confidence, 'success' | 'warning' | 'destructive'> = {
  verified:   'success',
  likely:     'warning',
  unverified: 'destructive',
};
