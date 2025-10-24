//client/components/MainLayout
"use client"; // Needs to be a client component because it uses state (useState)

import { useState } from "react";
import Sidebar from "@/components/Sidebar"; // Assuming path is correct

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-dvh w-full bg-background">
      {/* Sidebar for app pages */}
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setSidebarOpen={setSidebarOpen}
        isMobileMenuOpen={isMobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      {/* Main Content Area within the app */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header for app pages */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
