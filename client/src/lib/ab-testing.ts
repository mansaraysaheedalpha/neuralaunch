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
    // Generate a simple random ID
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(storageKey, sessionId);
  }

  return sessionId;
}

/**
 * Track which variant was shown to the user.
 * Uses sendBeacon for reliable tracking even when user navigates away.
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

  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    // Use sendBeacon for reliable tracking
    // Create a Blob with proper content-type for sendBeacon
    const blob = new Blob([data], { type: "application/json" });
    const success = navigator.sendBeacon("/api/landing-page/ab-test-track", blob);
    
    if (!success) {
      console.error("[AB_TEST_TRACKING_ERROR] sendBeacon failed");
    }
  } else {
    // Fallback to fetch for older browsers
    void fetch("/api/landing-page/ab-test-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: data,
    }).catch((error) => {
      console.error("[AB_TEST_TRACKING_ERROR]", error);
    });
  }
}
