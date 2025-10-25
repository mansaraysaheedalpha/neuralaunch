//src/components/landing-page/CalendlyEmbed.tsx

"use client";

import React from "react";
import { InlineWidget } from "react-calendly";
import { motion } from "framer-motion";

interface CalendlyEmbedProps {
  calendlyUrl: string | null | undefined;
}

const CalendlyEmbed: React.FC<CalendlyEmbedProps> = ({ calendlyUrl }) => {
  // Do not render the component if the URL is not provided
  if (!calendlyUrl) {
    return null;
  }

  return (
    <section
      className="py-20 border-t"
      style={{ borderColor: "var(--lp-primary-20, rgba(128,128,128,0.2))" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        className="max-w-3xl mx-auto px-4 text-center"
      >
        <h2
          className="text-3xl md:text-4xl font-bold mb-4"
          style={{ color: "var(--lp-text)" }}
        >
          Schedule a 15-Minute Chat
        </h2>
        <p
          className="text-lg opacity-80 mb-8"
          style={{ color: "var(--lp-text)" }}
        >
          Have questions or feedback? Book a time to chat directly with the
          founder.
        </p>

        <div
          className="rounded-xl overflow-hidden shadow-lg border"
          style={{ borderColor: "var(--lp-primary-20, rgba(128,128,128,0.2))" }}
        >
          <InlineWidget
            url={calendlyUrl}
            styles={{
              height: "700px",
              minWidth: "320px",
            }}
          />
        </div>
      </motion.div>
    </section>
  );
};

export default CalendlyEmbed;