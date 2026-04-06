'use client';
// src/app/(app)/discovery/validation/[pageId]/PreviewFrame.tsx

import { useState, useCallback, createContext, useContext } from 'react';

interface PreviewFrameContextValue {
  /** Force the preview iframe to reload from the server */
  reload: () => void;
}

const PreviewFrameContext = createContext<PreviewFrameContextValue | null>(null);

/**
 * usePreviewFrameReload
 *
 * Any descendant of PreviewFrameProvider can call reload() to force the
 * preview iframe to re-render with the latest page content after a
 * regeneration.
 */
export function usePreviewFrameReload(): () => void {
  const ctx = useContext(PreviewFrameContext);
  return ctx?.reload ?? (() => { /* no-op */ });
}

interface PreviewFrameProps {
  slug:     string;
  children: React.ReactNode;
}

/**
 * PreviewFrame
 *
 * Client island that owns the iframe and exposes a reload() callback via
 * React context. The `key` prop forces a clean remount whenever reload()
 * is invoked, guaranteeing a fresh request to /lp/[slug].
 */
export function PreviewFrame({ slug, children }: PreviewFrameProps) {
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setReloadKey(k => k + 1);
  }, []);

  return (
    <PreviewFrameContext.Provider value={{ reload }}>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden border-r border-border">
          <iframe
            key={reloadKey}
            src={`/lp/${slug}`}
            className="h-full w-full"
            title="Validation page preview"
          />
        </div>
        <div className="w-72 shrink-0 overflow-y-auto p-6 flex flex-col gap-6">
          {children}
        </div>
      </div>
    </PreviewFrameContext.Provider>
  );
}
