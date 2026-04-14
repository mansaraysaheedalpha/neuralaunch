import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — NeuraLaunch",
  description:
    "The Privacy Policy for the NeuraLaunch platform — a product of Tabempa Engineering Limited.",
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      heading="Privacy Policy"
      lastUpdated="April 2026"
      body="The Privacy Policy for NeuraLaunch is currently being prepared. This page will be updated with full details on how we collect, use, store, and protect your personal information, including data from discovery sessions, roadmaps, check-ins, and tool usage. NeuraLaunch is a product of Tabempa Engineering Limited. If you have questions in the meantime, contact us at [support email]."
    />
  );
}
