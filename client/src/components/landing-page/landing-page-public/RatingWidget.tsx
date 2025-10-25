"use client";

import { useState } from "react";
import React from "react";

type FeedbackType = "problem_rating" | "solution_rating" | (string & {});

interface RatingWidgetProps {
  landingPageSlug: string;
  primaryColor: string;
  feedbackType: FeedbackType; // Allow specific types while permitting other strings
  question: string;
}

// Helper function to get sessionId
function getSessionIdForFeedback(): string | undefined {
  if (typeof window !== "undefined") {
    return localStorage.getItem("neurallaunch_session_id") || undefined;
  }
  return undefined;
}

export default function RatingWidget({
  landingPageSlug,
  primaryColor,
  feedbackType,
  question,
}: RatingWidgetProps) {
  const [rating, setRating] = useState<number>(5);
  const [hasRated, setHasRated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRatingSubmit = async () => {
    setIsSubmitting(true);
    try {
      await fetch("/api/landing-page/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingPageSlug: landingPageSlug,
          sessionId: getSessionIdForFeedback(),
          feedbackType: feedbackType, // Use prop
          value: rating.toString(), // Use state
        }),
      });
      setHasRated(true); // Show thank you message
    } catch (error) {
      console.error("Failed to submit rating:", error);
      setIsSubmitting(false); // Allow retry
    }
  };

  if (hasRated) {
    return <p className="mt-6 text-sm opacity-70">Thanks for your feedback!</p>;
  }

  return (
    <div
      className="mt-6 p-4 border rounded-lg"
      style={{ borderColor: `${primaryColor}30` }}
    >
      <label
        htmlFor={feedbackType}
        className="block text-sm font-medium opacity-80 mb-2"
      >
        {question} {/* Use prop */}
      </label>
      <div className="flex items-center gap-3">
        <span className="text-xs opacity-60">Not at all</span>
        <input
          id={feedbackType}
          type="range"
          min="0"
          max="10"
          step="1"
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-lp-primary/20 accent-lp-primary"
          style={{ accentColor: primaryColor }}
        />
        <span className="text-xs opacity-60">Very!</span> {/* Changed label */}
      </div>
      <div className="text-center mt-2">
        <span className="text-lg font-semibold" style={{ color: primaryColor }}>
          {rating}
        </span>
        <span className="text-xs opacity-60"> / 10</span>
      </div>
      <button
        onClick={() => void handleRatingSubmit()}
        disabled={isSubmitting}
        className="mt-3 px-4 py-1.5 text-sm font-semibold rounded-md transition-opacity disabled:opacity-50"
        style={{ backgroundColor: primaryColor, color: "var(--lp-bg)" }}
      >
        {isSubmitting ? "Submitting..." : "Submit Rating"}
      </button>
    </div>
  );
}
