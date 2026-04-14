import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service — NeuraLaunch",
  description:
    "The Terms of Service for the NeuraLaunch platform — a product of Tabempa Engineering Limited.",
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <LegalPage
      heading="Terms of Service"
      lastUpdated="April 2026"
      body="The Terms of Service for NeuraLaunch are currently being prepared. This page will be updated with the full terms that govern your use of the NeuraLaunch platform, including account creation, data handling, AI-generated content ownership, and your rights as a user. NeuraLaunch is a product of Tabempa Engineering Limited, headquartered in Freetown, Sierra Leone. If you have questions in the meantime, contact us at [support email]."
    />
  );
}
