/**
 * Selects a variant from a list based on a session ID for consistency.
 * This ensures the same user always sees the same variant.
 * If no sessionId is provided, it falls back to random selection.
 */
export function getABTestVariant(
  variants: string[],
  sessionId?: string
): string {
  if (!variants || variants.length === 0) {
    return ""; // Should not happen
  }

  if (variants.length === 1) {
    return variants[0];
  }

  // If sessionId is provided, use it for deterministic selection
  if (sessionId) {
    // Simple hash function to convert sessionId to a number
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      const char = sessionId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    const index = Math.abs(hash) % variants.length;
    return variants[index];
  }

  // Fallback to random selection
  const randomIndex = Math.floor(Math.random() * variants.length);
  return variants[randomIndex];
}

/**
 * Helper to get or create a session ID for A/B testing consistency.
 * Uses the same session ID as page view tracking for consistency.
 */
export function getABTestSessionId(): string {
  if (typeof window === "undefined") return "";

  // Use the same session ID as page view tracking for consistency
  const storageKey = "neurallaunch_session_id";
  let sessionId = localStorage.getItem(storageKey);

  if (!sessionId) {
    // Generate a cryptographically secure random ID
    // Use crypto.randomUUID if available (modern browsers), otherwise fall back to crypto.getRandomValues
    if (crypto && crypto.randomUUID) {
      sessionId = `session_${Date.now()}_${crypto.randomUUID()}`;
    } else if (crypto && crypto.getRandomValues) {
      // Generate secure random bytes and convert to base36 string
      const array = new Uint8Array(16);
      crypto.getRandomValues(array);
      const randomStr = Array.from(array)
        .map((b) => b.toString(36))
        .join("")
        .substring(0, 15);
      sessionId = `session_${Date.now()}_${randomStr}`;
    } else {
      // Fallback for very old browsers (should rarely happen)
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
    localStorage.setItem(storageKey, sessionId);
  }

  return sessionId;
}

/**
 * Track which variant was shown to the user.
 * Uses sendBeacon for reliable tracking even when user navigates away.
 * Falls back to fetch if sendBeacon fails or is unavailable.
 */
export function trackABTestVariant(
  landingPageSlug: string,
  testName: string,
  variant: string,
  sessionId: string
): void {
  const data = JSON.stringify({
    landingPageSlug,
    testName,
    variant,
    sessionId,
  });

  // Helper function for fetch fallback
  const sendWithFetch = () => {
    void fetch("/api/landing-page/ab-test-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: data,
    }).catch((error) => {
      console.error("[AB_TEST_TRACKING_ERROR]", error);
    });
  };

  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    // Try sendBeacon first for reliability
    try {
      const blob = new Blob([data], { type: "application/json" });
      const success = navigator.sendBeacon("/api/landing-page/ab-test-track", blob);
      
      if (!success) {
        // sendBeacon failed (queue full or other issue), fallback to fetch
        console.warn("[AB_TEST_TRACKING] sendBeacon failed, using fetch fallback");
        sendWithFetch();
      }
    } catch (error) {
      // sendBeacon threw an error, fallback to fetch
      console.error("[AB_TEST_TRACKING] sendBeacon error:", error);
      sendWithFetch();
    }
  } else {
    // sendBeacon not available (older browser), use fetch
    sendWithFetch();
  }
}
