//client/src/app/(app)/layout.tsx
"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-dvh w-full bg-background">
      {/* We only render the Sidebar ONCE. It will handle its own mobile/desktop visibility. */}
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setSidebarOpen={setSidebarOpen}
        isMobileMenuOpen={isMobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
