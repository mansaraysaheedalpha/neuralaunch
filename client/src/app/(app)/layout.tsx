// src/app/(app)/layout.tsx
"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import { Sparkles } from "lucide-react"; // Keep Sparkles icon

// Renamed function to AppLayout for clarity
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-dvh w-full bg-background">
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setSidebarOpen={setSidebarOpen}
        isMobileMenuOpen={isMobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* --- Header component is completely removed --- */}

        {/* Standalone Hamburger Button (Always shown on mobile for app pages) */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden absolute top-4 left-4 z-30 p-2 rounded-lg hover:bg-muted text-foreground" // Position top-left
          aria-label="Open menu"
        >
          <Sparkles className="w-6 h-6" />
        </button>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pt-16 md:pt-0">
          {" "}
          {/* Always add pt-16 on mobile, remove on md+ */}
          {children}
        </main>
      </div>
    </div>
  );
}
