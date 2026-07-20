'use client';

import { TierResults } from '@/components/institute/tools/packager';
import type { ServicePackage } from '@/lib/roadmap/service-packager/schemas';

export interface ServicePackageViewProps {
  pkg: ServicePackage;
  roadmapId?: string;
  sessionId?: string;
  onRegenerate?: (model: string) => void;
}

export function ServicePackageView(props: ServicePackageViewProps) {
  return <TierResults {...props} />;
}
