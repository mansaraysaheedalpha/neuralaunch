// src/components/packager/types.ts
//
// Shared types for the Service Packager views. Mirrors the server-side
// schemas at client/src/lib/roadmap/service-packager/schemas.ts. Kept
// separate from the screen so both ContextConfirmView and PackageView
// can import without a circular dependency.

export type BriefFormat = 'whatsapp' | 'document';

export interface IncludedItem {
  item:        string;
  description: string;
}

export interface PackageTier {
  name:          string;
  displayName:   string;
  price:         string;
  period:        string;
  description:   string;
  features:      string[];
  justification: string;
}

export interface RevenueScenario {
  label:          string;
  clients:        number;
  tierMix:        string;
  monthlyRevenue: string;
  weeklyHours:    string;
  hiringNote?:    string;
}

export interface ServicePackage {
  serviceName:      string;
  targetClient:     string;
  included:         IncludedItem[];
  notIncluded:      string[];
  tiers:            PackageTier[];
  revenueScenarios: RevenueScenario[];
  brief:            string;
  briefFormat:      BriefFormat;
}

export interface ServiceContext {
  serviceSummary:        string;
  targetMarket:          string;
  competitorPricing?:    string;
  founderCosts?:         string;
  availableHoursPerWeek?: string;
  taskContext?:          string;
  researchFindings?:     string;
}

export const MAX_ADJUSTMENTS = 3;
