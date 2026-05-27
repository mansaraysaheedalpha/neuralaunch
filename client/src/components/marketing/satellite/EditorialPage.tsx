import type { ReactNode } from "react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

/**
 * EditorialPage — outer chrome for every Institute satellite (about,
 * faq, stories, signin, legal). Renders the marketing header + footer
 * and wraps children in the canonical max-w 1320px container so each
 * page inherits the same gutter without restating it. The radial accent
 * wash sits behind the first child (typically <SatelliteHero>).
 *
 * Satellite-only — do not import from /(app)/ or /discovery surfaces.
 */
export interface EditorialPageProps {
  children: ReactNode;
}

export function EditorialPage({ children }: EditorialPageProps) {
  return (
    <div className="min-h-screen bg-bg text-fg antialiased">
      <MarketingHeader />
      <main id="main">{children}</main>
      <MarketingFooter />
    </div>
  );
}
