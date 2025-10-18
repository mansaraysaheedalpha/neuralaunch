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
          sessionId: sessionId.current, // Use sessionId ref directly
          referrer: document.referrer || undefined, // Handle empty referrer
          utmSource: getUrlParam("utm_source"),
          utmMedium: getUrlParam("utm_medium"),
          utmCampaign: getUrlParam("utm_campaign"),
        }),
      });
      // console.log("Initial page view tracked."); // Optional logging
    } catch (error: unknown) {
      // Type error
      console.error(
        "Failed to track page view:",
        error instanceof Error ? error.message : error
      );
    }
  }, [landingPageSlug]); // Dependency array includes props used inside

  useEffect(() => {
    // Get session ID (runs only once on mount essentially)
    if (!sessionId.current) {
      sessionId.current = getOrCreateSessionId();
    }

    // --- FIX: Handle floating promise and add dependency ---
    // Track initial page view if not already tracked
    if (!hasTracked.current) {
      void trackPageView(); // Use void to handle the promise
      hasTracked.current = true;
    }

    const handleScroll = () => {
      const scrollPercentage = Math.round(
        (window.scrollY /
          (document.documentElement.scrollHeight - window.innerHeight)) *
          100
      );
      maxScroll.current = Math.max(maxScroll.current, scrollPercentage);
    };

    // Track time on page before leaving
    const handleBeforeUnload = () => {
      const timeOnPage = Math.round((Date.now() - startTime.current) / 1000);

      // Use sendBeacon for reliable tracking on page unload
      navigator.sendBeacon(
        "/api/landing-page/track-view",
        JSON.stringify({
          landingPageSlug,
          sessionId: sessionId.current,
          timeOnPage,
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
  const STORAGE_KEY = "ideaspark_session_id";

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
  return urlParams.get(param) || undefined;
}
