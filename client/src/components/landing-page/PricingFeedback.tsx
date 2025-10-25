"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";

// --- Types ---
export interface PricingTier {
  name: string;
  price: string;
  description: string;
}

interface PricingFeedbackProps {
  landingPageSlug: string;
  tiers: PricingTier[];
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
}

// --- Component ---
const PricingFeedback: React.FC<PricingFeedbackProps> = ({
  landingPageSlug,
  tiers,
  primaryColor,
  backgroundColor,
  textColor,
}) => {
  const [selectedTierName, setSelectedTierName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!selectedTierName) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/landing-page/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingPageSlug: landingPageSlug,
          feedbackType: "pricing_vote",
          value: selectedTierName,
        }),
      });
      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }
      setHasVoted(true);
    } catch (err) {
      console.error("Failed to submit pricing vote:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Render ---

  if (hasVoted) {
    return (
      <section
        className="w-full max-w-4xl mx-auto p-8 py-12 text-center rounded-lg"
        style={{ color: textColor }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <h2 className="text-3xl font-bold" style={{ color: primaryColor }}>
            Got it, thank you!
          </h2>
          <p className="mt-2 text-lg opacity-90">
            Your pricing feedback is extremely helpful.
          </p>
        </motion.div>
      </section>
    );
  }

  return (
    <section
      className="w-full max-w-5xl mx-auto p-8 py-12" // Made slightly wider
      style={{ color: textColor }}
    >
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        className="text-3xl md:text-4xl font-bold text-center mb-10"
        style={{ color: textColor }}
      >
        Which plan seems right for you?
      </motion.h2>

      {/* Tiers Grid */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.1 } },
        }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10"
      >
        {tiers.map((tier) => {
          const isSelected = selectedTierName === tier.name;
          return (
            <motion.button
              key={tier.name}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              onClick={() => setSelectedTierName(tier.name)}
              className={`w-full p-6 rounded-2xl text-left cursor-pointer transition-all border-2
                ${
                  isSelected
                    ? "shadow-lg ring-2 ring-offset-2"
                    : "shadow-md hover:shadow-lg"
                }`}
              style={{
                backgroundColor: backgroundColor,
                borderColor: isSelected
                  ? primaryColor
                  : "rgba(128, 128, 128, 0.2)",
                color: textColor,
                // Note: ring color is controlled via Tailwind's ring-2 class
              }}
              whileHover={{ y: -5 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <h3
                className="text-xl font-semibold mb-2"
                style={{ color: primaryColor }}
              >
                {tier.name}
              </h3>
              <p
                className="text-3xl font-bold mb-3"
                style={{ color: textColor }}
              >
                {tier.price}
              </p>
              <p className="text-sm opacity-80">{tier.description}</p>
            </motion.button>
          );
        })}
      </motion.div>

      {/* Submit Button */}
      <div className="text-center">
        <motion.button
          onClick={() => void handleSubmit()}
          disabled={!selectedTierName || isSubmitting}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-10 py-3 rounded-lg font-semibold text-lg transition-all 
                     disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: primaryColor,
            color: backgroundColor,
          }}
        >
          {isSubmitting ? "Submitting..." : "Submit Choice"}
        </motion.button>
        {error && <p className="text-red-500 mt-4 text-sm">{error}</p>}
      </div>
    </section>
  );
};

export default PricingFeedback;
