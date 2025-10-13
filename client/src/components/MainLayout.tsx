"use client";

import { useState, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { ImperativePanelGroupHandle } from "react-resizable-panels";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const panelGroupRef = useRef<ImperativePanelGroupHandle>(null);

  return (
    <PanelGroup
      ref={panelGroupRef}
      direction="horizontal"
      className="h-screen w-full bg-background"
    >
      <Panel
        id="sidebar" // Give the panel an ID to control it
        defaultSize={20}
        minSize={15}
        maxSize={25}
        collapsible={true}
        onCollapse={() => setIsCollapsed(true)}
        onExpand={() => setIsCollapsed(false)}
        className="hidden md:flex"
      >
        {/* Pass down the state and the ref to the Sidebar component */}
        <Sidebar isCollapsed={isCollapsed} panelGroupRef={panelGroupRef} />
      </Panel>

      <PanelResizeHandle className="w-[1px] bg-border hidden md:block" />

      <Panel defaultSize={80} className="flex flex-col flex-1 h-full">
        <div className="flex flex-col flex-1 h-full isolate">
          <Header />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </Panel>
    </PanelGroup>
  );
}
