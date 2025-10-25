"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";

// --- Types ---
type Feature = {
  title: string;
  description: string;
  icon: string; // Assuming icon is an emoji string
};

interface FeaturePrioritizationProps {
  landingPageSlug: string;
  features: Feature[];
  // Props to receive dynamic theme colors from parent
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
}

// --- Component ---
const FeaturePrioritization: React.FC<FeaturePrioritizationProps> = ({
  landingPageSlug,
  features,
  primaryColor,
  backgroundColor,
  textColor,
}) => {
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!selectedTitle) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/landing-page/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingPageSlug: landingPageSlug,
          feedbackType: "feature_vote",
          value: selectedTitle,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }
      setHasVoted(true);
    } catch (err) {
      console.error("Failed to submit feature vote:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Render ---

  // 1. Thank You State
  if (hasVoted) {
    return (
      <section
        className="w-full max-w-4xl mx-auto p-4 sm:p-6 md:p-8 py-8 sm:py-10 md:py-12 text-center rounded-lg"
        style={{ color: textColor }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: primaryColor }}>
            Thanks for your feedback!
          </h2>
          <p className="mt-2 text-base sm:text-lg opacity-90">
            Your input helps us build what matters most.
          </p>
        </motion.div>
      </section>
    );
  }

  // 2. Voting State
  return (
    <section
      className="w-full max-w-4xl mx-auto p-4 sm:p-6 md:p-8 py-8 sm:py-10 md:py-12"
      style={{ color: textColor }}
    >
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-8 sm:mb-10"
        style={{ color: textColor }} // Ensure heading uses text color
      >
        Which feature matters most to you?
      </motion.h2>

      {/* Feature Cards Grid */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.1 } },
        }}
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-10"
      >
        {features.map((feature) => {
          const isSelected = selectedTitle === feature.title;
          return (
            <motion.button
              key={feature.title}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              onClick={() => setSelectedTitle(feature.title)}
              className={`w-full p-4 sm:p-6 rounded-2xl text-left cursor-pointer transition-all border-2
                ${
                  isSelected
                    ? "shadow-lg ring-2 ring-offset-2"
                    : "shadow-md hover:shadow-lg"
                }`}
              style={{
                backgroundColor: backgroundColor, // Use dynamic bg
                borderColor: isSelected
                  ? primaryColor
                  : "rgba(128, 128, 128, 0.2)",
                color: textColor, // Ensure text color is set
                // Note: ring color is controlled via Tailwind's ring-2 class
              }}
              whileHover={{ y: -5 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <span className="text-3xl sm:text-4xl" role="img" aria-label={feature.title}>
                {feature.icon}
              </span>
              <h3
                className="text-lg sm:text-xl font-semibold mt-3 sm:mt-4 mb-2"
                style={{ color: textColor }}
              >
                {feature.title}
              </h3>
              <p className="text-xs sm:text-sm opacity-80">{feature.description}</p>
            </motion.button>
          );
        })}
      </motion.div>

      {/* Submit Button */}
      <div className="text-center">
        <motion.button
          onClick={() => void handleSubmit()}
          disabled={!selectedTitle || isSubmitting}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-8 sm:px-10 py-2.5 sm:py-3 rounded-lg font-semibold text-base sm:text-lg transition-all 
                     disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          style={{
            backgroundColor: primaryColor,
            color: backgroundColor, // Use dynamic bg color for text
          }}
        >
          {isSubmitting ? "Submitting..." : "Submit Vote"}
        </motion.button>
        {error && <p className="text-red-500 mt-4 text-xs sm:text-sm">{error}</p>}
      </div>
    </section>
  );
};

export default FeaturePrioritization;
