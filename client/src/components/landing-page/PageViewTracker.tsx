// components/landing-page/PageViewTracker.tsx
// PRODUCTION-READY page view tracking
"use client";

import { useEffect, useRef, useCallback } from "react";

interface PageViewTrackerProps {
  landingPageSlug: string;
}

export default function PageViewTracker({
  landingPageSlug,
}: PageViewTrackerProps) {
  const hasTracked = useRef(false);
  const sessionId = useRef<string>("");
  const startTime = useRef<number>(Date.now());
  const maxScroll = useRef<number>(0);

  const trackPageView = useCallback(async () => {
    try {
      await fetch("/api/landing-page/track-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingPageSlug,
          sessionId: sessionId.current,
          referrer: document.referrer || undefined,
          utmSource: getUrlParam("utm_source"),
          utmMedium: getUrlParam("utm_medium"),
          utmCampaign: getUrlParam("utm_campaign"),
          // Note: ctaClicked and timeOnPage are sent on other events
        }),
      });
      // console.log("Initial page view tracked.");
    } catch (error: unknown) {
      console.error(
        "Failed to track page view:",
        error instanceof Error ? error.message : error
      );
    }
  }, [landingPageSlug]);

  useEffect(() => {
    if (!sessionId.current) {
      sessionId.current = getOrCreateSessionId();
    }

    if (!hasTracked.current) {
      void trackPageView();
      hasTracked.current = true;
    }

    const handleScroll = () => {
       // Check for valid scrollHeight/innerHeight to avoid divide-by-zero
       const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
       if (scrollHeight <= 0) return; // Page is not scrollable

       const scrollPercentage = Math.round(
         (window.scrollY / scrollHeight) * 100
       );
       maxScroll.current = Math.max(maxScroll.current, scrollPercentage > 100 ? 100 : scrollPercentage); // Clamp at 100
    };

    const handleBeforeUnload = () => {
      const timeOnPage = Math.round((Date.now() - startTime.current) / 1000);

      // Use sendBeacon for reliable tracking on page unload
      // This sends a complete, separate event with the session summary
      navigator.sendBeacon(
        "/api/landing-page/track-view",
        JSON.stringify({
          landingPageSlug,
          sessionId: sessionId.current,
          timeOnPage, // <<< Sends Avg. Time data
          scrollDepth: maxScroll.current,
          referrer: document.referrer,
          utmSource: getUrlParam("utm_source"),
          utmMedium: getUrlParam("utm_medium"),
          utmCampaign: getUrlParam("utm_campaign"),
        })
      );
    };

    window.addEventListener("scroll", handleScroll);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [landingPageSlug, trackPageView]);
  
  return null;
}

// Helper functions
function getOrCreateSessionId(): string {
  // --- FIX: Updated storage key name ---
  const STORAGE_KEY = "neurallaunch_session_id";
  // ------------------------------------

  if (typeof window === "undefined") {
    return generateSessionId();
  }

  let sessionId = localStorage.getItem(STORAGE_KEY);

  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem(STORAGE_KEY, sessionId);
  }

  return sessionId;
}

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

function getUrlParam(param: string): string | undefined {
  if (typeof window === "undefined") return undefined;

  const urlParams = new URLSearchParams(window.location.search);
  const value = urlParams.get(param);
  return value ? value : undefined; // Return undefined if null or empty string
}