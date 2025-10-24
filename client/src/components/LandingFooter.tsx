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

        {/* Column 2: Links (Example) */}
        <div className="flex flex-col items-center md:items-start space-y-2">
          <h4 className="text-lg font-bold text-foreground mb-2">Legal</h4>
          {/* Add actual links when pages exist */}
          <Link
            href="/privacy-policy"
            className="text-base text-muted-foreground hover:text-primary transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms-of-service"
            className="text-base text-muted-foreground hover:text-primary transition-colors"
          >
            Terms of Service
          </Link>
          <Link
            href="/contact"
            className="text-base text-muted-foreground hover:text-primary transition-colors"
          >
            Contact Us
          </Link>
        </div>

        {/* Column 3: Social & Copyright */}
        <div className="flex flex-col items-center md:items-end">
          {/* Optional: Social Media Icons */}
          <div className="flex space-x-4 mb-4">
            <a
              href="https://github.com/your-repo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <FaGithub size={20} />
            </a>
            <a
              href="https://twitter.com/your-profile"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <FaTwitter size={20} />
            </a>
            <a
              href="https://linkedin.com/your-profile"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
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
