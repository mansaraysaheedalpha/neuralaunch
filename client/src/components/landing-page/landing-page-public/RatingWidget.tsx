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
      className="mt-6 p-4 sm:p-6 border rounded-lg"
      style={{ borderColor: `${primaryColor}30` }}
    >
      <label
        htmlFor={feedbackType}
        className="block text-sm sm:text-base font-medium opacity-80 mb-3"
      >
        {question} {/* Use prop */}
      </label>
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="text-xs opacity-60 whitespace-nowrap">Not at all</span>
        <div className="relative flex-1">
          <input
            id={feedbackType}
            type="range"
            min="0"
            max="10"
            step="1"
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${primaryColor} 0%, ${primaryColor} ${(rating / 10) * 100}%, ${primaryColor}20 ${(rating / 10) * 100}%, ${primaryColor}20 100%)`,
            }}
          />
          <style jsx>{`
            input[type="range"]::-webkit-slider-thumb {
              appearance: none;
              width: 20px;
              height: 20px;
              border-radius: 50%;
              background: ${primaryColor};
              cursor: pointer;
              border: 3px solid white;
              box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            }
            input[type="range"]::-moz-range-thumb {
              width: 20px;
              height: 20px;
              border-radius: 50%;
              background: ${primaryColor};
              cursor: pointer;
              border: 3px solid white;
              box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            }
          `}</style>
        </div>
        <span className="text-xs opacity-60 whitespace-nowrap">Very!</span> {/* Changed label */}
      </div>
      <div className="text-center mt-3">
        <span className="text-xl sm:text-2xl font-semibold" style={{ color: primaryColor }}>
          {rating}
        </span>
        <span className="text-sm opacity-60"> / 10</span>
      </div>
      <button
        onClick={() => void handleRatingSubmit()}
        disabled={isSubmitting}
        className="mt-4 w-full sm:w-auto px-6 py-2.5 text-sm font-semibold rounded-md transition-opacity disabled:opacity-50 hover:opacity-90"
        style={{ backgroundColor: primaryColor, color: "var(--lp-bg)" }}
      >
        {isSubmitting ? "Submitting..." : "Submit Rating"}
      </button>
    </div>
  );
}
