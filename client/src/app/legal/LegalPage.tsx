import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

const SUPPORT_EMAIL = "support@startupvalidator.app";

/**
 * LegalPage — shared shell for placeholder legal pages. Server component.
 * Pass a heading and a body paragraph; the surrounding chrome (header,
 * back link, footer, attribution) is identical across Terms / Privacy /
 * Cookies.
 */
export default function LegalPage({
  heading,
  body,
  lastUpdated,
}: {
  heading: string;
  body: string;
  lastUpdated: string;
}) {
  // The body paragraph contains a literal "[support email]" placeholder
  // that we replace inline with a real mailto link.
  const [before, after] = body.split("[support email]");

  return (
    <div className="min-h-screen bg-[#070F1C] text-[#F7F8FA] antialiased">
      <MarketingHeader />
      <main className="pt-16">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-white focus:outline-none focus-visible:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <h1 className="mt-10 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {heading}
          </h1>

          <p className="mt-3 text-sm text-slate-500">
            Last updated: {lastUpdated}
          </p>

          <div className="mt-10 rounded-xl border border-slate-800 bg-[#0A1628] p-8 sm:p-10">
            <p className="text-base leading-relaxed text-slate-300">
              {before}
              {after !== undefined && (
                <>
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="font-medium text-[#2563EB] underline-offset-4 hover:underline"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                  {after}
                </>
              )}
            </p>
          </div>

          <p className="mt-8 text-sm text-slate-500">
            NeuraLaunch is a product of{" "}
            <span className="text-slate-300">
              Tabempa Engineering Limited
            </span>
            , headquartered in Freetown, Sierra Leone.
          </p>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
