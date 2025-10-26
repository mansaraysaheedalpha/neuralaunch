// src/components/LandingFooter.tsx (Create this new file)
"use client";

import Link from "next/link";
import Image from "next/image";
import { FaGithub, FaTwitter, FaLinkedin } from "react-icons/fa";

export default function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-muted/30 dark:bg-slate-800/30 border-t border-border/50 py-12 sm:py-16 mt-24">
      {" "}
      {/* Added top margin */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
        {/* Column 1: Branding */}
        <div className="flex flex-col items-center md:items-start">
          <Link href="/" className="flex items-center gap-2 mb-3 group">
            <Image
              src="/neuralaunch_logo.png" // Use your logo
              alt="NeuraLaunch Logo"
              width={32} // Adjust size
              height={32}
              className="h-9 w-9 group-hover:opacity-80 transition-opacity"
            />
            <span className="text-lg font-semibold text-foreground">
              NeuraLaunch
            </span>
          </Link>
          <p className="text-base text-muted-foreground max-w-xs mx-auto md:mx-0">
            AI-powered blueprints and validation sprints for ambitious founders.
          </p>
        </div>

        {/* Column 2: Links */}
        <div className="flex flex-col items-center md:items-start space-y-2">
          <h4 className="text-lg font-bold text-foreground mb-2">Company</h4>
          <Link
            href="/about"
            className="text-base text-muted-foreground hover:text-primary transition-colors"
          >
            About Us
          </Link>
          <Link
            href="/faq"
            className="text-base text-muted-foreground hover:text-primary transition-colors"
          >
            FAQ
          </Link>
          <a
            href="https://forms.gle/WVLZzKtFYLvb7Xkg9"
            target="_blank"
            rel="noopener noreferrer"
            className="text-base text-muted-foreground hover:text-primary transition-colors"
          >
            Feedback
          </a>
        </div>

        {/* Column 3: Social & Copyright */}
        <div className="flex flex-col items-center md:items-end">
          {/* Optional: Social Media Icons */}
          <div className="flex space-x-4 mb-4">
            <a
              href="https://github.com/mansaraysaheedalpha/ideaspark"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Visit our GitHub repository"
            >
              <FaGithub size={20} />
            </a>
            <a
              href="https://twitter.com/your-profile"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Follow us on Twitter"
            >
              <FaTwitter size={20} />
            </a>
            <a
              href="https://linkedin.com/your-profile"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Connect on LinkedIn"
            >
              <FaLinkedin size={20} />
            </a>
          </div>
          <p className="text-base text-muted-foreground mt-auto">
            © {currentYear} NeuraLaunch. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
