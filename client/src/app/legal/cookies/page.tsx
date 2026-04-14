import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = {
  title: "Cookie Policy — NeuraLaunch",
  description:
    "The Cookie Policy for the NeuraLaunch platform — a product of Tabempa Engineering Limited.",
  robots: { index: false, follow: true },
};

export default function CookiesPage() {
  return (
    <LegalPage
      heading="Cookie Policy"
      lastUpdated="April 2026"
      body="The Cookie Policy for NeuraLaunch is currently being prepared. This page will be updated with details on the cookies and similar technologies used on the NeuraLaunch platform. NeuraLaunch is a product of Tabempa Engineering Limited. If you have questions in the meantime, contact us at [support email]."
    />
  );
}
