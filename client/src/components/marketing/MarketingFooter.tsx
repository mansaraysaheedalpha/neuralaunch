import Link from "next/link";
import Image from "next/image";
import { FaGithub, FaXTwitter, FaLinkedin } from "react-icons/fa6";

/**
 * MarketingFooter — server component. Renders the legal links, social
 * links, and the Tabempa attribution. No client state, no JS required.
 */
export default function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-800 bg-navy-950">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          {/* Brand block */}
          <div className="md:col-span-5">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-90"
              aria-label="NeuraLaunch home"
            >
              <Image
                src="/neuralaunch_logo.svg"
                alt=""
                width={36}
                height={27}
                className="h-7 w-auto"
              />
              <span className="text-lg font-semibold tracking-tight text-white">
                NeuraLaunch
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300">
              From lost to launched. One honest conversation. One clear
              direction. A partner that stays through the work.
            </p>
            <p className="mt-6 text-xs text-slate-300">
              A product of Tabempa Engineering Limited.
            </p>
          </div>

          {/* Product links */}
          <div className="md:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Product
            </h3>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link
                  href="/discovery"
                  className="text-slate-400 transition-colors hover:text-white"
                >
                  Get started
                </Link>
              </li>
              <li>
                <Link
                  href="/#pricing"
                  className="text-slate-400 transition-colors hover:text-white"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/faq"
                  className="text-slate-400 transition-colors hover:text-white"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Company links */}
          <div className="md:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Company
            </h3>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link
                  href="/about"
                  className="text-slate-400 transition-colors hover:text-white"
                >
                  About
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal links */}
          <div className="md:col-span-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Legal
            </h3>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link
                  href="/legal/terms"
                  className="text-slate-400 transition-colors hover:text-white"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/privacy"
                  className="text-slate-400 transition-colors hover:text-white"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/cookies"
                  className="text-slate-400 transition-colors hover:text-white"
                >
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom row — social + copyright */}
        <div className="mt-12 flex flex-col-reverse items-center justify-between gap-6 border-t border-slate-800 pt-8 sm:flex-row">
          <p className="text-xs text-slate-300">
            © {year} Tabempa Engineering Limited. All rights reserved.
          </p>
          <div className="flex items-center gap-5">
            <a
              href="https://www.linkedin.com/company/tabempa-engineering"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="NeuraLaunch on LinkedIn"
              className="text-slate-400 transition-colors hover:text-white"
            >
              <FaLinkedin className="h-5 w-5" aria-hidden="true" />
            </a>
            <a
              href="https://x.com/neuralaunch"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="NeuraLaunch on X"
              className="text-slate-400 transition-colors hover:text-white"
            >
              <FaXTwitter className="h-5 w-5" aria-hidden="true" />
            </a>
            <a
              href="https://github.com/mansaraysaheedalpha"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="NeuraLaunch on GitHub"
              className="text-slate-400 transition-colors hover:text-white"
            >
              <FaGithub className="h-5 w-5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
