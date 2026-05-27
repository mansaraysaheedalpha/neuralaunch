// src/components/marketing/satellite/index.ts
//
// Public barrel for the Institute satellite primitives. Imported only
// by the marketing satellite pages — /about, /faq, /stories,
// /stories/[slug], /signin, /legal/{terms,privacy,cookies}.
//
// Do not import outside those routes. App / discovery surfaces use a
// different primitive set.

export { EditorialPage } from "./EditorialPage";
export type { EditorialPageProps } from "./EditorialPage";

export { SatelliteHero } from "./SatelliteHero";
export type { SatelliteHeroProps, SatelliteHeroStamp } from "./SatelliteHero";

export { SatelliteSection } from "./SatelliteSection";
export type { SatelliteSectionProps } from "./SatelliteSection";

export { SatelliteClosing } from "./SatelliteClosing";
export type { SatelliteClosingProps } from "./SatelliteClosing";

export { SatelliteFAQItem } from "./SatelliteFAQItem";
export type { SatelliteFAQItemProps } from "./SatelliteFAQItem";

export { LegalPage } from "./LegalPage";
export type { LegalPageProps } from "./LegalPage";
