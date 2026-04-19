'use client';
// src/components/Sidebar.tsx
//
// Slim compositor — owns the layout shell (mobile overlay vs desktop
// rail), delegates everything else to focused sub-components under
// src/components/sidebar/. The useEffect+fetch+zustand pattern for
// conversation loading is replaced by useConversationsList (SWR).

import { Fragment } from 'react';
import { useSession } from 'next-auth/react';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { SidebarNav } from './sidebar/SidebarNav';
import { ConversationList } from './sidebar/ConversationList';
import { CollapsedSidebar } from './sidebar/CollapsedSidebar';
import { SidebarUserCard } from './sidebar/SidebarUserCard';
import { useConversationsList } from './sidebar/useConversationsList';

interface SidebarProps {
  isSidebarOpen: boolean;
  setSidebarOpen: (isOpen: boolean) => void;
  isMobileMenuOpen: boolean;
  setMobileMenuOpen: (isOpen: boolean) => void;
}

export default function Sidebar({
  isSidebarOpen,
  setSidebarOpen,
  isMobileMenuOpen,
  setMobileMenuOpen,
}: SidebarProps) {
  const { status } = useSession();
  const isAuthed = status === 'authenticated';
  const { conversations, isLoading, removeFromCache } = useConversationsList(isAuthed);

  const closeMobile = () => setMobileMenuOpen(false);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-card text-card-foreground border-r border-border">
      <SidebarHeader
        onCollapse={() => setSidebarOpen(false)}
        onCloseMobile={closeMobile}
      />
      <SidebarNav onNavigate={closeMobile} />

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 border-t border-border">
        <ConversationList
          conversations={conversations}
          isLoading={isLoading}
          isAuthed={isAuthed}
          onClose={closeMobile}
          onDelete={removeFromCache}
        />
      </div>

      {/* Footer — user identity + plan pill + Free-tier upgrade CTA. */}
      <div className="p-2 border-t border-border flex-shrink-0">
        <SidebarUserCard />
      </div>
    </div>
  );

  return (
    <Fragment>
      {/* MOBILE SIDEBAR OVERLAY */}
      <div
        className={`md:hidden fixed inset-0 z-40 ${
          isMobileMenuOpen ? 'block' : 'hidden'
        }`}
      >
        <div
          onClick={closeMobile}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <div className="relative w-80 h-full bg-card flex flex-col">
          {sidebarContent}
        </div>
      </div>
      {/* DESKTOP SIDEBAR CONTAINER */}
      <div
        className={`hidden md:flex flex-col h-full transition-all duration-300 ${
          isSidebarOpen ? 'w-80' : 'w-20'
        }`}
      >
        {isSidebarOpen
          ? sidebarContent
          : <CollapsedSidebar onExpand={() => setSidebarOpen(true)} />}
      </div>
    </Fragment>
  );
}
