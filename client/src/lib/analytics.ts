// This function sends a custom event to Google Analytics.
// --- Add this declaration at the top ---
// This tells TypeScript that the global Window object might have a gtag function.
declare global {
  interface Window {
    gtag?: (
      command: "config" | "event" | "set" | "js",
      targetIdOrEventName: string,
      // Use more specific types instead of 'any' for params value
      params?: { [key: string]: string | number | boolean | undefined }
    ) => void;
  }
}
// ----------------------------------------

// This function sends a custom event to Google Analytics.
// It checks if the `gtag` function is available on the window object before sending.
export const trackEvent = (
  eventName: string,
  eventParams?: { [key: string]: string | number | undefined } // Allow undefined for userId
) => {
  // Check if we're in the browser and if gtag is available.
  if (typeof window !== "undefined" && typeof window.gtag === 'function') { // Added typeof check
    window.gtag("event", eventName, eventParams);
    console.log(`🚀 GA Event Tracked: ${eventName}`, eventParams || "");
  } else {
    console.log(`Analytics not available. Skipped event: ${eventName}`);
  }
};

