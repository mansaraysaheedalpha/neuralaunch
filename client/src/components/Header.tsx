"use client";

import Link from "next/link";
import LoginButton from "./LoginButton";
import ThemeSwitcher from "./ThemeSwitcher";

export default function Header() {
  return (
    <header className="pt-6 pb-4 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex items-center justify-between">
        {/* We'll wrap the Link in a `div` and add the `group` class */}
        <div className="group">
          <Link href="/" className="flex items-center space-x-3">
            {/* The Logo Icon */}
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center transition-all duration-300 group-hover:shadow-lg group-hover:shadow-primary/30">
                {/* Add transition and group-hover effects to the SVG */}
                <svg
                  className="w-7 h-7 text-white transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
            </div>
            {/* The Text */}
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                IdeaSpark
              </h1>
              <p className="text-xs text-muted-foreground">
                AI-Powered Startup Ideas
              </p>
            </div>
          </Link>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-4">
          <ThemeSwitcher />
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
