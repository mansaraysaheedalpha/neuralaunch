import Link from "next/link";
import { FaGithub, FaXTwitter, FaLinkedin } from "react-icons/fa6";

/**
 * MarketingFooter — Institute chrome.
 *
 * Single hairline row. Three spans: credits left, legal/company links
 * centre, tagline right. Monospace caps throughout. No link soup, no
 * brand block, no triple-column directory — that lives on /about and
 * /faq, not in the chrome. Visual grammar: direction-a.html footer +
 * about.html footer.
 */
export default function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-rule">
      <div className="flex flex-wrap items-center justify-between gap-6 px-5 py-9 sm:px-10 lg:py-12 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        <span>
          © {year} · Tabempa Engineering · NeuraLaunch
        </span>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-5">
          <Link href="/about" className="transition-colors hover:text-fg">
            About
          </Link>
          <Link href="/faq" className="transition-colors hover:text-fg">
            FAQ
          </Link>
          <Link href="/legal/terms" className="transition-colors hover:text-fg">
            Terms
          </Link>
          <Link href="/legal/privacy" className="transition-colors hover:text-fg">
            Privacy
          </Link>
          <Link href="/legal/cookies" className="transition-colors hover:text-fg">
            Cookies
          </Link>
          <a
            href="https://www.linkedin.com/company/tabempa-engineering"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="NeuraLaunch on LinkedIn"
            className="transition-colors hover:text-fg"
          >
            <FaLinkedin aria-hidden="true" className="size-4" />
          </a>
          <a
            href="https://x.com/neuralaunch"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="NeuraLaunch on X"
            className="transition-colors hover:text-fg"
          >
            <FaXTwitter aria-hidden="true" className="size-4" />
          </a>
          <a
            href="https://github.com/mansaraysaheedalpha"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="NeuraLaunch on GitHub"
            className="transition-colors hover:text-fg"
          >
            <FaGithub aria-hidden="true" className="size-4" />
          </a>
        </nav>
        <span>From lost to launched. For everyone.</span>
      </div>
    </footer>
  );
}
